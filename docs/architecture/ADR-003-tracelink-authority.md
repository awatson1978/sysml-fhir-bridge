# ADR-003: The TraceLink graph is a first-class, append-only product

**Status:** accepted

## Decision

Cross-domain relationships are `TraceLink` records (schema:
`schemas/trace-link.schema.json`), not foreign keys. Both endpoints evolve
independently, so a trace pins:

- source: SysML `projectId + commitId + elementId` plus a semantic content hash,
- target: FHIR release version + canonical/profile version (or instance
  id/version), or an external artifact reference with hash,
- the mapping rule id **and version** that justified the crossing,
- provenance id, creator, timestamps, and an explicit status.

Status semantics: `draft | valid | stale | invalid | waived`. A trace is marked
**stale** (pending re-verification) when a source hash, target hash, profile
version, mapping-rule version, terminology dependency or governing baseline
changes; **invalid** when either endpoint disappears. Historical TraceLinks are
never deleted or mutated: status transitions append a superseding record
(`TraceStore.transition`), preserving enough history to reconstruct every
released baseline.

## Consequence

"What does this requirement change break downstream?" is a pure graph
evaluation (`evaluateTrace`) — demonstrated by `generated/impact-report.json`.
