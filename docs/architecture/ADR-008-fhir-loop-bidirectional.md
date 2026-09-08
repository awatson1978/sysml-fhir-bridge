# ADR-008: Bidirectional FHIR loop — projection out, evidence in (never mutation in)

**Status:** accepted

## Context

FHIR-native stakeholders want to consume the digital thread in their own idiom,
and learning-health-system practice wants runtime clinical data to feed back
into design iteration. Both are legitimate; both risk violating ADR-001 if done
naively (putting engineering governance inside the clinical authority, or
reconstructing FHIR as SysML).

## Decision

Two asymmetric directions, implemented in `packages/fhir-loop`.

**Outbound — `projectTraceGraphToFhir` (trace graph → FHIR Bundle).**
A *projection*, not a handover of authority. The trace graph is rendered as:
- mapping rules → a **ConceptMap** using honest R5 relationship codes
  (`equivalent` / `source-is-narrower-than-target` / `related-to`) and
  **`noMap: true`** for NO_DIRECT_MAPPING rules — a semantically legitimate
  non-mapping, not a gap;
- the transformation run → **Provenance**;
- generated documents → **DocumentReference**.
NodeOnSysML remains the trace authority; the Bundle is derived and regenerable.
This mirrors FHIR's own canonical-resource pattern, and is the cross-standard
generalization of terminology mapping (ConceptMap between *standards*, not just
code systems).

**Inbound — `importFhirEvidence` (runtime FHIR → design feedback).**
The learning loop. Runtime Observations/Procedures are interpreted *against* the
model, never reconstructed as SysML. The importer is deliberately heuristic
(LOINC-hint / canonical matching) and honest about confidence. It produces:
- **evidence matches** — runtime data a modeled observable predicted;
- **coverage gaps** (`NO_DESIGN_COVERAGE`) — runtime data with no modeled
  counterpart → a `new-observable` **ChangeProposal**;
- **constraint violations** (`UNIT_DRIFT`) — runtime data contradicting the
  model, resolved through the ruleset's explicit unit crosswalk (no silent
  coercion) → a `requirement-revision` proposal, **and** a trace marked *stale
  from evidence* via `evaluateTrace({ contradictedByEvidence })`.

**The hard boundary:** inbound produces `ChangeProposal` records (schema:
`schemas/change-proposal.schema.json`), which are inputs to human review — a
proposed SysML branch/commit — never automatic model edits. PHI is stripped at
the boundary (`deidentify`): only the coded, quantitative shell of a resource
is allowed to inform the engineering side.

## Consequence

The digital thread is legible to FHIR tooling (outbound) and design iteration
closes on real operational evidence (inbound), while both authorities stay
independent. The trace explorer's third state ("Runtime evidence") visualizes
the loop closing: a link goes stale because the world disagreed with the model,
not because an engineer edited it.
