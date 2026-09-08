# ADR-001: SysML and FHIR remain independent semantic authorities

**Status:** accepted

## Decision

SysML v2 owns design-time engineering semantics (requirements, structure,
behavior, constraints, verification relationships). FHIR owns clinical/runtime
semantics (Device, DeviceMetric, Observation, DiagnosticReport, workflow,
provenance, audit). NodeOnSysML never serializes SysML into FHIR or
reconstructs FHIR as SysML blocks. The only cross-domain authority is the
versioned TraceLink graph (`packages/trace-engine`).

Corollaries enforced in code:

- A SysML part definition is *not* a FHIR `Device`; it may be `documentedBy` a
  `DeviceDefinition` (type/kind), and only a deployment binding creates a
  runtime `Device` (`packages/mapping-engine`).
- A requirement is never a FHIR resource; it `constrains` FHIR artifacts via
  TraceLink only.
- No PHI enters the engineering model. Crew roles are modeled; clinical
  identity lives in FHIR `Patient` behind a deployment/reference binding. The
  PHI guard (`findPhiViolations`) rejects patient-identifiable fields in
  engineering metadata.

## Consequence

Mappings that would collapse the two realities are structurally impossible;
the cost is that every crossing must be an explicit, versioned trace.
