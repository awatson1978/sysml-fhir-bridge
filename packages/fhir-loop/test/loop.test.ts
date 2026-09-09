import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertValid, type TransformationRun } from "@sysml-fhir-bridge/model-core";
import { FixtureSysmlService, type SysmlElement } from "@sysml-fhir-bridge/sysml-v2-client";
import { R5Adapter, type Observation } from "@sysml-fhir-bridge/fhir-adapter";
import { createTraceLink } from "@sysml-fhir-bridge/trace-engine";
import { loadRuleset, transformSysmlToFhir } from "@sysml-fhir-bridge/mapping-engine";
import {
  importFhirEvidence,
  elementsInvalidatedByEvidence,
  projectTraceGraphToFhir,
} from "@sysml-fhir-bridge/fhir-loop";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const ruleset = loadRuleset(path.join(ROOT, "models/mappings/exmc-mappings.json"));

function heartRateElement(): SysmlElement {
  return {
    elementId: "attr-heart-rate",
    kind: "AttributeUsage",
    name: "heartRateMetric",
    qualifiedName: "MedicalSystem::ExmcUltrasound::heartRateMetric",
    metadata: { observable: true, metricCategory: "measurement", unit: "bpm", loincHint: "8867-4" },
  };
}

function obs(id: string, code: string, unitCode: string): Observation {
  return {
    resourceType: "Observation",
    id,
    status: "final",
    code: { coding: [{ system: "http://loinc.org", code }] },
    valueQuantity: { value: 70, system: "http://unitsofmeasure.org", code: unitCode },
  };
}

test("evidence matching: runtime Observation matches a modeled observable by LOINC hint", () => {
  const result = importFhirEvidence({
    elements: [heartRateElement()],
    ruleset,
    observations: [obs("o1", "8867-4", "/min")],
    importedAt: "2027-04-02T09:20:00Z",
  });
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0]?.matchedElementId, "attr-heart-rate");
  assert.equal(result.violations.length, 0);
  assert.equal(result.proposals.length, 0);
});

test("coverage gap: uncovered runtime code yields NO_DESIGN_COVERAGE + new-observable proposal", () => {
  const result = importFhirEvidence({
    elements: [heartRateElement()],
    ruleset,
    observations: [obs("o2", "2708-6", "%")],
    importedAt: "2027-04-02T09:20:00Z",
  });
  assert.equal(result.gaps.length, 1);
  assert.equal(result.gaps[0]?.reason, "NO_DESIGN_COVERAGE");
  assert.equal(result.proposals.length, 1);
  assert.equal(result.proposals[0]?.kind, "new-observable");
  assertValid("change-proposal", result.proposals[0]);
});

test("unit drift: runtime UCUM contradicting the model is a violation, not a silent coercion", () => {
  const result = importFhirEvidence({
    elements: [heartRateElement()],
    ruleset,
    observations: [obs("o3", "8867-4", "Hz")],
    importedAt: "2027-04-02T09:20:00Z",
  });
  assert.equal(result.violations.length, 1);
  assert.equal(result.violations[0]?.code, "UNIT_DRIFT");
  const invalidations = elementsInvalidatedByEvidence(result);
  assert.deepEqual(invalidations.map((i) => i.elementId), ["attr-heart-rate"]);
  assert.match(invalidations[0]?.reason ?? "", /contradicts model/);
});

test("PHI never crosses inbound: proposals carry only coded shells, no patient fields", () => {
  const leaky = {
    ...obs("o4", "2708-6", "%"),
    subject: { reference: "Patient/jane-doe" },
  } as Observation & { subject: unknown };
  const result = importFhirEvidence({
    elements: [heartRateElement()],
    ruleset,
    observations: [leaky],
    importedAt: "2027-04-02T09:20:00Z",
  });
  const serialized = JSON.stringify(result.proposals);
  assert.equal(serialized.includes("jane-doe"), false);
  assert.equal(serialized.includes("Patient/"), false);
});

test("outbound projection: trace graph becomes a FHIR Bundle with an honest ConceptMap", async () => {
  const sysml = FixtureSysmlService.fromFile(
    path.join(ROOT, "models/examples/exmc-ultrasound/model.json"),
  );
  const fhir = new R5Adapter("https://example.org/fhir/exmc");
  const elements = await sysml.listElements("medical-system-foundation", "sysml-8df65f0d");
  const transform = transformSysmlToFhir(elements, ruleset, fhir, {
    profileVersion: "0.4.0",
    observationProfileName: "exmc-physiology-observation",
    exampleTimestamp: "2027-03-18T16:22:00Z",
  });
  const byId = new Map(elements.map((e) => [e.elementId, e]));
  const traces = transform.generated.map((m) =>
    createTraceLink({
      source: {
        standard: "sysml-v2",
        projectId: "medical-system-foundation",
        commitId: "sysml-8df65f0d",
        elementId: m.sourceElementId,
        qualifiedName: byId.get(m.sourceElementId)?.qualifiedName ?? "",
      },
      relationship: m.relationship,
      target: m.target,
      mappingRuleId: m.ruleId,
      mappingRuleVersion: m.ruleVersion,
      semanticConfidence: m.semanticConfidence,
      provenanceId: "tx-test",
      createdAt: "2027-03-18T16:22:00Z",
      createdBy: "test",
    }),
  );
  const run: TransformationRun = {
    transformationId: "tx-test",
    timestamp: "2027-03-18T16:22:00Z",
    source: { sysmlProjectId: "medical-system-foundation", sysmlCommitId: "sysml-8df65f0d", elementIds: [] },
    target: { fhirPackage: "org.example.exmc#0.4.0", resources: [] },
    ruleset: { id: ruleset.rulesetId, version: ruleset.rulesetVersion },
    generator: { name: "sysml-fhir-bridge", version: "0.1.0", buildDigest: "sha256:x" },
    artifacts: [],
  };
  const bundle = projectTraceGraphToFhir({
    canonicalBase: "https://example.org/fhir/exmc",
    ruleset,
    traces,
    transformationRun: run,
    documents: [],
  });
  assert.equal(bundle.resourceType, "Bundle");
  const conceptMap = bundle.entry.find((e) => e.resource.resourceType === "ConceptMap")?.resource;
  assert.ok(conceptMap && conceptMap.resourceType === "ConceptMap");
  const portRule = conceptMap.group[0]?.element.find((el) => el.code === "sysml-port-to-icd-contract");
  assert.equal(portRule?.noMap, true, "port rule is an honest non-mapping");
  const metricRule = conceptMap.group[0]?.element.find((el) => el.code === "sysml-metric-to-devicemetric");
  assert.ok(metricRule?.target && metricRule.target.length > 0);
});
