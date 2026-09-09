# ADR-004: FHIR version is part of the interface contract

**Status:** accepted

## Decision

The FHIR deployment release is unspecified by the mission context, so
SysML–FHIR Bridge never hard-codes one FHIR release into the trace model. Every
`FhirRef` carries `fhirVersion`, and profile references carry
`profileVersion`. `packages/fhir-adapter` exposes a `FhirAdapter` boundary
(`R5Adapter` implemented; R4/R4B adapters slot in beside it) that mints
version-pinned references and canonical URLs.

Conformance authority stays with HL7 tooling: profiles are source-controlled
as FHIR Shorthand (`fsh/`, built with SUSHI), and generated resources are to be
validated with the HL7 FHIR Validator in CI. The minimal resource typings in
`fhir-adapter` exist for compile-time safety inside the mapping engine, not as
a substitute for FHIR validation.

## Consequence

A profile version bump is a first-class staleness event for every dependent
trace, and multi-release deployments are an adapter choice, not a rewrite.
