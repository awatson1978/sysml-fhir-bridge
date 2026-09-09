import {
  deterministicId,
  type ChangeProposal,
} from "@sysml-fhir-bridge/model-core";
import type { SysmlElement } from "@sysml-fhir-bridge/sysml-v2-client";
import type { MappingRuleset } from "@sysml-fhir-bridge/mapping-engine";
import type { Observation, Procedure } from "@sysml-fhir-bridge/fhir-adapter";

/**
 * Inbound projection (ADR-008): the learning-health-system loop.
 *
 * Runtime clinical FHIR data (Observations, Procedures) flows back and is
 * interpreted *against* the engineering model. It is never reconstructed as
 * SysML. The importer produces:
 *   - evidence matches  (runtime data that a modeled observable predicted),
 *   - coverage gaps      (runtime data with NO modeled counterpart),
 *   - constraint violations (runtime data that contradicts the model, e.g.
 *     unit drift), which close the loop by marking a trace stale from evidence,
 *   - change proposals   (human-review inputs; a proposed SysML branch).
 *
 * The matching is deliberately heuristic/fuzzy (LOINC-hint and canonical-based)
 * and is honest about its confidence. This is the "kludgy but useful" first cut.
 */

export type MatchConfidence = "code-exact" | "canonical" | "unmatched";

export interface EvidenceMatch {
  resourceType: string;
  resourceId: string;
  matchedElementId: string;
  observableName: string;
  confidence: MatchConfidence;
}

export interface CoverageGap {
  resourceType: string;
  resourceId: string;
  code?: string;
  system?: string;
  reason: "NO_DESIGN_COVERAGE";
}

export interface ConstraintViolation {
  resourceType: string;
  resourceId: string;
  matchedElementId: string;
  code: "UNIT_DRIFT" | "VALUE_OUT_OF_MODELED_RANGE";
  detail: string;
}

export interface ImportEvidenceResult {
  matches: EvidenceMatch[];
  gaps: CoverageGap[];
  violations: ConstraintViolation[];
  proposals: ChangeProposal[];
}

export interface ImportEvidenceInput {
  /** SysML elements at the current baseline commit. */
  elements: SysmlElement[];
  ruleset: MappingRuleset;
  observations: Observation[];
  procedures?: Procedure[];
  /** Fixed timestamp for deterministic proposal ids/records. */
  importedAt: string;
}

interface ObservableIndex {
  element: SysmlElement;
  loincHint?: string;
  unit?: string;
}

/**
 * Strip anything patient-identifying before an FHIR resource is allowed to
 * inform the engineering side. Only the coded, quantitative shell crosses the
 * boundary (ADR-001 PHI separation, applied to the inbound direction).
 */
function deidentify(obs: Observation): {
  id: string;
  code?: string;
  system?: string;
  unitCode?: string;
} {
  const coding = obs.code?.coding?.[0];
  const result: { id: string; code?: string; system?: string; unitCode?: string } = {
    id: obs.id,
  };
  if (coding?.code !== undefined) result.code = coding.code;
  if (coding?.system !== undefined) result.system = coding.system;
  if (obs.valueQuantity?.code !== undefined) result.unitCode = obs.valueQuantity.code;
  return result;
}

