import type { SysmlElement } from "@nodeonsysml/sysml-v2-client";

export interface PhiViolation {
  elementId: string;
  path: string;
  message: string;
}

const PHI_KEY_PATTERN =
  /^(patientName|dateOfBirth|dob|mrn|medicalRecordNumber|ssn|diagnosis|medicationHistory)$/i;

/**
 * PHI guard: the engineering model must contain roles and interfaces, never
 * patient-identifiable information. Clinical identity belongs to FHIR Patient
 * behind a deployment/reference binding (ADR-001, design doc "PHI separation").
 */
export function findPhiViolations(elements: SysmlElement[]): PhiViolation[] {
  const violations: PhiViolation[] = [];
  for (const element of elements) {
    scan(element.metadata, `${element.elementId}.metadata`, element.elementId, violations);
    scan(element.raw, `${element.elementId}.raw`, element.elementId, violations);
  }
  return violations;
}

function scan(
  value: unknown,
  path: string,
  elementId: string,
  violations: PhiViolation[],
): void {
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (PHI_KEY_PATTERN.test(key)) {
      violations.push({
        elementId,
        path: `${path}.${key}`,
        message: `Field "${key}" looks like patient-identifiable data; engineering models must reference FHIR Patient bindings instead.`,
      });
    }
    scan(child, `${path}.${key}`, elementId, violations);
  }
}
