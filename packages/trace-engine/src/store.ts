import {
  assertValid,
  deterministicId,
  type TraceLink,
  type TraceStatus,
} from "@nodeonsysml/model-core";

/**
 * Append-only trace store. Historical TraceLinks are never deleted or mutated;
 * status changes create a superseding record so every released baseline can be
 * reconstructed (ADR-003).
 *
 * The reference implementation is in-memory; the persistence boundary is this
 * class's public surface.
 */
export class TraceStore {
  private readonly records: TraceLink[] = [];
  private readonly supersededIds = new Set<string>();

  add(trace: TraceLink): TraceLink {
    assertValid("trace-link", trace);
    if (this.records.some((t) => t.id === trace.id)) {
      throw new Error(`TraceLink ${trace.id} already exists (append-only store)`);
    }
    this.records.push(trace);
    if (trace.supersedes !== undefined) this.supersededIds.add(trace.supersedes);
    return trace;
  }

  /** Record a status transition by appending a superseding TraceLink. */
  transition(
    traceId: string,
    status: TraceStatus,
    reason: string | undefined,
    at: string,
    by: string,
  ): TraceLink {
    const current = this.get(traceId);
    if (!current) throw new Error(`Unknown TraceLink: ${traceId}`);
    if (this.supersededIds.has(traceId)) {
      throw new Error(`TraceLink ${traceId} is already superseded`);
    }
    const next: TraceLink = {
      ...current,
      id: deterministicId("trace", { supersedes: current.id, status, reason }),
      status,
      createdAt: at,
      createdBy: by,
      supersedes: current.id,
    };
    if (reason !== undefined) next.statusReason = reason;
    else delete next.statusReason;
    return this.add(next);
  }

  get(traceId: string): TraceLink | undefined {
    return this.records.find((t) => t.id === traceId);
  }

  /** All records, including superseded history. */
  all(): readonly TraceLink[] {
    return this.records;
  }

  /** Only the tips of each supersession chain. */
  active(): TraceLink[] {
    return this.records.filter((t) => !this.supersededIds.has(t.id));
  }

  /** Active traces whose source is the given SysML element (any commit). */
  bySourceElement(projectId: string, elementId: string): TraceLink[] {
    return this.active().filter(
      (t) => t.source.projectId === projectId && t.source.elementId === elementId,
    );
  }
}