export function importFhirEvidence(input: ImportEvidenceInput): ImportEvidenceResult {
  const observables: ObservableIndex[] = input.elements
    .filter((e) => e.kind === "AttributeUsage" && e.metadata?.["observable"] === true)
    .map((element) => {
      const loincHint = element.metadata?.["loincHint"];
      const unit = element.metadata?.["unit"];
      const entry: ObservableIndex = { element };
      if (typeof loincHint === "string") entry.loincHint = loincHint;
      if (typeof unit === "string") entry.unit = unit;
      return entry;
    });

  const matches: EvidenceMatch[] = [];
  const gaps: CoverageGap[] = [];
  const violations: ConstraintViolation[] = [];
  const proposals: ChangeProposal[] = [];

  for (const obs of input.observations) {
    const clean = deidentify(obs);
    const hit = clean.code
      ? observables.find((o) => o.loincHint !== undefined && o.loincHint === clean.code)
      : undefined;

    if (!hit) {
      gaps.push({
        resourceType: "Observation",
        resourceId: clean.id,
        ...(clean.code ? { code: clean.code } : {}),
        ...(clean.system ? { system: clean.system } : {}),
        reason: "NO_DESIGN_COVERAGE",
      });
      // Runtime is measuring something the design never anticipated ->
      // propose a new observable. This is the loop closing back to design.
      proposals.push(
        makeProposal(
          "new-observable",
          undefined,
          `Model a new observable for clinical code ${clean.code ?? "(uncoded)"}`,
          `Runtime Observation ${clean.id} carries code ${clean.code ?? "(none)"} (${clean.system ?? "no system"}) with no corresponding modeled observable. Operations are collecting data the design does not predict.`,
          [
            {
              resourceType: "Observation",
              resourceId: clean.id,
              ...(clean.code ? { code: clean.code } : {}),
              ...(clean.system ? { system: clean.system } : {}),
            },
          ],
          input.importedAt,
        ),
      );
      continue;
    }

    matches.push({
      resourceType: "Observation",
      resourceId: clean.id,
      matchedElementId: hit.element.elementId,
      observableName: hit.element.name,
      confidence: "code-exact",
    });

    // Unit-drift check: runtime UCUM code vs the model's declared unit,
    // resolved through the ruleset's explicit unit crosswalk (no silent coercion).
    if (hit.unit !== undefined && clean.unitCode !== undefined) {
      const expectedUcum = input.ruleset.unitCrosswalk.entries[hit.unit];
      if (expectedUcum !== undefined && expectedUcum !== clean.unitCode) {
        violations.push({
          resourceType: "Observation",
          resourceId: clean.id,
          matchedElementId: hit.element.elementId,
          code: "UNIT_DRIFT",
          detail: `Model declares ${hit.unit} (UCUM ${expectedUcum}); runtime reports UCUM ${clean.unitCode}.`,
        });
        proposals.push(
          makeProposal(
            "requirement-revision",
            hit.element.elementId,
            `Reconcile unit drift on ${hit.element.name}`,
            `Runtime Observation ${clean.id} reports UCUM ${clean.unitCode}, but ${hit.element.qualifiedName} declares ${hit.unit} (UCUM ${expectedUcum}). Either the device changed or the model is wrong; a human must decide.`,
            [
              {
                resourceType: "Observation",
                resourceId: clean.id,
                ...(clean.code ? { code: clean.code } : {}),
              },
            ],
            input.importedAt,
          ),
        );
      }
    }
  }

  return { matches, gaps, violations, proposals };
}

function makeProposal(
  kind: ChangeProposal["kind"],
  targetElementId: string | undefined,
  title: string,
  rationale: string,
  evidence: ChangeProposal["evidence"],
  proposedAt: string,
): ChangeProposal {
  const proposal: ChangeProposal = {
    id: deterministicId("proposal", { kind, targetElementId, title, evidence }),
    kind,
    title,
    rationale,
    evidence,
    proposedAt,
    status: "proposed",
  };
  if (targetElementId !== undefined) proposal.targetElementId = targetElementId;
  return proposal;
}

/**
 * Which existing traces should be marked stale because inbound evidence
 * contradicts the model. Returns the source element ids whose traces are
 * implicated, so the trace engine can re-evaluate them with a runtime-evidence
 * reason. This is the inbound half of impact analysis.
 */
export function elementsInvalidatedByEvidence(
  result: ImportEvidenceResult,
): { elementId: string; reason: string }[] {
  return result.violations.map((v) => ({
    elementId: v.matchedElementId,
    reason: `runtime evidence contradicts model: ${v.detail}`,
  }));
}
