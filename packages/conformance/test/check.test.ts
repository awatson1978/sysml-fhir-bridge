import { test } from "node:test";
import assert from "node:assert/strict";
import type { Bundle, Observation } from "@nodeonsysml/fhir-adapter";
import {
  checkBundleAgainstContract,
  generateConformanceReportHtml,
  type InterfaceContract,
} from "@nodeonsysml/conformance";

const contract: InterfaceContract = {
  interfaceId: "port-medical-data",
  name: "medicalDataPort",
  baselineId: "exmc-pdr-2027.03",
  direction: "outbound",
  permittedPayloadTypes: ["Observation", "DiagnosticReport"],
  profile: {
    canonical: "https://example.org/fhir/exmc/StructureDefinition/exmc-physiology-observation",
    version: "0.4.0",
    fhirVersion: "5.0.0",
  },
  boundTerminologySystems: ["http://loinc.org", "http://unitsofmeasure.org"],
  observableUnits: [{ code: "8867-4", ucum: "/min" }],
  cardinality: [],
};

function obs(id: string, code: string, unitCode: string): Observation {
  return {
    resourceType: "Observation",
    id,
    status: "final",
    code: { coding: [{ system: "http://loinc.org", code }] },
    valueQuantity: { value: 70, system: "http://unitsofmeasure.org", code: unitCode },
  };
}

function bundle(...observations: Observation[]): Bundle {
  return {
    resourceType: "Bundle",
    id: "b-test",
    type: "collection",
    entry: observations.map((resource) => ({ resource })),
  };
}

test("conformant bundle: modeled observable with matching UCUM passes every check", () => {
  const report = checkBundleAgainstContract(contract, bundle(obs("o1", "8867-4", "/min")), "2027-04-02T09:20:00Z");
  assert.equal(report.verdict, "conformant");
  assert.equal(report.summary.fail, 0);
  assert.ok(report.checks.some((c) => c.check === "unit-conformance" && c.status === "pass"));
});

test("unit drift makes the bundle non-conformant — the check FHIR profile validation misses", () => {
  const report = checkBundleAgainstContract(contract, bundle(obs("o2", "8867-4", "Hz")), "2027-04-02T09:20:00Z");
  assert.equal(report.verdict, "non-conformant");
  const unit = report.checks.find((c) => c.check === "unit-conformance");
  assert.equal(unit?.status, "fail");
  assert.match(unit?.detail ?? "", /SysML-modeled unit/);
});

test("unmodeled observable is not-applicable for units, but still conformant on payload+terminology", () => {
  const report = checkBundleAgainstContract(contract, bundle(obs("o3", "2708-6", "%")), "2027-04-02T09:20:00Z");
  assert.equal(report.verdict, "conformant");
  assert.ok(report.checks.some((c) => c.check === "unit-conformance" && c.status === "not-applicable"));
});

test("report never claims to do FHIR profile validation", () => {
  const report = checkBundleAgainstContract(contract, bundle(obs("o4", "8867-4", "/min")), "2027-04-02T09:20:00Z");
  assert.equal(report.fhirProfileValidation, "deferred-to-hl7-validator");
  const html = generateConformanceReportHtml(report);
  assert.match(html, /deferred to the HL7 FHIR Validator/);
});

test("deterministic: same inputs produce byte-identical report JSON", () => {
  const a = checkBundleAgainstContract(contract, bundle(obs("o5", "8867-4", "Hz")), "2027-04-02T09:20:00Z");
  const b = checkBundleAgainstContract(contract, bundle(obs("o5", "8867-4", "Hz")), "2027-04-02T09:20:00Z");
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});
