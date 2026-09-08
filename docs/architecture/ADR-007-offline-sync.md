# ADR-007: Offline operation and bounded bandwidth are architectural requirements

**Status:** accepted (edge implementation deferred)

## Decision

Exploration missions cannot assume continuous connectivity or terrestrial
OAuth availability. The architecture therefore treats these as requirements,
not future optimizations:

- **Telemetry is not FHIR.** Raw high-rate streams stay in telemetry/time-series
  formats at the edge; only clinically meaningful measurements, summaries,
  state changes and reports become FHIR resources. The ExMC model encodes
  this on `medicalDataPort` (store-and-forward, non-realtime, durable local
  queue) and the telemetry-bandwidth requirement `constrains` that port.
- **Sync primitives are FHIR-native.** Reconciliation uses FHIR version
  IDs/ETags/`If-Match` optimistic concurrency rather than an invented version
  mechanism. Edge sync records add transport reliability metadata (durable
  append-before-send, idempotent replay, content hashing, monotonic per-origin
  sequence numbers, bounded priority queues).
- **Authorization domains are separate.** Engineering API (OIDC/OAuth2),
  clinical API (SMART-on-FHIR where applicable), edge (locally enforceable
  policy with cached trust). The precise mission PKI model is an external
  security dependency.

The `sync-engine` and `edge-agent` packages from the reference architecture are
deliberately not in this first slice; their contracts are recorded here and in
the ICD's offline-behavior/buffering fields so nothing in the kernel assumes
connectivity.

## Consequence

Nothing in the trace, mapping or docgen layers requires a live FHIR server, a
live SysML service, or a network at all — as demonstrated by the hermetic demo.
