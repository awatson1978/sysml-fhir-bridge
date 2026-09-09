/**
 * SysML–FHIR Bridge canonical domain types.
 *
 * Architectural invariants (see docs/architecture/ADR-001):
 *  - SysML and FHIR remain independent semantic authorities.
 *  - The TraceLink graph is the only cross-domain authority.
 *  - Every source and target reference is version-pinned.
 */

export type TraceRelationship =
  | "realizes"
  | "satisfies"
  | "constrains"
  | "emits"
  | "consumes"
  | "operationalizes"
  | "verifiedBy"
  | "evidenceFor"
  | "documentedBy"
  | "derivedFrom";

/** Version-pinned reference into a SysML v2 model repository (project + commit + element). */
export interface SysMLRef {
  standard: "sysml-v2";
  projectId: string;
  commitId: string;
  elementId: string;
  qualifiedName?: string;
}

/** Version-pinned reference into the FHIR ecosystem (release + canonical/profile version or instance). */
export interface FhirRef {
  standard: "fhir";
  fhirVersion: string; // e.g. "4.0.1", "4.3.0", "5.0.0"
  canonical?: string; // profile / definitional artifact
  profileVersion?: string;
  resourceType?: string;
  logicalId?: string;
  versionId?: string;
}

/** Reference to an artifact that is deliberately NOT a FHIR resource (ICD, API schema, DICOM study, test log...). */
export interface ExternalArtifactRef {
  standard: "external";
  kind: string;
  uri: string;
  mimeType?: string;
  sha256?: string;
}

export type TraceTarget = FhirRef | ExternalArtifactRef;

export type TraceStatus = "draft" | "valid" | "stale" | "invalid" | "waived";
export type SemanticConfidence = "exact" | "strong" | "contextual";

/**
 * The first-class cross-domain relationship. Both sides evolve independently,
 * so a trace pins versions and hashes and carries an explicit validation state.
 * Historical TraceLinks are never deleted; they are superseded.
 */
export interface TraceLink {
  id: string;
  source: SysMLRef;
  relationship: TraceRelationship;
  target: TraceTarget;

  mappingRuleId: string;
  mappingRuleVersion: string;

  status: TraceStatus;
  statusReason?: string;
  semanticConfidence?: SemanticConfidence;

  createdAt: string;
  createdBy: string;

  sourceHash?: string;
  targetHash?: string;
  provenanceId: string;

  /** id of the TraceLink this one replaces, if any. */
  supersedes?: string;
}

/** A human-approved rule describing how (or that) a SysML concept crosses to FHIR. */
export interface MappingRule {
  id: string;
  version: string;
  description: string;
  /** Normalized SysML element kind this rule consumes (e.g. "PartDefinition"). */
  sourceKind: string;
  relationship: TraceRelationship;
  /** Empty array means: no semantically legitimate direct mapping (external artifact instead). */
  targetResourceTypes: string[];
  cardinality: string;
  semanticConfidence: SemanticConfidence;
  notes?: string;
}

/** Complete provenance for one transformation run (ADR: every transformation records its inputs). */
export interface TransformationRun {
  transformationId: string;
  timestamp: string;
  source: {
    sysmlProjectId: string;
    sysmlCommitId: string;
    elementIds: string[];
  };
  target: {
    fhirPackage: string;
    resources: string[];
  };
  ruleset: { id: string; version: string };
  generator: { name: string; version: string; buildDigest: string };
  artifacts: { name: string; sha256: string }[];
}

export type VerificationMethod =
  | "test"
  | "analysis"
  | "inspection"
  | "demonstration"
  | "simulation";

export interface VerificationCase {
  id: string;
  name: string;
  requirement: SysMLRef;
  method: VerificationMethod;
  description: string;
  executedAgainstBaseline?: string;
}

export interface VerificationResult {
  id: string;
  caseId: string;
  status: "pass" | "fail" | "inconclusive";
  executedAt: string;
  evidence: ExternalArtifactRef[];
}

export type GeneratedArtifactKind =
  | "fhir-example"
  | "fhir-profile-binding"
  | "icd"
  | "diagram"
  | "verification-matrix"
  | "manifest"
  | "other";

export interface GeneratedArtifact {
  name: string;
  kind: GeneratedArtifactKind;
  path: string;
  sha256: string;
}

/**
 * The release definition: which exact engineering model, FHIR package, mapping
 * rules and generated artifacts constitute a baseline. Generated documents must
 * be reproducible from this manifest alone.
 */
export interface BaselineManifest {
  baselineId: string;
  sysml: { projectId: string; commitId: string };
  git: { sha: string };
  fhirPackage: { name: string; version: string; fhirVersion: string };
  mappingRules: string;
  docTemplates: string;
  simConfig?: string;
  generatedAt: string;
  generator: { name: string; version: string; buildDigest: string };
  artifacts: GeneratedArtifact[];
}

/** Persistent SysML 1.x -> v2 migration identity record. */
export interface MigrationCrosswalkEntry {
  legacy: { tool: string; modelId: string; qualifiedName: string };
  sysmlV2: { projectId: string; elementId: string };
  migrationRule: string;
  status: "proposed" | "accepted" | "rejected";
}

export type ChangeProposalKind =
  | "new-observable"
  | "requirement-revision"
  | "re-verify"
  | "retire-element";

/**
 * A design-feedback item from the learning loop: runtime clinical evidence
 * proposing a change to the engineering model. Proposals are inputs to human
 * review (they become a proposed SysML branch/commit), never direct mutations
 * — FHIR is never reconstructed as SysML (ADR-001, ADR-008).
 */
export interface ChangeProposal {
  id: string;
  kind: ChangeProposalKind;
  targetElementId?: string;
  title: string;
  rationale: string;
  evidence: {
    resourceType: string;
    resourceId: string;
    code?: string;
    system?: string;
  }[];
  proposedAt: string;
  status: "proposed" | "accepted" | "rejected";
}

export function isFhirRef(t: TraceTarget): t is FhirRef {
  return t.standard === "fhir";
}

export function isExternalArtifactRef(t: TraceTarget): t is ExternalArtifactRef {
  return t.standard === "external";
}
