import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  semanticHash,
  validateAgainstSchema,
  type TraceLink,
  type TraceStatus,
} from "@sysml-fhir-bridge/model-core";
import { FixtureSysmlService } from "@sysml-fhir-bridge/sysml-v2-client";
import { R5Adapter } from "@sysml-fhir-bridge/fhir-adapter";
import {
  createTraceLink,
  evaluateTrace,
  TraceStore,
  type TraceEvaluationContext,
} from "@sysml-fhir-bridge/trace-engine";
import { loadRuleset, transformSysmlToFhir } from "@sysml-fhir-bridge/mapping-engine";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const PROJECT_ID = "medical-system-foundation";
const BASELINE_COMMIT = "sysml-8df65f0d";
const SEEDED_AT = "2027-03-18T16:22:00Z";

export interface ApiContext {
  sysml: FixtureSysmlService;
  store: TraceStore;
}

/**
 * SysML–FHIR Bridge cross-domain REST surface (design doc, "REST contracts").
 * Deliberately NOT a clone of the OMG SysML API or FHIR REST — it exposes the
 * trace/transform/impact services layered above both.
 */
export async function buildContext(): Promise<ApiContext> {
  const sysml = FixtureSysmlService.fromFile(
    path.join(ROOT, "models/examples/exmc-ultrasound/model.json"),
  );
  const ruleset = loadRuleset(path.join(ROOT, "models/mappings/exmc-mappings.json"));
  const fhir = new R5Adapter("https://example.org/fhir/exmc");
  const store = new TraceStore();

  const elements = await sysml.listElements(PROJECT_ID, BASELINE_COMMIT);
  const byId = new Map(elements.map((e) => [e.elementId, e]));
  const transform = transformSysmlToFhir(elements, ruleset, fhir, {
    profileVersion: "0.4.0",
    observationProfileName: "exmc-physiology-observation",
    exampleTimestamp: SEEDED_AT,
  });
  for (const mapping of transform.generated) {
    const element = byId.get(mapping.sourceElementId);
    if (!element) continue;
    store.add(
      createTraceLink({
        source: {
          standard: "sysml-v2",
          projectId: PROJECT_ID,
          commitId: BASELINE_COMMIT,
          elementId: mapping.sourceElementId,
          qualifiedName: element.qualifiedName,
        },
        relationship: mapping.relationship,
        target: mapping.target,
        mappingRuleId: mapping.ruleId,
        mappingRuleVersion: mapping.ruleVersion,
        semanticConfidence: mapping.semanticConfidence,
        sourceHash: semanticHash(element),
        targetHash: semanticHash(mapping.resource ?? mapping.target),
        provenanceId: "tx-api-seed",
        createdAt: SEEDED_AT,
        createdBy: "sysml-fhir-bridge-api",
      }),
    );
  }
  return { sysml, store };
}

export function createApiServer(ctx: ApiContext): Server {
  return createServer((req, res) => {
    handle(ctx, req, res).catch((error: unknown) => {
      sendJson(res, 500, { error: String(error) });
    });
  });
}

async function handle(
  ctx: ApiContext,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const segments = url.pathname.split("/").filter(Boolean);

  if (segments[0] !== "v1") {
    sendJson(res, 404, { error: "unknown route; API base is /v1" });
    return;
  }

  // GET /v1/traces  |  GET /v1/traces/{id}  |  POST /v1/traces  |  PATCH /v1/traces/{id}
  if (segments[1] === "traces") {
    const traceId = segments[2];
    if (req.method === "GET" && traceId === undefined) {
      const status = url.searchParams.get("status");
      let traces = ctx.store.active();
      if (status) traces = traces.filter((t) => t.status === status);
      sendJson(res, 200, { traces });
      return;
    }
    if (req.method === "GET" && traceId !== undefined) {
      const trace = ctx.store.get(traceId);
      if (!trace) sendJson(res, 404, { error: `unknown trace ${traceId}` });
      else sendJson(res, 200, trace);
      return;
    }
    if (req.method === "POST" && traceId === undefined) {
      const body = await readJson(req);
      const outcome = validateAgainstSchema("trace-link", body);
      if (!outcome.valid) {
        sendJson(res, 422, { error: "trace-link schema validation failed", details: outcome.errors });
        return;
      }
      try {
        const trace = ctx.store.add(body as TraceLink);
        sendJson(res, 201, trace);
      } catch (error) {
        sendJson(res, 409, { error: String(error) });
      }
      return;
    }
    if (req.method === "PATCH" && traceId !== undefined) {
      const body = (await readJson(req)) as {
        status?: TraceStatus;
        reason?: string;
        at?: string;
        by?: string;
      };
      if (!body.status) {
        sendJson(res, 400, { error: "PATCH body requires { status }" });
        return;
      }
      try {
        const trace = ctx.store.transition(
          traceId,
          body.status,
          body.reason,
          body.at ?? SEEDED_AT,
          body.by ?? "api-client",
        );
        sendJson(res, 200, trace);
      } catch (error) {
        sendJson(res, 409, { error: String(error) });
      }
      return;
    }
  }

  // GET /v1/impact/sysml/{projectId}/{commitId}/{elementId}
  if (
    segments[1] === "impact" &&
    segments[2] === "sysml" &&
    segments.length === 6 &&
    req.method === "GET"
  ) {
    const [, , , projectId, commitId, elementId] = segments as [
      string, string, string, string, string, string,
    ];
    const element = await ctx.sysml.getElement(projectId, commitId, elementId);
    const traces = ctx.store.bySourceElement(projectId, elementId);
    const evaluations = traces.map((trace) => {
      const evalCtx: TraceEvaluationContext = { sourceExists: element !== undefined };
      if (element) evalCtx.currentSourceHash = semanticHash(element);
      const evaluation = evaluateTrace(trace, evalCtx);
      return { traceId: trace.id, currentStatus: trace.status, evaluation };
    });
    sendJson(res, 200, { projectId, commitId, elementId, elementExists: element !== undefined, evaluations });
    return;
  }

  sendJson(res, 404, { error: `no handler for ${req.method} ${url.pathname}` });
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  return text.length === 0 ? {} : (JSON.parse(text) as unknown);
}
