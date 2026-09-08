/**
 * Minimal FHIR R5 resource typings for the resource set NodeOnSysML emits.
 *
 * These are deliberately NOT a complete FHIR object model: the HL7 FHIR
 * Validator remains the conformance authority (ADR-004). They exist so that
 * generated artifacts are well-typed inside the mapping engine.
 */

export interface Coding {
  system?: string;
  code: string;
  display?: string;
}

export interface CodeableConcept {
  coding?: Coding[];
  text?: string;
}

export interface Quantity {
  value?: number;
  unit?: string;
  system?: string;
  code?: string;
}

export interface Reference {
  reference: string;
  display?: string;
}

export interface Meta {
  profile?: string[];
  versionId?: string;
}

interface ResourceBase {
  id: string;
  meta?: Meta;
}

export interface DeviceDefinition extends ResourceBase {
  resourceType: "DeviceDefinition";
  description?: string;
  modelNumber?: string;
  classification?: { type: CodeableConcept }[];
}

export interface Device extends ResourceBase {
  resourceType: "Device";
  status?: "active" | "inactive" | "entered-in-error";
  definition?: Reference;
  serialNumber?: string;
  modelNumber?: string;
  location?: Reference;
  note?: { text: string }[];
}

export interface DeviceMetric extends ResourceBase {
  resourceType: "DeviceMetric";
  type: CodeableConcept;
  unit?: CodeableConcept;
  device: Reference;
  category: "measurement" | "setting" | "calculation" | "unspecified";
  operationalStatus?: "on" | "off" | "standby" | "entered-in-error";
}

export interface Observation extends ResourceBase {
  resourceType: "Observation";
  status: "registered" | "preliminary" | "final" | "amended";
  code: CodeableConcept;
  subject?: Reference;
  device?: Reference;
  valueQuantity?: Quantity;
  effectiveDateTime?: string;
}

export interface ActivityDefinition extends ResourceBase {
  resourceType: "ActivityDefinition";
  status: "draft" | "active" | "retired" | "unknown";
  name?: string;
  title?: string;
  description?: string;
  kind?: string;
  url?: string;
  version?: string;
}

export interface DiagnosticReport extends ResourceBase {
  resourceType: "DiagnosticReport";
  status: "registered" | "partial" | "preliminary" | "final";
  code: CodeableConcept;
  subject?: Reference;
  result?: Reference[];
}

export interface Procedure extends ResourceBase {
  resourceType: "Procedure";
  status: "preparation" | "in-progress" | "completed" | "not-done";
  instantiatesCanonical?: string[];
  code?: CodeableConcept;
  subject?: Reference;
  report?: Reference[];
}

export interface DocumentReference extends ResourceBase {
  resourceType: "DocumentReference";
  status: "current" | "superseded" | "entered-in-error";
  description?: string;
  content: {
    attachment: {
      contentType?: string;
      url?: string;
      hash?: string;
      title?: string;
    };
  }[];
}

export interface Provenance extends ResourceBase {
  resourceType: "Provenance";
  target: Reference[];
  recorded: string;
  agent: {
    type?: CodeableConcept;
    who: { display: string };
  }[];
  entity?: {
    role: "revision" | "quotation" | "source" | "instantiates" | "removal";
    what: Reference;
  }[];
}

/** R5 ConceptMap relationship codes (the honest vocabulary for crosswalks). */
export type ConceptMapRelationship =
  | "related-to"
  | "equivalent"
  | "source-is-narrower-than-target"
  | "source-is-broader-than-target"
  | "not-related-to";

export interface ConceptMap extends ResourceBase {
  resourceType: "ConceptMap";
  url?: string;
  version?: string;
  name?: string;
  title?: string;
  status: "draft" | "active" | "retired" | "unknown";
  description?: string;
  group: {
    source?: string;
    target?: string;
    element: {
      code: string;
      display?: string;
      noMap?: boolean;
      target?: {
        code: string;
        display?: string;
        relationship: ConceptMapRelationship;
        comment?: string;
      }[];
    }[];
  }[];
}

export interface Bundle extends ResourceBase {
  resourceType: "Bundle";
  type: "collection" | "transaction" | "batch" | "searchset";
  entry: { resource: FhirResource }[];
}

export type FhirResource =
  | DeviceDefinition
  | Device
  | DeviceMetric
  | Observation
  | ActivityDefinition
  | DiagnosticReport
  | Procedure
  | DocumentReference
  | Provenance
  | ConceptMap
  | Bundle;

export type FhirResourceType = FhirResource["resourceType"];
