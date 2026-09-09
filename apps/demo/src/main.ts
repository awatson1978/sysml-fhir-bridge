/**
 * SysML–FHIR Bridge first vertical slice (design doc, "Minimum viable demonstration"):
 *
 *   SysML requirement -> medical device part -> modeled metric -> TraceLink
 *   -> FHIR Device / DeviceMetric / Observation profile+example
 *   -> generated ICD -> verification case -> provenance -> baseline manifest,
 *
 * then an impact pass against a second SysML commit demonstrating staleness
 * (requirement text changed) and invalidation (metric element deleted).
 *
 * Every artifact under generated/ is a deterministic projection of
 * models/ + this pipeline. Re-run with: npm run demo
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  assertValid,
  semanticHash,
  sha256Hex,
  type BaselineManifest,
  type GeneratedArtifact,
  type SysMLRef,
  type TraceLink,
  type TransformationRun,
  type VerificationCase,
  type VerificationResult,
} from "@sysml-fhir-bridge/model-core";
import { FixtureSysmlService } from "@sysml-fhir-bridge/sysml-v2-client";
import { R5Adapter } from "@sysml-fhir-bridge/fhir-adapter";
import {
  createTraceLink,
  evaluateTrace,
  TraceStore,
  type TraceEvaluationContext,
} from "@sysml-fhir-bridge/trace-engine";
import {
  findPhiViolations,
  loadRuleset,
  transformSysmlToFhir,
} from "@sysml-fhir-bridge/mapping-engine";
import {
  elementsInvalidatedByEvidence,
  importFhirEvidence,
  projectTraceGraphToFhir,
} from "@sysml-fhir-bridge/fhir-loop";
import type { Bundle, Observation } from "@sysml-fhir-bridge/fhir-adapter";
import {
  checkBundleAgainstContract,
  generateConformanceReportHtml,
  type InterfaceContract,
} from "@sysml-fhir-bridge/conformance";
import { readFileSync } from "node:fs";
import {
  DOC_TEMPLATES_VERSION,
  generateIcdHtml,
  generateIcdMarkdown,
  generateTraceExplorerHtml,
  generateVerificationMatrix,
  type ExplorerModelEdge,
  type ExplorerSysmlNode,
  type ExplorerTargetNode,
  type IcdModel,
  type TraceExplorerInput,
} from "@sysml-fhir-bridge/docgen";
import { MermaidRenderer } from "@sysml-fhir-bridge/render-mermaid";
import { NomnomlRenderer } from "@sysml-fhir-bridge/render-nomnoml";
import { PlantUmlRenderer } from "@sysml-fhir-bridge/render-plantuml";
import { architectureView, requirementsTraceView, traceTargetNodeId } from "./views.js";

// ---------------------------------------------------------------------------
// Fixed baseline inputs — determinism comes from here, not from wall clocks.
// ---------------------------------------------------------------------------
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const GENERATED = path.join(ROOT, "generated");

const BASELINE_ID = "exmc-pdr-2027.03";
const PROJECT_ID = "medical-system-foundation";
const BASELINE_COMMIT = "sysml-8df65f0d";
const IMPACT_COMMIT = "sysml-a1b2c3d4";
const GENERATED_AT = "2027-03-18T16:22:00Z";
const IMPACT_AT = "2027-03-18T16:25:21Z";
const EVIDENCE_AT = "2027-04-02T09:20:00Z";
const EVIDENCE_STATE = "runtime-evidence";
const CREATED_BY = "sysml-fhir-bridge-demo";
const FHIR_PACKAGE = { name: "org.example.exmc", version: "0.4.0", fhirVersion: "5.0.0" };
const OBSERVATION_PROFILE = "exmc-physiology-observation";
const GENERATOR = {
  name: "sysml-fhir-bridge",
  version: "0.1.0",
  buildDigest: semanticHash({ name: "sysml-fhir-bridge", version: "0.1.0" }),
};

async function main(): Promise<void> {
  const sysml = FixtureSysmlService.fromFile(
    path.join(ROOT, "models/examples/exmc-ultrasound/model.json"),
  );
  const ruleset = loadRuleset(path.join(ROOT, "models/mappings/exmc-mappings.json"));
  const fhir = new R5Adapter("https://example.org/fhir/exmc");

  const elements = await sysml.listElements(PROJECT_ID, BASELINE_COMMIT);
  const byId = new Map(elements.map((e) => [e.elementId, e]));

  // -- PHI guard: engineering model must be free of patient identity ---------
  const phi = findPhiViolations(elements);
  if (phi.length > 0) {
    throw new Error(`PHI policy violation: ${phi.map((v) => v.path).join(", ")}`);
  }
  console.log(`PHI guard: ${elements.length} elements clean`);

  // -- Transform SysML -> FHIR under the ruleset ----------------------------
  const transform = transformSysmlToFhir(elements, ruleset, fhir, {
    profileVersion: FHIR_PACKAGE.version,
    observationProfileName: OBSERVATION_PROFILE,
    exampleTimestamp: GENERATED_AT,
  });
  if (transform.errors.length > 0) {
    throw new Error(
      `Mapping errors: ${transform.errors.map((e) => `${e.elementId}: ${e.message}`).join("; ")}`,
    );
  }
  console.log(
    `Transform: ${transform.generated.length} artifacts, ${transform.warnings.length} explicit warnings`,
  );
  for (const warning of transform.warnings) {
    console.log(`  [${warning.code}] ${warning.elementId}: ${warning.message}`);
  }

  // -- Mint version-pinned TraceLinks ---------------------------------------
  const transformationId = "tx-exmc-0001";
  const store = new TraceStore();
  const buildTransformationRun = (): TransformationRun => ({
    transformationId,
    timestamp: GENERATED_AT,
    source: {
      sysmlProjectId: PROJECT_ID,
      sysmlCommitId: BASELINE_COMMIT,
      elementIds: [...new Set(transform.generated.map((g) => g.sourceElementId))].sort(),
    },
    target: {
      fhirPackage: `${FHIR_PACKAGE.name}#${FHIR_PACKAGE.version}`,
      resources: transform.generated
        .filter((g) => g.resource)
        .map((g) => `${g.resource?.resourceType}/${g.resource?.id}`)
        .sort(),
    },
    ruleset: { id: ruleset.rulesetId, version: ruleset.rulesetVersion },
    generator: GENERATOR,
    artifacts: artifacts.map((a) => ({ name: a.name, sha256: a.sha256 })),
  });
  const sourceRef = (elementId: string): SysMLRef => {
    const element = byId.get(elementId);
    const ref: SysMLRef = {
      standard: "sysml-v2",
      projectId: PROJECT_ID,
      commitId: BASELINE_COMMIT,
      elementId,
    };
    if (element) ref.qualifiedName = element.qualifiedName;
    return ref;
  };

  const rootTraces: TraceLink[] = [];
  for (const mapping of transform.generated) {
    const element = byId.get(mapping.sourceElementId);
    if (!element) throw new Error(`Transform emitted unknown element ${mapping.sourceElementId}`);
    rootTraces.push(
      store.add(
        createTraceLink({
          source: sourceRef(mapping.sourceElementId),
          relationship: mapping.relationship,
          target: mapping.target,
          mappingRuleId: mapping.ruleId,
          mappingRuleVersion: mapping.ruleVersion,
          semanticConfidence: mapping.semanticConfidence,
          sourceHash: semanticHash(element),
          targetHash: semanticHash(mapping.resource ?? mapping.target),
          provenanceId: transformationId,
          createdAt: GENERATED_AT,
          createdBy: CREATED_BY,
        }),
      ),
    );
  }
  console.log(`Trace graph: ${store.active().length} TraceLinks minted`);

  // -- Write FHIR example artifacts -----------------------------------------
  mkdirSync(path.join(GENERATED, "fhir"), { recursive: true });
  mkdirSync(path.join(GENERATED, "diagrams"), { recursive: true });
  const artifacts: GeneratedArtifact[] = [];
  const writeArtifact = (
    relPath: string,
    content: string,
    kind: GeneratedArtifact["kind"],
  ): GeneratedArtifact => {
    const absolute = path.join(GENERATED, relPath);
    writeFileSync(absolute, content);
    const artifact: GeneratedArtifact = {
      name: relPath,
      kind,
      path: `generated/${relPath}`,
      sha256: sha256Hex(content),
    };
    artifacts.push(artifact);
    return artifact;
  };

  for (const mapping of transform.generated) {
    if (!mapping.resource) continue;
    writeArtifact(
      `fhir/${mapping.resource.resourceType.toLowerCase()}-${mapping.resource.id}.json`,
      `${JSON.stringify(mapping.resource, null, 2)}\n`,
      "fhir-example",
    );
  }

  // -- Verification case + result -------------------------------------------
  const requirementRef = sourceRef("req-med-042");
  const verificationCase: VerificationCase = {
    id: "VER-042",
    name: "UltrasoundDiagnosticWorkflowTest",
    requirement: requirementRef,
    method: "demonstration",
    description:
      "Demonstrate that a modeled ultrasound acquisition produces profile-conformant Observations over the medical data interface.",
    executedAgainstBaseline: BASELINE_ID,
  };
  const observationExample = artifacts.find((a) =>
    a.name.includes("observation-heart-rate-metric-example"),
  );
  const verificationResult: VerificationResult = {
    id: "VERR-042-001",
    caseId: verificationCase.id,
    status: "pass",
    executedAt: GENERATED_AT,
    evidence: [
      {
        standard: "external",
        kind: "test-log",
        uri: "tests/acceptance/vertical-slice.test.ts",
        mimeType: "text/x-typescript",
      },
      ...(observationExample
        ? [
            {
              standard: "external" as const,
              kind: "fhir-example",
              uri: observationExample.path,
              sha256: observationExample.sha256,
            },
          ]
        : []),
    ],
  };
  assertValid("verification-result", verificationResult);

  // -- Generate the ICD ------------------------------------------------------
  const port = byId.get("port-medical-data");
  if (!port) throw new Error("expected port-medical-data in baseline model");
  const telemetryReq = byId.get("req-telemetry-014");
  const metricRule = ruleset.rules.find((r) => r.id === "sysml-metric-to-devicemetric");
  const obsRule = ruleset.rules.find(
    (r) => r.id === "sysml-observable-to-fhir-observation",
  );
  const usedUnits = elements
    .filter((e) => e.kind === "AttributeUsage" && e.metadata?.["observable"] === true)
    .map((e) => e.metadata?.["unit"])
    .filter((u): u is string => typeof u === "string")
    .sort()
    .map((engineering) => ({
      engineering,
      ucum: ruleset.unitCrosswalk.entries[engineering] ?? "UNMAPPED",
    }));

  const icdModel: IcdModel = {
    title: "ExMC Medical Data Interface — Interface Control Document",
    baselineId: BASELINE_ID,
    sysml: { projectId: PROJECT_ID, commitId: BASELINE_COMMIT },
    fhirPackage: FHIR_PACKAGE,
    mappingRulesVersion: ruleset.rulesetVersion,
    generatedAt: GENERATED_AT,
    generator: { name: GENERATOR.name, version: GENERATOR.version },
    interfaces: [
      {
        anchor: "medical-data-port",
        name: port.name,
        qualifiedName: port.qualifiedName,
        sourceElementId: port.elementId,
        ownerName: byId.get(port.ownerId ?? "")?.name ?? "—",
        connectedSystems: ["Local medical record (xEHR)", "Store-and-forward comm link"],
        direction: "outbound (device → medical data system)",
        payloadTypes: (port.metadata?.["accepts"] as string[] | undefined) ?? [],
        profiles: [
          {
            canonical: fhir.profileCanonical(OBSERVATION_PROFILE),
            version: FHIR_PACKAGE.version,
            fhirVersion: FHIR_PACKAGE.fhirVersion,
          },
        ],
        terminologyBindings: [
          { system: "http://loinc.org", note: "observation codes where clinically standard" },
          { system: "http://unitsofmeasure.org", note: "all quantities carry UCUM codes" },
        ],
        cardinalities: [metricRule?.cardinality ?? "—", obsRule?.cardinality ?? "—"],
        units: usedUnits,
        updateFrequency: String(port.metadata?.["updateFrequency"] ?? "—"),
        latency: String(port.metadata?.["latencyClass"] ?? "—"),
        offlineBehavior: String(port.metadata?.["offlineBehavior"] ?? "—"),
        bufferingPolicy:
          "bounded durable queue; urgent clinical events precede bulk archival transfer",
        security:
          "engineering API: OIDC/OAuth2; clinical API: SMART-on-FHIR where applicable; edge: locally enforceable policy with cached trust",
        errorSemantics:
          "explicit mapping warnings (NO_DIRECT_MAPPING); no silent unit or cardinality coercion; conflicts reconciled via FHIR version/ETag semantics",
        dataProvenance: `TransformationRun ${transformationId}, ruleset ${ruleset.rulesetId}@${ruleset.rulesetVersion}, generator ${GENERATOR.name}@${GENERATOR.version}`,
        powerComputeNetwork:
          "store-and-forward under the downlink budget allocated by MedicalTelemetryBandwidth (req-telemetry-014); no continuous-connectivity assumption",
        constrainedBy: telemetryReq
          ? [
              {
                elementId: telemetryReq.elementId,
                name: telemetryReq.name,
                text: telemetryReq.documentation ?? "",
              },
            ]
          : [],
        verification: [
          {
            caseId: verificationCase.id,
            name: verificationCase.name,
            method: verificationCase.method,
            status: verificationResult.status,
            evidence: verificationResult.evidence.map((e) => {
              const entry: { uri: string; sha256?: string } = { uri: e.uri };
              if (e.sha256 !== undefined) entry.sha256 = e.sha256;
              return entry;
            }),
          },
        ],
      },
    ],
    changeHistory: (await sysml.listCommits(PROJECT_ID)).map((c) => ({
      commitId: c.commitId,
      description: c.description ?? "",
    })),
  };
  writeArtifact("exmc-medical-icd.md", generateIcdMarkdown(icdModel), "icd");
  writeArtifact("exmc-medical-icd.html", generateIcdHtml(icdModel), "icd");

  // -- Verification matrix ---------------------------------------------------
  const requirements = elements
    .filter((e) => e.kind === "RequirementUsage")
    .map((e) => ({
      ref: sourceRef(e.elementId),
      name: e.name,
      text: e.documentation ?? "",
    }));
  writeArtifact(
    "verification-matrix.md",
    generateVerificationMatrix({
      baselineId: BASELINE_ID,
      requirements,
      cases: [verificationCase],
      results: [verificationResult],
    }),
    "verification-matrix",
  );

  // -- Diagrams: deterministic projections, never semantic sources ----------
  const views = [requirementsTraceView(elements, store.active()), architectureView()];
  const renderers = [new MermaidRenderer(), new NomnomlRenderer(), new PlantUmlRenderer()];
  for (const view of views) {
    for (const renderer of renderers) {
      const rendered = await renderer.render(view);
      writeArtifact(`diagrams/${view.id}${rendered.extension}`, rendered.content, "diagram");
    }
  }

  // -- Impact pass against the follow-on commit ------------------------------
  const nextElements = await sysml.listElements(PROJECT_ID, IMPACT_COMMIT);
  const nextById = new Map(nextElements.map((e) => [e.elementId, e]));
  const impactResults: {
    traceId: string;
    sourceElement: string;
    previousStatus: string;
    newStatus: string;
    reason?: string;
  }[] = [];

  for (const trace of store.active()) {
    const current = nextById.get(trace.source.elementId);
    const ctx: TraceEvaluationContext = { sourceExists: current !== undefined };
    if (current) ctx.currentSourceHash = semanticHash(current);
    const evaluation = evaluateTrace(trace, ctx);
    if (evaluation.status !== trace.status) {
      const superseding = store.transition(
        trace.id,
        evaluation.status,
        evaluation.reason,
        IMPACT_AT,
        CREATED_BY,
      );
      const entry: (typeof impactResults)[number] = {
        traceId: trace.id,
        sourceElement: trace.source.elementId,
        previousStatus: trace.status,
        newStatus: superseding.status,
      };
      if (evaluation.reason !== undefined) entry.reason = evaluation.reason;
      impactResults.push(entry);
    }
  }
  console.log(`Impact of ${IMPACT_COMMIT}: ${impactResults.length} traces affected`);
  for (const impact of impactResults) {
    console.log(
      `  ${impact.sourceElement}: ${impact.previousStatus} -> ${impact.newStatus} (${impact.reason ?? ""})`,
    );
  }
  writeArtifact(
    "impact-report.json",
    `${JSON.stringify(
      { baselineCommit: BASELINE_COMMIT, evaluatedAgainst: IMPACT_COMMIT, evaluatedAt: IMPACT_AT, affected: impactResults },
      null,
      2,
    )}\n`,
    "other",
  );

  // Snapshot each root trace's status after the SysML-side impact pass, before
  // the runtime evidence loop runs, so the explorer can show them separately.
  const rootOf = (tip: TraceLink): string => {
    let root = tip;
    while (root.supersedes) {
      const prev = store.get(root.supersedes);
      if (!prev) break;
      root = prev;
    }
    return root.id;
  };
  const snapshotStatus = (): Map<string, { status: string; reason?: string }> => {
    const m = new Map<string, { status: string; reason?: string }>();
    for (const tip of store.active()) {
      const entry: { status: string; reason?: string } = { status: tip.status };
      if (tip.statusReason !== undefined) entry.reason = tip.statusReason;
      m.set(rootOf(tip), entry);
    }
    return m;
  };
  const statusAfterImpact = snapshotStatus();

  // -- Inbound learning loop: runtime FHIR evidence -> design feedback -------
  const evidence = JSON.parse(
    readFileSync(
      path.join(ROOT, "models/examples/exmc-ultrasound/runtime-evidence.json"),
      "utf8",
    ),
  ) as { observations: Observation[] };
  // Reconcile against the *current* design (post-change commit), not the
  // original baseline: the loop asks "does today's runtime data fit today's model?"
  const evidenceResult = importFhirEvidence({
    elements: nextElements,
    ruleset,
    observations: evidence.observations,
    importedAt: EVIDENCE_AT,
  });
  console.log(
    `Evidence loop: ${evidenceResult.matches.length} matched, ${evidenceResult.gaps.length} coverage gaps, ` +
      `${evidenceResult.violations.length} violations, ${evidenceResult.proposals.length} change proposals`,
  );
  for (const proposal of evidenceResult.proposals) {
    assertValid("change-proposal", proposal);
    console.log(`  [${proposal.kind}] ${proposal.title}`);
  }

  // Runtime evidence that contradicts the model closes the loop: mark the
  // affected traces stale from evidence (not from a SysML edit).
  for (const invalidation of elementsInvalidatedByEvidence(evidenceResult)) {
    for (const trace of store.bySourceElement(PROJECT_ID, invalidation.elementId)) {
      if (trace.status === "invalid" || trace.status === "waived") continue;
      const evaluation = evaluateTrace(trace, {
        sourceExists: true,
        contradictedByEvidence: invalidation.reason,
      });
      if (evaluation.status !== trace.status) {
        store.transition(trace.id, evaluation.status, evaluation.reason, EVIDENCE_AT, "evidence-loop");
      }
    }
  }
  const statusAfterEvidence = snapshotStatus();

  writeArtifact(
    "change-proposals.json",
    `${JSON.stringify(
      {
        importedAt: EVIDENCE_AT,
        baseline: BASELINE_ID,
        matches: evidenceResult.matches,
        gaps: evidenceResult.gaps,
        violations: evidenceResult.violations,
        proposals: evidenceResult.proposals,
      },
      null,
      2,
    )}\n`,
    "other",
  );

  // -- Interface conformance: does runtime data honor the ICD's contract? ----
  // The ICD (human doc) and this checker are both projections of one
  // InterfaceContract (ADR-009). Built from the same port/ruleset/model data
  // the ICD interface entry uses, so they cannot disagree.
  const observableUnits = nextElements
    .filter((e) => e.kind === "AttributeUsage" && e.metadata?.["observable"] === true)
    .map((e) => ({
      loincHint: e.metadata?.["loincHint"],
      unit: e.metadata?.["unit"],
    }))
    .filter((u): u is { loincHint: string; unit: string } =>
      typeof u.loincHint === "string" && typeof u.unit === "string",
    )
    .map((u) => ({ code: u.loincHint, ucum: ruleset.unitCrosswalk.entries[u.unit] ?? "UNMAPPED" }))
    .sort((a, b) => a.code.localeCompare(b.code));

  const interfaceContract: InterfaceContract = {
    interfaceId: "port-medical-data",
    name: "medicalDataPort",
    baselineId: BASELINE_ID,
    direction: "outbound (device -> medical data system)",
    permittedPayloadTypes: (port.metadata?.["accepts"] as string[] | undefined) ?? [],
    profile: {
      canonical: fhir.profileCanonical(OBSERVATION_PROFILE),
      version: FHIR_PACKAGE.version,
      fhirVersion: FHIR_PACKAGE.fhirVersion,
    },
    boundTerminologySystems: ["http://loinc.org", "http://unitsofmeasure.org"],
    observableUnits,
    cardinality: ["1 modeled observable -> 0..N runtime Observations"],
  };

  // The runtime evidence, bundled as it would arrive from operations.
  const runtimeBundle: Bundle = {
    resourceType: "Bundle",
    id: "exmc-runtime-2027-04-02",
    type: "collection",
    entry: evidence.observations.map((resource) => ({ resource })),
  };
  const conformanceReport = checkBundleAgainstContract(
    interfaceContract,
    runtimeBundle,
    EVIDENCE_AT,
  );
  console.log(
    `Conformance: bundle ${runtimeBundle.id} vs ${interfaceContract.name} -> ${conformanceReport.verdict.toUpperCase()} ` +
      `(${conformanceReport.summary.pass} pass, ${conformanceReport.summary.fail} fail, ${conformanceReport.summary.notApplicable} n/a; FHIR profile validation deferred to HL7)`,
  );
  writeArtifact(
    "conformance-report.json",
    `${JSON.stringify(conformanceReport, null, 2)}\n`,
    "other",
  );
  writeArtifact(
    "conformance-report.html",
    generateConformanceReportHtml(conformanceReport),
    "other",
  );

  // -- Outbound projection: trace graph -> FHIR Bundle ----------------------
  const projectionBundle = projectTraceGraphToFhir({
    canonicalBase: "https://example.org/fhir/exmc",
    ruleset,
    traces: rootTraces,
    transformationRun: buildTransformationRun(),
    documents: [
      {
        title: "ExMC Medical Data Interface ICD",
        path: "generated/exmc-medical-icd.html",
        contentType: "text/html",
        sha256: artifacts.find((a) => a.name === "exmc-medical-icd.html")?.sha256 ?? "",
      },
    ],
  });
  writeArtifact(
    "fhir/bundle-trace-projection.json",
    `${JSON.stringify(projectionBundle, null, 2)}\n`,
    "fhir-example",
  );

  // -- Interactive trace explorer -------------------------------------------

  const mergedElements = new Map([...nextElements, ...elements].map((e) => [e.elementId, e]));
  const explorerSysmlNodes: ExplorerSysmlNode[] = [...mergedElements.values()]
    .filter((e) => e.elementId !== "sys-medical")
    .map((e) => ({
      id: e.elementId,
      name: e.name,
      kind: e.kind,
      qualifiedName: e.qualifiedName,
      ...(e.documentation !== undefined ? { documentation: e.documentation } : {}),
      presentIn: [
        ...(byId.has(e.elementId) ? [BASELINE_COMMIT] : []),
        ...(nextById.has(e.elementId) ? [IMPACT_COMMIT, EVIDENCE_STATE] : []),
      ],
    }));

  const explorerTargets = new Map<string, ExplorerTargetNode>();
  const explorerEdges = rootTraces.map((trace) => {
    const targetId = traceTargetNodeId(trace);
    if (!explorerTargets.has(targetId)) {
      let label: string;
      let sublabel: string;
      if (trace.target.standard === "fhir") {
        if (trace.target.canonical) {
          label = trace.target.canonical.split("/").at(-1) ?? trace.target.canonical;
          sublabel = `FHIR profile v${trace.target.profileVersion ?? "?"}`;
        } else {
          label = trace.target.logicalId ?? "instance";
          sublabel = `FHIR ${trace.target.resourceType}`;
        }
      } else {
        label = trace.target.kind;
        sublabel = "external artifact";
      }
      explorerTargets.set(targetId, {
        id: targetId,
        label,
        sublabel,
        type: trace.target.standard === "fhir" ? "fhir" : "external",
      });
    }
    const afterImpact = statusAfterImpact.get(trace.id) ?? { status: trace.status };
    const afterEvidence = statusAfterEvidence.get(trace.id) ?? afterImpact;
    return {
      traceId: trace.id,
      sourceId: trace.source.elementId,
      targetId,
      relationship: trace.relationship,
      ruleId: trace.mappingRuleId,
      ruleVersion: trace.mappingRuleVersion,
      ...(trace.semanticConfidence !== undefined ? { confidence: trace.semanticConfidence } : {}),
      ...(trace.sourceHash !== undefined ? { sourceHash: trace.sourceHash } : {}),
      ...(trace.targetHash !== undefined ? { targetHash: trace.targetHash } : {}),
      statusByCommit: {
        [BASELINE_COMMIT]: { status: trace.status },
        [IMPACT_COMMIT]: afterImpact,
        [EVIDENCE_STATE]: afterEvidence,
      },
    };
  });

  const explorerModelEdges: ExplorerModelEdge[] = [];
  for (const element of elements) {
    if (element.elementId === "sys-medical") continue;
    for (const rel of element.relationships ?? []) {
      explorerModelEdges.push({
        sourceId: element.elementId,
        targetId: rel.targetElementId,
        label: rel.type,
      });
    }
    if (element.ownerId && element.ownerId !== "sys-medical") {
      explorerModelEdges.push({ sourceId: element.ownerId, targetId: element.elementId, label: "owns" });
    }
  }

  const commitInfo = await sysml.listCommits(PROJECT_ID);
  const explorerInput: TraceExplorerInput = {
    title: "SysML–FHIR Bridge Trace Explorer — ExMC baseline",
    baselineId: BASELINE_ID,
    generatedAt: GENERATED_AT,
    commits: [
      {
        commitId: BASELINE_COMMIT,
        label: "PDR baseline",
        description: commitInfo.find((c) => c.commitId === BASELINE_COMMIT)?.description ?? "",
      },
      {
        commitId: IMPACT_COMMIT,
        label: "Post-change",
        description: commitInfo.find((c) => c.commitId === IMPACT_COMMIT)?.description ?? "",
      },
      {
        commitId: EVIDENCE_STATE,
        label: "Runtime evidence",
        description:
          "Learning loop: runtime clinical FHIR data imported and reconciled against the model (unit drift marks a trace stale from evidence).",
      },
    ],
    sysmlNodes: explorerSysmlNodes,
    targetNodes: [...explorerTargets.values()],
    edges: explorerEdges,
    modelEdges: explorerModelEdges,
  };
  writeArtifact("trace-explorer.html", generateTraceExplorerHtml(explorerInput), "diagram");

  // -- Trace graph + provenance ---------------------------------------------
  writeArtifact(
    "trace-links.json",
    `${JSON.stringify(store.all(), null, 2)}\n`,
    "other",
  );

  const transformationRun = buildTransformationRun();
  assertValid("transformation-run", transformationRun);
  writeArtifact(
    "transformation-run.json",
    `${JSON.stringify(transformationRun, null, 2)}\n`,
    "other",
  );

  // -- Baseline manifest: the release definition -----------------------------
  const manifest: BaselineManifest = {
    baselineId: BASELINE_ID,
    sysml: { projectId: PROJECT_ID, commitId: BASELINE_COMMIT },
    git: { sha: "0000000000000000000000000000000000000000" },
    fhirPackage: FHIR_PACKAGE,
    mappingRules: ruleset.rulesetVersion,
    docTemplates: DOC_TEMPLATES_VERSION,
    generatedAt: GENERATED_AT,
    generator: GENERATOR,
    artifacts,
  };
  assertValid("baseline-manifest", manifest);
  writeFileSync(
    path.join(GENERATED, "baseline-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  // -- Validate every trace link one more time at the boundary ---------------
  for (const trace of store.all()) assertValid("trace-link", trace);
  const activeTraces: TraceLink[] = store.active();
  const stale = activeTraces.filter((t) => t.status === "stale").length;
  const invalid = activeTraces.filter((t) => t.status === "invalid").length;
  console.log(
    `Baseline ${BASELINE_ID} written: ${artifacts.length + 1} artifacts, ` +
      `${activeTraces.length} active traces (${stale} stale, ${invalid} invalid after impact pass)`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
