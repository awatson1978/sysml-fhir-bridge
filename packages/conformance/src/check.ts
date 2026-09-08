import type { Bundle, Observation } from "@nodeonsysml/fhir-adapter";
import type { InterfaceContract } from "./contract.js";

export type CheckKind =
  | "permitted-payload"
  | "unit-conformance"
  | "terminology-binding";

export interface ConformanceCheck {
  check: CheckKind;
  resourceType: string;
  resourceId: string;
  status: "pass" | "fail" | "not-applicable";
  detail: string;
}

export interface ConformanceReport {
  interfaceId: string;
  interfaceName: string;
  baselineId: string;
  bundleId: string;
  checkedAt: string;
  profile: { canonical: string; version: string; fhirVersion: string };
  /**
   * NodeOnSysML checks the interface-contract layer only. Full FHIR
   * StructureDefinition conformance is delegated to the HL7 FHIR Validator
   * (ADR-004): we never claim to reimplement it.
   */
  fhirProfileValidation: "deferred-to-hl7-validator";
  checks: ConformanceCheck[];
  summary: { pass: number; fail: number; notApplicable: number };
  verdict: "conformant" | "non-conformant";
}

/** Resource types that represent clinical events flowing over an interface. */
const CLINICAL_EVENT_TYPES = new Set([
  "Observation",
  "DiagnosticReport",
  "Procedure",
  "Communication",
  "DeviceRequest",
]);

/**
 * Check a FHIR Bundle against the interface contract. Answers "does this data
 * honor the published interface?" — the conformance lens on the same runtime
 * data the evidence importer reads through the design-feedback lens.
 *
 * Deterministic: checks are emitted in bundle order, then the summary is
 * derived. This report is suitable as verification (V&V) evidence.
 */
export function checkBundleAgainstContract(
  contract: InterfaceContract,
  bundle: Bundle,
  checkedAt: string,
): ConformanceReport {
  const checks: ConformanceCheck[] = [];
  const unitByCode = new Map(contract.observableUnits.map((u) => [u.code, u.ucum]));
  const boundSystems = new Set(contract.boundTerminologySystems);

  for (const entry of bundle.entry) {
    const resource = entry.resource;

    if (CLINICAL_EVENT_TYPES.has(resource.resourceType)) {
      const permitted = contract.permittedPayloadTypes.includes(resource.resourceType);
      checks.push({
        check: "permitted-payload",
        resourceType: resource.resourceType,
        resourceId: resource.id,
        status: permitted ? "pass" : "fail",
        detail: permitted
          ? `${resource.resourceType} is a permitted payload on ${contract.name}.`
          : `${resource.resourceType} is not among permitted payload types [${contract.permittedPayloadTypes.join(", ")}].`,
      });
    }

    if (resource.resourceType === "Observation") {
      const obs = resource as Observation;
      const coding = obs.code?.coding?.[0];

      if (coding?.system !== undefined) {
        const bound = boundSystems.has(coding.system);
        checks.push({
          check: "terminology-binding",
          resourceType: "Observation",
          resourceId: obs.id,
          status: bound ? "pass" : "fail",
          detail: bound
            ? `code system ${coding.system} is bound by the interface.`
            : `code system ${coding.system} is not among bound systems [${contract.boundTerminologySystems.join(", ")}].`,
        });
      }

      const expected = coding?.code !== undefined ? unitByCode.get(coding.code) : undefined;
      if (expected === undefined) {
        checks.push({
          check: "unit-conformance",
          resourceType: "Observation",
          resourceId: obs.id,
          status: "not-applicable",
          detail: `no modeled observable for code ${coding?.code ?? "(uncoded)"}; unit not constrained by this interface.`,
        });
      } else {
        const actual = obs.valueQuantity?.code;
        const ok = actual === expected;
        checks.push({
          check: "unit-conformance",
          resourceType: "Observation",
          resourceId: obs.id,
          status: ok ? "pass" : "fail",
          detail: ok
            ? `UCUM ${actual} matches the SysML-modeled unit for ${coding?.code}.`
            : `UCUM ${actual ?? "(none)"} violates the SysML-modeled unit ${expected} for ${coding?.code}.`,
        });
      }
    }
  }

  const pass = checks.filter((c) => c.status === "pass").length;
  const fail = checks.filter((c) => c.status === "fail").length;
  const notApplicable = checks.filter((c) => c.status === "not-applicable").length;

  return {
    interfaceId: contract.interfaceId,
    interfaceName: contract.name,
    baselineId: contract.baselineId,
    bundleId: bundle.id,
    checkedAt,
    profile: contract.profile,
    fhirProfileValidation: "deferred-to-hl7-validator",
    checks,
    summary: { pass, fail, notApplicable },
    verdict: fail === 0 ? "conformant" : "non-conformant",
  };
}
