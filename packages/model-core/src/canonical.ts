import { createHash } from "node:crypto";

/**
 * Canonical JSON: recursively sorted object keys, no insignificant whitespace.
 * Used for semantic hashing so that hashes are independent of key order.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) sorted[key] = sortValue(v);
    }
    return sorted;
  }
  return value;
}

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Semantic hash of any JSON-serializable value: sha256 over canonical JSON. */
export function semanticHash(value: unknown): string {
  return `sha256:${sha256Hex(canonicalJson(value))}`;
}

/**
 * Deterministic identifier derived from a namespace and the canonical content.
 * Same inputs always produce the same id (ADR: deterministic IDs where suitable).
 */
export function deterministicId(namespace: string, value: unknown): string {
  return `${namespace}-${sha256Hex(`${namespace}:${canonicalJson(value)}`).slice(0, 12)}`;
}
