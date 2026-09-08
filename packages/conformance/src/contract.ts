/**
 * The machine-readable InterfaceContract: the single source that BOTH the
 * human ICD (docgen) and the conformance checker are projections of (ADR-009).
 *
 * It holds only the machine-checkable subset of an interface specification.
 * Prose fields (security narrative, offline behavior, etc.) live in the ICD
 * projection, not here.
 */
export interface InterfaceContract {
  interfaceId: string;
  name: string;
  baselineId: string;
  direction: string;
  /** FHIR resource types permitted to flow over this interface. */
  permittedPayloadTypes: string[];
  /** The governing FHIR profile — its FHIR-level conformance is the HL7 validator's job. */
  profile: { canonical: string; version: string; fhirVersion: string };
  /** Terminology systems the interface binds (e.g. LOINC, UCUM). */
  boundTerminologySystems: string[];
  /** Modeled observable units: clinical code -> expected UCUM code. */
  observableUnits: { code: string; ucum: string }[];
  /** Interface cardinality statements (informational in the report). */
  cardinality: string[];
}
