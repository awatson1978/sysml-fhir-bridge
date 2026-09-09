import {
  assertValid,
  deterministicId,
  type SemanticConfidence,
  type SysMLRef,
  type TraceLink,
  type TraceRelationship,
  type TraceStatus,
  type TraceTarget,
} from "@sysml-fhir-bridge/model-core";

export interface CreateTraceInput {
  source: SysMLRef;
  relationship: TraceRelationship;
  target: TraceTarget;
  mappingRuleId: string;
  mappingRuleVersion: string;
  semanticConfidence?: SemanticConfidence;
  sourceHash?: string;
  targetHash?: string;
  provenanceId: string;
  createdAt: string;
  createdBy: string;
}

/** Create a schema-valid TraceLink with a deterministic id. */
export function createTraceLink(input: CreateTraceInput): TraceLink {
  const trace: TraceLink = {
    id: deterministicId("trace", {
      source: input.source,
      relationship: input.relationship,
      target: input.target,
      mappingRuleId: input.mappingRuleId,
    }),
    source: input.source,
    relationship: input.relationship,
    target: input.target,
    mappingRuleId: input.mappingRuleId,
    mappingRuleVersion: input.mappingRuleVersion,
    status: "valid",
    createdAt: input.createdAt,
    createdBy: input.createdBy,
    provenanceId: input.provenanceId,
  };
  if (input.semanticConfidence !== undefined)
    trace.semanticConfidence = input.semanticConfidence;
  if (input.sourceHash !== undefined) trace.sourceHash = input.sourceHash;
  if (input.targetHash !== undefined) trace.targetHash = input.targetHash;
  assertValid("trace-link", trace);
  return trace;
}

/**
 * Everything the engine may know about the current state of a trace's
 * endpoints. `undefined` means "not evaluated"; the corresponding rule is
 * skipped rather than silently passed as unchanged.
 */
export interface TraceEvaluationContext {
  sourceExists?: boolean;
  currentSourceHash?: string;
  targetExists?: boolean;
  currentTargetHash?: string;
  currentProfileVersion?: string;
  currentMappingRuleVersion?: string;
  terminologyChanged?: boolean;
  baselineChanged?: boolean;
  /** Inbound learning loop: runtime clinical evidence contradicts the model. */
  contradictedByEvidence?: string;
}

export interface TraceEvaluation {
  status: TraceStatus;
  reason?: string;
}

/**
 * Staleness/invalidation rules (design doc, trace-engine contract):
 *  - source SysML element disappears        -> invalid
 *  - target FHIR canonical disappears       -> invalid
 *  - source semantic hash changes           -> stale
 *  - target profile version changes         -> stale
 *  - target semantic hash changes           -> stale
 *  - mapping rule version changes           -> stale
 *  - terminology dependency changes         -> stale
 *  - governing baseline changes             -> stale
 *  - runtime evidence contradicts the model -> stale (inbound learning loop)
 * A waived trace stays waived; an invalid trace never resurrects silently.
 */
export function evaluateTrace(
  trace: TraceLink,
  ctx: TraceEvaluationContext,
): TraceEvaluation {
  if (trace.status === "waived") return { status: "waived" };

  if (ctx.sourceExists === false) {
    return { status: "invalid", reason: "source SysML element no longer exists" };
  }
  if (ctx.targetExists === false) {
    return { status: "invalid", reason: "target artifact no longer exists" };
  }

  const staleReasons: string[] = [];
  if (
    ctx.currentSourceHash !== undefined &&
    trace.sourceHash !== undefined &&
    ctx.currentSourceHash !== trace.sourceHash
  ) {
    staleReasons.push("source semantic hash changed");
  }
  if (
    ctx.currentTargetHash !== undefined &&
    trace.targetHash !== undefined &&
    ctx.currentTargetHash !== trace.targetHash
  ) {
    staleReasons.push("target semantic hash changed");
  }
  if (
    ctx.currentProfileVersion !== undefined &&
    trace.target.standard === "fhir" &&
    trace.target.profileVersion !== undefined &&
    ctx.currentProfileVersion !== trace.target.profileVersion
  ) {
    staleReasons.push("target profile version changed");
  }
  if (
    ctx.currentMappingRuleVersion !== undefined &&
    ctx.currentMappingRuleVersion !== trace.mappingRuleVersion
  ) {
    staleReasons.push("mapping rule version changed");
  }
  if (ctx.terminologyChanged === true) {
    staleReasons.push("terminology dependency changed");
  }
  if (ctx.baselineChanged === true) {
    staleReasons.push("governing baseline changed");
  }
  if (ctx.contradictedByEvidence !== undefined) {
    staleReasons.push(ctx.contradictedByEvidence);
  }

  if (staleReasons.length > 0) {
    return { status: "stale", reason: staleReasons.join("; ") };
  }
  return { status: "valid" };
}
