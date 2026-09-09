import { test } from "node:test";
import assert from "node:assert/strict";
import type { SysMLRef, FhirRef } from "@sysml-fhir-bridge/model-core";
import { createTraceLink, evaluateTrace, TraceStore } from "@sysml-fhir-bridge/trace-engine";

const source: SysMLRef = {
  standard: "sysml-v2",
  projectId: "medical-system-foundation",
  commitId: "sysml-8df65f0d",
  elementId: "req-telemetry-014",
};

const profileTarget: FhirRef = {
  standard: "fhir",
  fhirVersion: "5.0.0",
  canonical: "https://example.org/fhir/exmc/StructureDefinition/exmc-physiology-observation",
  profileVersion: "0.4.0",
};

function makeTrace() {
  return createTraceLink({
    source,
    relationship: "constrains",
    target: profileTarget,
    mappingRuleId: "sysml-requirement-constrains-profile",
    mappingRuleVersion: "1.0.1",
    sourceHash: "sha256:aaa",
    targetHash: "sha256:bbb",
    provenanceId: "tx-test",
    createdAt: "2027-03-18T16:22:00Z",
    createdBy: "test",
  });
}

test("unchanged endpoints keep a trace valid", () => {
  const evaluation = evaluateTrace(makeTrace(), {
    sourceExists: true,
    currentSourceHash: "sha256:aaa",
    currentTargetHash: "sha256:bbb",
    currentProfileVersion: "0.4.0",
    currentMappingRuleVersion: "1.0.1",
  });
  assert.equal(evaluation.status, "valid");
});

test("source hash change marks trace stale, not invalid", () => {
  const evaluation = evaluateTrace(makeTrace(), {
    sourceExists: true,
    currentSourceHash: "sha256:changed",
  });
  assert.equal(evaluation.status, "stale");
  assert.match(evaluation.reason ?? "", /source semantic hash changed/);
});

test("FHIR profile version change marks dependent trace stale", () => {
  const evaluation = evaluateTrace(makeTrace(), {
    sourceExists: true,
    currentProfileVersion: "0.5.0",
  });
  assert.equal(evaluation.status, "stale");
  assert.match(evaluation.reason ?? "", /profile version changed/);
});

test("mapping rule version change marks trace stale", () => {
  const evaluation = evaluateTrace(makeTrace(), {
    sourceExists: true,
    currentMappingRuleVersion: "2.0.0",
  });
  assert.equal(evaluation.status, "stale");
});

test("deleted SysML element invalidates rather than silently pointing to nothing", () => {
  const evaluation = evaluateTrace(makeTrace(), { sourceExists: false });
  assert.equal(evaluation.status, "invalid");
  assert.match(evaluation.reason ?? "", /no longer exists/);
});

test("store is append-only: transitions supersede, history survives", () => {
  const store = new TraceStore();
  const trace = store.add(makeTrace());
  const superseding = store.transition(trace.id, "stale", "test reason", "2027-03-18T16:25:21Z", "test");

  assert.equal(store.all().length, 2);
  assert.equal(store.get(trace.id)?.status, "valid"); // history untouched
  assert.equal(superseding.supersedes, trace.id);
  assert.deepEqual(store.active().map((t) => t.id), [superseding.id]);
  assert.throws(() => store.transition(trace.id, "invalid", undefined, "x", "y"), /already superseded/);
});

test("same logical element at two commits yields version-distinct traces", () => {
  const traceAtCommit1 = makeTrace();
  const traceAtCommit2 = createTraceLink({
    source: { ...source, commitId: "sysml-a1b2c3d4" },
    relationship: "constrains",
    target: profileTarget,
    mappingRuleId: "sysml-requirement-constrains-profile",
    mappingRuleVersion: "1.0.1",
    provenanceId: "tx-test-2",
    createdAt: "2027-03-18T16:25:21Z",
    createdBy: "test",
  });
  assert.notEqual(traceAtCommit1.id, traceAtCommit2.id);
});
