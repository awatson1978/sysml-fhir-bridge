import {
  isFhirRef,
  type TraceLink,
  type TransformationRun,
} from "@sysml-fhir-bridge/model-core";
import type { MappingRuleset } from "@sysml-fhir-bridge/mapping-engine";
import type {
  Bundle,
  ConceptMap,
  ConceptMapRelationship,
  DocumentReference,
  Provenance,
} from "@sysml-fhir-bridge/fhir-adapter";

/**
 * Outbound projection (ADR-008): render the cross-domain trace graph as a FHIR
 * Bundle so FHIR-native tooling can consume the digital thread in its own
 * idiom. This is a *projection*, not a handover of authority — SysML–FHIR Bridge
 * remains the trace authority; the Bundle is a derived, regenerable view.
 *
 * Mapping rules become a ConceptMap (with honest relationship codes and noMap
 * for NO_DIRECT_MAPPING); the transformation run becomes Provenance; generated
 * documents become DocumentReference.
 */
export interface ProjectToFhirInput {
  canonicalBase: string;
  ruleset: MappingRuleset;
  traces: TraceLink[];
  transformationRun: TransformationRun;
  documents: { title: string; path: string; contentType: string; sha256: string }[];
}

/** Semantic confidence -> ConceptMap relationship code. */
function confidenceToRelationship(
  confidence: string | undefined,
  hasTarget: boolean,
): ConceptMapRelationship {
  if (!hasTarget) return "not-related-to";
  switch (confidence) {
    case "exact":
      return "equivalent";
    case "strong":
      return "source-is-narrower-than-target";
    default:
      return "related-to";
  }
}

export function projectTraceGraphToFhir(input: ProjectToFhirInput): Bundle {
  const conceptMap = buildConceptMap(input);
  const provenance = buildProvenance(input);
  const docRefs = input.documents.map((doc, i) => buildDocumentReference(doc, i));

  return {
    resourceType: "Bundle",
    id: "sysml-fhir-bridge-trace-projection",
    type: "collection",
    entry: [
      { resource: conceptMap },
      { resource: provenance },
      ...docRefs.map((resource) => ({ resource })),
    ],
  };
}

function buildConceptMap(input: ProjectToFhirInput): ConceptMap {
  // Group traces by their mapping rule so each rule becomes one ConceptMap element.
  const byRule = new Map<string, TraceLink[]>();
  for (const trace of input.traces) {
    const list = byRule.get(trace.mappingRuleId) ?? [];
    list.push(trace);
    byRule.set(trace.mappingRuleId, list);
  }

  const element = [...byRule.keys()]
    .sort()
    .map((ruleId) => {
      const rule = input.ruleset.rules.find((r) => r.id === ruleId);
      const traces = byRule.get(ruleId) ?? [];
      const targets = traces
        .filter((t) => isFhirRef(t.target))
        .map((t) => {
          const target = t.target;
          if (!isFhirRef(target)) return undefined;
          const code = target.canonical ?? `${target.resourceType}/${target.logicalId}`;
          return {
            code,
            relationship: confidenceToRelationship(t.semanticConfidence, true),
            ...(rule?.description ? { comment: rule.description } : {}),
          };
        })
        .filter((v): v is NonNullable<typeof v> => v !== undefined)
        .sort((a, b) => a.code.localeCompare(b.code));

      const noMap = targets.length === 0;
      return {
        code: ruleId,
        ...(rule?.sourceKind ? { display: `${rule.sourceKind} (${rule.relationship})` } : {}),
        ...(noMap ? { noMap: true } : { target: targets }),
      };
    });

  return {
    resourceType: "ConceptMap",
    id: `${input.ruleset.rulesetId}-crosswalk`,
    url: `${input.canonicalBase}/ConceptMap/${input.ruleset.rulesetId}`,
    version: input.ruleset.rulesetVersion,
    name: "SysMLtoFHIRCrosswalk",
    title: "SysML v2 -> FHIR mapping crosswalk (SysML–FHIR Bridge integration profile)",
    status: "active",
    description:
      "Machine-readable crosswalk derived from the SysML–FHIR Bridge trace graph. noMap elements are semantically legitimate non-mappings (e.g. SysML ports), not gaps.",
    group: [
      {
        source: "https://www.omg.org/spec/SysML/2.0",
        target: input.canonicalBase,
        element,
      },
    ],
  };
}

function buildProvenance(input: ProjectToFhirInput): Provenance {
  const run = input.transformationRun;
  return {
    resourceType: "Provenance",
    id: run.transformationId,
    target: [{ reference: `ConceptMap/${input.ruleset.rulesetId}-crosswalk` }],
    recorded: run.timestamp,
    agent: [
      {
        type: { text: "assembler" },
        who: { display: `${run.generator.name} ${run.generator.version}` },
      },
    ],
    entity: [
      {
        role: "source",
        what: {
          reference: `sysml:${run.source.sysmlProjectId}@${run.source.sysmlCommitId}`,
          display: `SysML commit ${run.source.sysmlCommitId} (${run.source.elementIds.length} elements)`,
        },
      },
    ],
  };
}

function buildDocumentReference(
  doc: { title: string; path: string; contentType: string; sha256: string },
  index: number,
): DocumentReference {
  return {
    resourceType: "DocumentReference",
    id: `generated-doc-${index}`,
    status: "current",
    description: doc.title,
    content: [
      {
        attachment: {
          contentType: doc.contentType,
          url: doc.path,
          hash: doc.sha256,
          title: doc.title,
        },
      },
    ],
  };
}
