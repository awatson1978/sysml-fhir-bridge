import type {
  ExternalArtifactRef,
  FhirRef,
  MappingRule,
  SemanticConfidence,
  TraceRelationship,
} from "@nodeonsysml/model-core";
import type { FhirResource } from "@nodeonsysml/fhir-adapter";

export interface MappingRuleset {
  rulesetId: string;
  rulesetVersion: string;
  rules: MappingRule[];
  unitCrosswalk: {
    description: string;
    entries: Record<string, string>;
  };
}

export interface MappingWarning {
  code: "NO_DIRECT_MAPPING" | "SKIPPED";
  elementId: string;
  message: string;
}

export interface MappingError {
  code: "UNIT_UNMAPPED" | "MISSING_DEPLOYMENT_BINDING" | "RULE_NOT_FOUND";
  elementId: string;
  message: string;
}

/** One artifact produced by a transformation, with everything needed to mint its TraceLink. */
export interface GeneratedMapping {
  artifactType: "FHIRExample" | "FHIRProfileBinding" | "ICDContract";
  sourceElementId: string;
  ruleId: string;
  ruleVersion: string;
  relationship: TraceRelationship;
  semanticConfidence: SemanticConfidence;
  target: FhirRef | ExternalArtifactRef;
  /** Present for FHIRExample artifacts. */
  resource?: FhirResource;
}

export interface TransformResult {
  generated: GeneratedMapping[];
  warnings: MappingWarning[];
  errors: MappingError[];
}
