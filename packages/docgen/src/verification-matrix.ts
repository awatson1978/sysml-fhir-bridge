import type {
  SysMLRef,
  VerificationCase,
  VerificationResult,
} from "@sysml-fhir-bridge/model-core";

export interface VerificationMatrixInput {
  baselineId: string;
  requirements: { ref: SysMLRef; name: string; text: string }[];
  cases: VerificationCase[];
  results: VerificationResult[];
}

/** Requirement -> verification case -> result/evidence matrix (deterministic markdown). */
export function generateVerificationMatrix(input: VerificationMatrixInput): string {
  const lines: string[] = [];
  lines.push(`# Verification matrix — baseline \`${input.baselineId}\``);
  lines.push("");
  lines.push("| Requirement | Verification case | Method | Result | Evidence |");
  lines.push("| --- | --- | --- | --- | --- |");

  const requirements = [...input.requirements].sort((a, b) =>
    a.ref.elementId.localeCompare(b.ref.elementId),
  );
  for (const req of requirements) {
    const cases = input.cases.filter(
      (c) => c.requirement.elementId === req.ref.elementId,
    );
    if (cases.length === 0) {
      lines.push(`| ${req.name} (\`${req.ref.elementId}\`) | — | — | **unverified** | — |`);
      continue;
    }
    for (const verificationCase of cases) {
      const results = input.results.filter((r) => r.caseId === verificationCase.id);
      if (results.length === 0) {
        lines.push(
          `| ${req.name} (\`${req.ref.elementId}\`) | ${verificationCase.name} | ${verificationCase.method} | **no result** | — |`,
        );
        continue;
      }
      for (const result of results) {
        const evidence =
          result.evidence
            .map((e) =>
              e.sha256 ? `${e.uri} (\`${e.sha256.slice(0, 16)}…\`)` : e.uri,
            )
            .join("<br>") || "—";
        lines.push(
          `| ${req.name} (\`${req.ref.elementId}\`) | ${verificationCase.name} | ${verificationCase.method} | ${result.status} | ${evidence} |`,
        );
      }
    }
  }
  lines.push("");
  return lines.join("\n");
}
