# ADR-009: The ICD and the conformance checker are dual projections of one InterfaceContract

**Status:** accepted

## Context

Can a FHIR Bundle be "validated against the ICD"? Not against the *document* —
the ICD is human paperwork, a rendered projection; parsing it back into rules
would derive machine truth from a view (violating ADR-005/006). But the
question is right in spirit: an interface *does* impose machine-checkable
constraints, and the ICD is one rendering of them.

## Decision

Introduce a machine-readable **InterfaceContract**
(`packages/conformance/src/contract.ts`) holding the checkable subset of an
interface spec: permitted payload types, governing profile (canonical +
version), bound terminology systems, and SysML-modeled observable units
(clinical code → UCUM). Both the human ICD and the conformance checker are
projections of this one contract, built from the same model/ruleset data, so
they cannot disagree.

`checkBundleAgainstContract(contract, bundle)` produces a **ConformanceReport**
with per-resource checks:

- **permitted-payload** — is this resource type allowed on the interface? (a
  SysML *port* fact, absent from any FHIR StructureDefinition)
- **unit-conformance** — does the runtime UCUM match the SysML-modeled unit?
  (resolved through the ruleset's explicit crosswalk; the check FHIR profile
  validation alone would miss)
- **terminology-binding** — is the code's system one the interface bound?

**The boundary (ADR-004 restated):** the report carries
`fhirProfileValidation: "deferred-to-hl7-validator"` and NEVER claims to do
FHIR StructureDefinition conformance. SysML–FHIR Bridge checks only the
*interface-contract* layer that sits above FHIR profile validation; the HL7
FHIR Validator remains the profile-conformance authority.

## Relationship to the evidence loop (ADR-008)

The conformance checker and the evidence importer read the *same* runtime data
through different lenses:

| | question | output | consumer |
| --- | --- | --- | --- |
| Evidence importer | should the **design** change? | ChangeProposals | engineering review |
| Conformance checker | does the **data** honor the contract? | pass/fail report | V&V / operations |

A single unit drift is a `requirement-revision` proposal to one and a
`unit-conformance` failure to the other. The conformance report is therefore a
legitimate **verification-evidence** artifact — the machine-checkable sibling
of the ICD, and a natural backing for a VerificationResult.

## Consequence

"Does this bundle satisfy the interface?" becomes a first-class, deterministic
operation whose verdict is honest about what it did and did not check.
