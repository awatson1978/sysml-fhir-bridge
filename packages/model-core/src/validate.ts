import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv/dist/2020.js";

export type SchemaName =
  | "sysml-ref"
  | "fhir-ref"
  | "trace-link"
  | "mapping-rule"
  | "transformation-run"
  | "baseline-manifest"
  | "verification-result"
  | "migration-crosswalk"
  | "change-proposal";

const SCHEMA_DIR = new URL("../../../schemas/", import.meta.url);

const ajv = new Ajv2020({ allErrors: true, strict: true });
const compiled = new Map<SchemaName, ValidateFunction>();

function loadSchema(name: SchemaName): ValidateFunction {
  let fn = compiled.get(name);
  if (!fn) {
    const schema = JSON.parse(
      readFileSync(new URL(`${name}.schema.json`, SCHEMA_DIR), "utf8"),
    ) as object;
    fn = ajv.compile(schema);
    compiled.set(name, fn);
  }
  return fn;
}

export interface ValidationOutcome {
  valid: boolean;
  errors: string[];
}

/**
 * Validate an internal contract payload against its JSON Schema.
 * No untyped external payload crosses a trust boundary unvalidated.
 */
export function validateAgainstSchema(
  name: SchemaName,
  payload: unknown,
): ValidationOutcome {
  const fn = loadSchema(name);
  const valid = fn(payload) === true;
  const errors = (fn.errors ?? []).map(
    (e) => `${e.instancePath || "/"} ${e.message ?? "invalid"}`,
  );
  return { valid, errors };
}

export function assertValid(name: SchemaName, payload: unknown): void {
  const outcome = validateAgainstSchema(name, payload);
  if (!outcome.valid) {
    throw new Error(
      `Schema validation failed for ${name}: ${outcome.errors.join("; ")}`,
    );
  }
}
