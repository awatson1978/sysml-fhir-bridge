/**
 * Normalized DTOs over the OMG Systems Modeling API & Services resource model.
 *
 * SysML–FHIR Bridge does NOT re-implement SysML v2 language semantics (ADR-002).
 * These types normalize what the official API returns (projects, commits,
 * elements, owned-element traversal) into strongly typed structures while
 * retaining unknown fields in `raw` for forward compatibility.
 */

export type SysmlElementKind =
  | "RequirementUsage"
  | "RequirementDefinition"
  | "PartDefinition"
  | "PartUsage"
  | "PortUsage"
  | "AttributeUsage"
  | "ActionDefinition"
  | "ConstraintUsage"
  | "InterfaceUsage"
  | "Unknown";

export interface SysmlRelationshipEdge {
  /** e.g. "satisfies", "definedBy", "verifiedBy" */
  type: string;
  targetElementId: string;
}

export interface SysmlElement {
  elementId: string;
  kind: SysmlElementKind;
  name: string;
  qualifiedName: string;
  ownerId?: string;
  documentation?: string;
  /** Engineering metadata (units, deployment bindings, device-type markers...). Never PHI. */
  metadata?: Record<string, unknown>;
  relationships?: SysmlRelationshipEdge[];
  /** Unrecognized fields from the underlying API payload, preserved verbatim. */
  raw?: Record<string, unknown>;
}

export interface SysmlProject {
  projectId: string;
  name: string;
  defaultBranch?: string;
}

export interface SysmlCommit {
  projectId: string;
  commitId: string;
  description?: string;
  previousCommitId?: string;
  created?: string;
}
