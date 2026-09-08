# NodeOnSysML

**A bridge between how engineers design a system and how that system's data is
actually recorded in the real world — with automatic bookkeeping that tells you
what breaks when either side changes.**

The worked example is a spacecraft medical bay: an ultrasound device on a
long-duration mission. But the idea is general.

---

## The problem, in plain English

Imagine a lunar mission's medical bay. Two completely different groups describe
the *same* ultrasound machine:

- **Engineers** write blueprints: *"there shall be a diagnostic ultrasound,"*
  *"medical data must fit within the downlink budget."* The standard language
  for those blueprints is **SysML** — think "CAD for requirements and system
  design."
- **Medical software** speaks **FHIR** — the standard format hospitals use for
  real health data: *"heart rate 72 bpm, measured by device SN-0001 at 16:22."*

The blueprint and the health record describe the same machine, but nothing
connects them. So when an engineer changes the blueprint — *"bad news, you get
less bandwidth now"* — nobody automatically knows which data formats, documents,
and tests just became wrong. On real programs, people find out by hand, in
review meetings, months later.

**NodeOnSysML is the missing connective layer.** It keeps the two worlds
separate (they mean different things and should never be merged), and instead
maintains an explicit, versioned set of *links* between them. When either side
changes, it tells you exactly what those links now put at risk.

## What it actually does

Three things:

1. **Records the connections.** *"Requirement REQ-042 constrains this clinical
   data format."* Each link remembers which exact version of each side it was
   based on, using content fingerprints.
2. **Tells you what broke.** Change a requirement and the affected links turn
   **stale** ("re-check me"). Delete a sensor and its links turn **invalid**
   ("this points at nothing now"). That's automated "what does this change
   break?" — normally a manual, slow, error-prone job.
3. **Generates the paperwork.** The Interface Control Document, the verification
   matrix, the diagrams — all produced *from* the model, so they can never
   silently fall out of date. Regenerated, never hand-edited.

