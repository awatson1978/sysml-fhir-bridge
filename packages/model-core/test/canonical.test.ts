import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalJson,
  deterministicId,
  semanticHash,
  validateAgainstSchema,
} from "@sysml-fhir-bridge/model-core";

test("canonical JSON is independent of key order", () => {
  const a = { b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } };
  const b = { a: { c: [3, { e: 5, f: 4 }], d: 2 }, b: 1 };
  assert.equal(canonicalJson(a), canonicalJson(b));
  assert.equal(semanticHash(a), semanticHash(b));
});

test("semantic hash changes when content changes", () => {
  assert.notEqual(semanticHash({ text: "50 kbit/s" }), semanticHash({ text: "30 kbit/s" }));
});

test("deterministic ids are stable and namespaced", () => {
  const id1 = deterministicId("trace", { x: 1 });
  const id2 = deterministicId("trace", { x: 1 });
  assert.equal(id1, id2);
  assert.match(id1, /^trace-[0-9a-f]{12}$/);
  assert.notEqual(id1, deterministicId("artifact", { x: 1 }));
});

test("schema validation rejects malformed trace links", () => {
  const outcome = validateAgainstSchema("trace-link", {
    id: "trace-x",
    relationship: "constrains",
  });
  assert.equal(outcome.valid, false);
  assert.ok(outcome.errors.length > 0);
});

test("schema validation accepts a well-formed trace link", () => {
  const outcome = validateAgainstSchema("trace-link", {
    id: "trace-f79e",
    source: {
      standard: "sysml-v2",
      projectId: "medical-system-foundation",
      commitId: "8df65f0d",
      elementId: "req-telemetry-014",
    },
    relationship: "constrains",
    target: {
      standard: "fhir",
      fhirVersion: "5.0.0",
      canonical: "https://example.org/fhir/exmc/StructureDefinition/exmc-physiology-observation",
      profileVersion: "0.4.0",
    },
    mappingRuleId: "sysml-requirement-constrains-profile",
    mappingRuleVersion: "1.0.1",
    status: "valid",
    createdAt: "2027-03-18T16:22:00Z",
    createdBy: "test",
    provenanceId: "tx-1",
  });
  assert.deepEqual(outcome.errors, []);
  assert.equal(outcome.valid, true);
});
