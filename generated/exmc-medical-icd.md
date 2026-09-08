# ExMC Medical Data Interface — Interface Control Document

## Interface identity and baseline

| Field | Value |
| --- | --- |
| Baseline | `exmc-pdr-2027.03` |
| SysML project | `medical-system-foundation` |
| SysML commit | `sysml-8df65f0d` |
| FHIR package | `org.example.exmc#0.4.0` (FHIR 5.0.0) |
| Mapping rules | `1.8.2` |
| Doc templates | `3.2.0` |
| Generator | `nodeonsysml 0.1.0` |
| Generated at | 2027-03-18T16:22:00Z |

## Interface: medicalDataPort {#medical-data-port}

Source element: `port-medical-data` (`MedicalSystem::ExmcUltrasound::medicalDataPort`)

| Field | Value |
| --- | --- |
| Owning part | ExmcUltrasound |
| Connected systems | Local medical record (xEHR), Store-and-forward comm link |
| Direction | outbound (device → medical data system) |
| Payload / resource types | Observation, DiagnosticReport |
| FHIR profiles | `https://example.org/fhir/exmc/StructureDefinition/exmc-physiology-observation` v0.4.0 (FHIR 5.0.0) |
| Terminology bindings | http://loinc.org — observation codes where clinically standard<br>http://unitsofmeasure.org — all quantities carry UCUM codes |
| Cardinalities | 1 modeled metric capability -> 0..* DeviceMetric<br>1 modeled observable -> 1 profile definition; 0..N runtime Observations |
| Units | bpm → UCUM `/min`<br>cm/s → UCUM `cm/s` |
| Update frequency / volume | on clinical event |
| Latency / priority | non-realtime |
| Offline behavior | durable local queue, idempotent replay |
| Buffering / retry | bounded durable queue; urgent clinical events precede bulk archival transfer |
| Security / authorization | engineering API: OIDC/OAuth2; clinical API: SMART-on-FHIR where applicable; edge: locally enforceable policy with cached trust |
| Error semantics | explicit mapping warnings (NO_DIRECT_MAPPING); no silent unit or cardinality coercion; conflicts reconciled via FHIR version/ETag semantics |
| Data provenance | TransformationRun tx-exmc-0001, ruleset exmc-mappings@1.8.2, generator nodeonsysml@0.1.0 |
| Power / compute / network | store-and-forward under the downlink budget allocated by MedicalTelemetryBandwidth (req-telemetry-014); no continuous-connectivity assumption |

### Constraining requirements

- **MedicalTelemetryBandwidth** (`req-telemetry-014`): Clinically meaningful physiologic observations shall be transmissible within an allocated downlink budget of 50 kbit/s sustained.

### Verification

| Case | Method | Status | Evidence |
| --- | --- | --- | --- |
| UltrasoundDiagnosticWorkflowTest (`VER-042`) | demonstration | pass | tests/acceptance/vertical-slice.test.ts<br>generated/fhir/observation-heart-rate-metric-example.json (`22df30cc4fc99026…`) |

## Change history

| SysML commit | Description |
| --- | --- |
| `sysml-8df65f0d` | PDR baseline: ultrasound subsystem with telemetry requirement |
| `sysml-a1b2c3d4` | Telemetry requirement tightened to 30 kbit/s; doppler velocity metric removed pending sensor descope |