It also closes the loop in both directions with the clinical side: it can
publish the whole link graph as standard FHIR for hospital-style tooling to
read, and it can take **real runtime data back in** as design feedback (e.g.
"the device is reporting a unit the design never specified — here's a proposed
change for a human to review").

## See it without reading any code

Open these files directly in a browser (they're committed, so they work
immediately):

- **`generated/trace-explorer.html`** — an interactive map of the whole thing.
  Requirements on the left, the engineering model in the middle, the clinical
  data formats on the right, with colored links between them. **Use the toggle
  at the top** (`Baseline → Post-change → Runtime evidence`) and watch the
  impact analysis happen live: links turn amber (needs recheck) and red
  (broken), and a deleted part gets struck through. Click anything for details.
- **`generated/exmc-medical-icd.html`** — the auto-generated Interface Control
  Document, formatted like a real engineering data package. Nobody typed it; it
  was built from the model.
- **`generated/conformance-report.html`** — a pass/fail certificate answering
  *"does the real device data actually honor the interface the ICD describes?"*
  (Spoiler: one reading's units drifted, so it's **non-conformant** — the exact
  kind of problem that's easy to miss by eye.)

## Try it yourself

```bash
npm install
npm run demo      # runs the whole pipeline, regenerates everything in generated/
npm test          # 35 tests
npm run api       # optional: REST API at http://localhost:4114/v1/traces
```

`npm run demo` needs no network and is **deterministic** — run it twice and the
output is byte-for-byte identical. That's on purpose: a generated document you
can trust is one you can regenerate and diff.

## The one rule everything follows

**SysML and FHIR stay independent authorities. NodeOnSysML owns only the links
between them.** It never rewrites an engineering model as health data, or vice
versa. The same discipline applies to the imaging side (DICOM stays the imaging
authority) and, in the inbound loop, to patient privacy: no patient-identifying
information is ever allowed into the engineering model.

This mirrors something FHIR people already know: FHIR is "just JSON," yet JSON
doesn't make FHIR redundant — the value is the shared agreement about what the
data *means*. SysML is the same kind of thing for engineering. Neither reduces
to the other; the interesting product is the governed bridge, which is what
lives here.

---

## For engineers: how it's built

The demo pipeline (`apps/demo`), step by step:

1. Loads the ExMC ultrasound example model
   (`models/examples/exmc-ultrasound/model.json`) — a fixture shaped like OMG
   Systems Modeling API responses, two commits deep.
2. Runs the **PHI guard** (engineering model must be free of patient identity).
3. Transforms SysML → FHIR under a human-approved ruleset
   (`models/mappings/exmc-mappings.json`). A SysML *port* has no honest FHIR
   equivalent, so it produces an explicit **`NO_DIRECT_MAPPING`** warning plus a
   generated interface contract — the refusal is a feature, not a gap.
4. Mints version-pinned **TraceLinks** (commit + content hashes + rule version +
   provenance) into an append-only store.
5. Generates FHIR examples, the **Interface Control Document** (md + html), the
   **verification matrix**, and diagrams (Mermaid + PlantUML sources, real SVG
   via nomnoml).
6. Runs an **impact pass** against the second SysML commit: a tightened
   requirement marks its trace **stale**; a deleted metric marks its traces
   **invalid** (never silently dangling).
7. Runs the **bidirectional FHIR loop** (ADR-008): *outbound*, the trace graph
   becomes a FHIR **Bundle** (mapping rules → **ConceptMap** with honest
   relationship codes and `noMap`; transformation → **Provenance**; ICD →
   **DocumentReference**). *Inbound*, simulated runtime clinical data is
   reconciled against the model into **ChangeProposals** — an evidence match, a
   coverage gap, and a unit-drift violation that marks a trace *stale from
   evidence*.
8. Runs **interface conformance** (ADR-009): checks the runtime bundle against
   the machine-readable contract the ICD projects. FHIR profile conformance is
   deferred to the HL7 FHIR Validator — this layer checks only what the
   interface contract adds (permitted payloads, modeled units, terminology
   bindings).
9. Emits the **TransformationRun** provenance and the **BaselineManifest**
   binding SysML commit, Git SHA, FHIR package, ruleset version, and the sha256
   of every generated artifact.

### Repository layout

| Path | Contents |
| --- | --- |
| `packages/model-core` | Canonical domain types (TraceLink, MappingRule, BaselineManifest…), canonical-JSON hashing, Ajv schema validation |
| `packages/sysml-v2-client` | Systems-Modeling-API-shaped boundary + fixture implementation (ADR-002) |
| `packages/fhir-adapter` | Version-pinned FHIR reference minting, minimal R5 typings (ADR-004) |
| `packages/trace-engine` | TraceLink creation, staleness/invalidation rules, append-only store (ADR-003) |
| `packages/mapping-engine` | Ruleset-driven SysML→FHIR transform, unit crosswalk (no silent coercion), PHI guard |
| `packages/fhir-loop` | Bidirectional FHIR bridge: trace graph → FHIR Bundle, and runtime FHIR → ChangeProposals (ADR-008) |
| `packages/conformance` | Checks a FHIR Bundle against the InterfaceContract the ICD projects; FHIR profile conformance deferred to HL7 (ADR-009) |
| `packages/docgen` | Deterministic ICD + verification-matrix generation (ADR-006) |
| `packages/render-*` | Diagram projections: Mermaid, nomnoml (SVG), PlantUML (ADR-005) |
| `apps/demo` | The vertical-slice pipeline (`npm run demo`) |
| `apps/api` | REST surface: `/v1/traces`, `/v1/impact/...` (see `openapi/openapi.json`) |
| `schemas/` | JSON Schemas for every internal contract |
| `models/` | Example SysML fixture + mapping ruleset + runtime evidence |
| `fsh/` | FHIR Shorthand profiles/examples (build with SUSHI; validate with HL7 Validator) |
| `docs/architecture/` | Architecture Decision Records ADR-001 … ADR-009 |
| `tests/acceptance/` | Acceptance tests from the design document |

### Reproducing the generated artifacts

Everything under `generated/` is a projection of the model + pipeline:

```bash
npm install && npm run demo
git diff --stat generated/   # empty on an unchanged baseline
```

Determinism comes from fixed baseline timestamps (no wall clock),
content-hash-derived IDs, and sorted output everywhere.

### Background

This repository implements the first vertical slice of an internal reference
architecture for SysML–FHIR digital-thread integration, targeted at NASA
Exploration Medical Capability (ExMC) exploration medical systems. The design
rationale is captured as nine ADRs in `docs/architecture/`.

### Deliberately out of scope (for now)

Live HTTP client for a SysML v2 service (the interface boundary is in place);
SUSHI + HL7 Validator CI wiring; the offline sync/edge queue (contracts in
ADR-007); simulation adapters; SysML 1.x migration; and any production UI. The
point of this slice is one honest end-to-end semantic thread, not breadth.
