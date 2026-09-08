# ADR-002: SysML v2 API-first, no native parser in the MVP

**Status:** accepted

## Decision

NodeOnSysML consumes SysML v2 through the OMG Systems Modeling API & Services
semantics (projects, commits, branches, elements, owned-element traversal)
rather than re-implementing SysML language semantics in TypeScript.
`packages/sysml-v2-client` defines the boundary interface plus normalized DTOs
that retain unknown fields (`raw`) for forward compatibility. The reference
implementation is fixture-backed (`FixtureSysmlService`) serving committed JSON
snapshots shaped like API responses; an HTTP client against a compliant model
service drops in behind the same interface.

A native textual parser (Langium or generated from the official grammar) is a
later phase, only after integration value is demonstrated — writing a SysML
parser first would spend effort on the hardest and least differentiating
problem.

## Consequence

The kernel is testable offline and hermetic today, and the SysML repository
remains the semantic authority for the engineering model.
