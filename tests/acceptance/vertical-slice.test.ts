/**
 * Acceptance tests from the design document ("Acceptance test suite"),
 * exercised against the ExMC example end to end.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { semanticHash, isFhirRef } from "@nodeonsysml/model-core";
import { FixtureSysmlService } from "@nodeonsysml/sysml-v2-client";
import { R5Adapter } from "@nodeonsysml/fhir-adapter";
import {
  createTraceLink,
  evaluateTrace,
  TraceStore,
} from "@nodeonsysml/trace-engine";
import { loadRuleset, transformSysmlToFhir } from "@nodeonsysml/mapping-engine";
import { generateIcdMarkdown, type IcdModel } from "@nodeonsysml/docgen";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const PROJECT = "medical-system-foundation";
const COMMIT_1 = "sysml-8df65f0d";
const COMMIT_2 = "sysml-a1b2c3d4";

const sysml = FixtureSysmlService.fromFile(
  path.join(ROOT, "models/examples/exmc-ultrasound/model.json"),
);
const ruleset = loadRuleset(path.join(ROOT, "models/mappings/exmc-mappings.json"));
const fhir = new R5Adapter("https://example.org/fhir/exmc");

async function buildBaselineStore(): Promise<TraceStore> {
  const elements = await sysml.listElements(PROJECT, COMMIT_1);
  const byId = new Map(elements.map((e) => [e.elementId, e]));
  const transform = transformSysmlToFhir(elements, ruleset, fhir, {
    profileVersion: "0.4.0",
    observationProfileName: "exmc-physiology-observation",
    exampleTimestamp: "2027-03-18T16:22:00Z",
  });
  const store = new TraceStore();
  for (const mapping of transform.generated) {
    const element = byId.get(mapping.sourceElementId);
    if (!element) continue;
    store.add(
      createTraceLink({
        source: {
          standard: "sysml-v2",
          projectId: PROJECT,
          commitId: COMMIT_1,
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
        provenanceId: "tx-acceptance",
        createdAt: "2027-03-18T16:22:00Z",
        createdBy: "acceptance-test",
      }),
    );
  }
  return store;
}

test("requirement trace: a SysML requirement navigates to its FHIR interface profile", async () => {
  const store = await buildBaselineStore();
  const traces = store.bySourceElement(PROJECT, "req-telemetry-014");
  assert.ok(traces.length > 0, "requirement has cross-domain traces");
  const profileTrace = traces.find((t) => isFhirRef(t.target) && t.target.canonical);
  assert.ok(profileTrace, "requirement traces to a FHIR profile canonical");
  assert.equal(profileTrace.relationship, "constrains");
  const target = profileTrace.target;
  assert.ok(isFhirRef(target));
  assert.match(target.canonical ?? "", /exmc-physiology-observation/);
  assert.equal(target.profileVersion, "0.4.0"); // version-pinned
});

test("commit isolation: same element id at two commits yields version-distinct evaluation", async () => {
  const before = await sysml.getElement(PROJECT, COMMIT_1, "req-telemetry-014");
  const after = await sysml.getElement(PROJECT, COMMIT_2, "req-telemetry-014");
  assert.ok(before && after);
  assert.notEqual(semanticHash(before), semanticHash(after));

  const store = await buildBaselineStore();
  const trace = store.bySourceElement(PROJECT, "req-telemetry-014")[0];
  assert.ok(trace);
  assert.equal(
    evaluateTrace(trace, { sourceExists: true, currentSourceHash: semanticHash(before) }).status,
    "valid",
  );
  assert.equal(
    evaluateTrace(trace, { sourceExists: true, currentSourceHash: semanticHash(after) }).status,
    "stale",
  );
});

test("deleted SysML element: trace becomes invalid rather than silently dangling", async () => {
  const store = await buildBaselineStore();
  const gone = await sysml.getElement(PROJECT, COMMIT_2, "attr-doppler-velocity");
  assert.equal(gone, undefined, "doppler metric was removed in commit 2");
  const traces = store.bySourceElement(PROJECT, "attr-doppler-velocity");
  assert.ok(traces.length > 0);
  for (const trace of traces) {
    assert.equal(evaluateTrace(trace, { sourceExists: false }).status, "invalid");
  }
});

test("clinical workflow: modeled exam behavior yields a definitional artifact, not runtime events", async () => {
  const elements = await sysml.listElements(PROJECT, COMMIT_1);
  const transform = transformSysmlToFhir(elements, ruleset, fhir, {
    profileVersion: "0.4.0",
    observationProfileName: "exmc-physiology-observation",
    exampleTimestamp: "2027-03-18T16:22:00Z",
  });
  const workflowArtifacts = transform.generated.filter(
    (g) => g.sourceElementId === "action-perform-ultrasound",
  );
  assert.deepEqual(
    workflowArtifacts.map((g) => g.resource?.resourceType),
    ["ActivityDefinition"],
    "design-time behavior generates definitional resources only (Procedure/Task are runtime)",
  );
});

test("deterministic ICD: same baseline model produces byte-identical output", () => {
  const model: IcdModel = {
    title: "T",
    baselineId: "b-1",
    sysml: { projectId: PROJECT, commitId: COMMIT_1 },
    fhirPackage: { name: "org.example.exmc", version: "0.4.0", fhirVersion: "5.0.0" },
    mappingRulesVersion: "1.8.2",
    generatedAt: "2027-03-18T16:22:00Z",
    generator: { name: "nodeonsysml", version: "0.1.0" },
    interfaces: [],
    changeHistory: [{ commitId: COMMIT_1, description: "baseline" }],
  };
  const copy: IcdModel = JSON.parse(JSON.stringify(model)) as IcdModel;
  assert.equal(generateIcdMarkdown(model), generateIcdMarkdown(copy));
});

test("provenance: every trace pins commit, mapping-rule version and provenance id", async () => {
  const store = await buildBaselineStore();
  for (const trace of store.active()) {
    assert.equal(trace.source.commitId, COMMIT_1);
    assert.ok(trace.mappingRuleVersion.length > 0);
    assert.ok(trace.provenanceId.length > 0);
    assert.ok(trace.sourceHash?.startsWith("sha256:"));
  }
});
