import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { R5Adapter } from "@nodeonsysml/fhir-adapter";
import type { SysmlElement } from "@nodeonsysml/sysml-v2-client";
import {
  findPhiViolations,
  loadRuleset,
  transformSysmlToFhir,
} from "@nodeonsysml/mapping-engine";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const ruleset = loadRuleset(path.join(ROOT, "models/mappings/exmc-mappings.json"));
const fhir = new R5Adapter("https://example.org/fhir/exmc");
const options = {
  profileVersion: "0.4.0",
  observationProfileName: "exmc-physiology-observation",
  exampleTimestamp: "2027-03-18T16:22:00Z",
};

const deviceType: SysmlElement = {
  elementId: "part-def-x",
  kind: "PartDefinition",
  name: "ExmcUltrasound",
  qualifiedName: "MedicalSystem::ExmcUltrasound",
  metadata: { medicalDeviceType: true, modelNumber: "HUS-3000" },
};

test("device type maps to DeviceDefinition, never a runtime Device", () => {
  const result = transformSysmlToFhir([deviceType], ruleset, fhir, options);
  assert.deepEqual(result.errors, []);
  const types = result.generated.map((g) => g.resource?.resourceType);
  assert.deepEqual(types, ["DeviceDefinition"]);
});

test("part usage without deployment binding does not create a Device", () => {
  const usage: SysmlElement = {
    elementId: "part-usage-x",
    kind: "PartUsage",
    name: "plannedUnit",
    qualifiedName: "MedicalSystem::plannedUnit",
    relationships: [{ type: "definedBy", targetElementId: "part-def-x" }],
  };
  const result = transformSysmlToFhir([deviceType, usage], ruleset, fhir, options);
  assert.equal(result.generated.some((g) => g.resource?.resourceType === "Device"), false);
  assert.ok(result.warnings.some((w) => w.code === "SKIPPED" && w.elementId === "part-usage-x"));
});

test("deployment binding creates a Device linked to its DeviceDefinition", () => {
  const usage: SysmlElement = {
    elementId: "part-usage-y",
    kind: "PartUsage",
    name: "ultrasoundUnit01",
    qualifiedName: "MedicalSystem::deployed::ultrasoundUnit01",
    metadata: { deploymentBinding: { site: "lunar-habitat-med-bay", serialNumber: "SN-0001" } },
    relationships: [{ type: "definedBy", targetElementId: "part-def-x" }],
  };
  const result = transformSysmlToFhir([deviceType, usage], ruleset, fhir, options);
  const device = result.generated.find((g) => g.resource?.resourceType === "Device")?.resource;
  assert.ok(device && device.resourceType === "Device");
  assert.equal(device.serialNumber, "SN-0001");
  assert.equal(device.definition?.reference, "DeviceDefinition/exmc-ultrasound-type");
});

test("metric capability (DeviceMetric) and measured value (Observation) stay separate", () => {
  const metric: SysmlElement = {
    elementId: "attr-x",
    kind: "AttributeUsage",
    name: "heartRateMetric",
    qualifiedName: "MedicalSystem::ExmcUltrasound::heartRateMetric",
    metadata: { observable: true, metricCategory: "measurement", unit: "bpm" },
  };
  const result = transformSysmlToFhir([metric], ruleset, fhir, options);
  assert.deepEqual(result.errors, []);
  const kinds = result.generated.map((g) => g.artifactType).sort();
  assert.deepEqual(kinds, ["FHIRExample", "FHIRExample", "FHIRProfileBinding"]);
  const metricResource = result.generated.find((g) => g.resource?.resourceType === "DeviceMetric");
  const observation = result.generated.find((g) => g.resource?.resourceType === "Observation");
  assert.ok(metricResource, "DeviceMetric capability generated");
  assert.ok(observation, "Observation example generated");
  assert.notEqual(metricResource?.resource?.id, observation?.resource?.id);
});

test("unmapped engineering unit is an explicit error, never a silent coercion", () => {
  const metric: SysmlElement = {
    elementId: "attr-weird",
    kind: "AttributeUsage",
    name: "weirdMetric",
    qualifiedName: "MedicalSystem::weirdMetric",
    metadata: { observable: true, unit: "furlong/fortnight" },
  };
  const result = transformSysmlToFhir([metric], ruleset, fhir, options);
  assert.equal(result.generated.length, 0);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0]?.code, "UNIT_UNMAPPED");
});

test("SysML port yields NO_DIRECT_MAPPING warning and an ICD contract, not an invented resource", () => {
  const port: SysmlElement = {
    elementId: "port-x",
    kind: "PortUsage",
    name: "medicalDataPort",
    qualifiedName: "MedicalSystem::ExmcUltrasound::medicalDataPort",
    metadata: { accepts: ["Observation"] },
  };
  const result = transformSysmlToFhir([port], ruleset, fhir, options);
  assert.ok(result.warnings.some((w) => w.code === "NO_DIRECT_MAPPING"));
  const contract = result.generated.find((g) => g.artifactType === "ICDContract");
  assert.ok(contract);
  assert.equal(contract.resource, undefined);
  assert.equal(contract.target.standard, "external");
});

test("PHI guard flags patient identifiers in engineering metadata", () => {
  const leaky: SysmlElement = {
    elementId: "role-x",
    kind: "PartUsage",
    name: "crewMember3",
    qualifiedName: "MedicalSystem::crewMember3",
    metadata: { patientName: "Jane Doe", dateOfBirth: "1990-01-01" },
  };
  const violations = findPhiViolations([leaky]);
  assert.equal(violations.length, 2);
  const clean: SysmlElement = {
    elementId: "role-y",
    kind: "PartUsage",
    name: "CrewMemberRole",
    qualifiedName: "MedicalSystem::CrewMemberRole",
    metadata: { runtimeRef: "Patient binding at deployment" },
  };
  assert.equal(findPhiViolations([clean]).length, 0);
});
