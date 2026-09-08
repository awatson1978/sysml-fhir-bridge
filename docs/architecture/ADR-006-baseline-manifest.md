# ADR-006: Releases are defined by a BaselineManifest; generated documents are reproducible

**Status:** accepted

## Decision

A release is defined by `generated/baseline-manifest.json` (schema:
`schemas/baseline-manifest.schema.json`), which cross-links the exact SysML
project/commit, Git SHA, FHIR package version, mapping-ruleset version, doc
template version, generator build digest, and the sha256 of every generated
artifact. This avoids two competing version-control histories: a Git SHA is
never silently treated as equivalent to a SysML commit — the manifest binds
them explicitly.

Determinism rules enforced by the pipeline (`apps/demo`):

- no wall-clock or randomness in generation; timestamps come from baseline
  inputs;
- stable ordering everywhere (sorted nodes/edges, sorted element lists);
- deterministic IDs derived from content hashes (`deterministicId`);
- re-running the pipeline on an unchanged baseline produces byte-identical
  artifacts (verified: `diff -r` clean across runs).

## Consequence

An ICD or diagram can be trusted as a *view of the model at a baseline*, and
any divergence is detectable by hash.
