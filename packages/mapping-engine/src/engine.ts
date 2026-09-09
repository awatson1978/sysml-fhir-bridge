import { readFileSync } from "node:fs";
import { assertValid, type MappingRule } from "@sysml-fhir-bridge/model-core";
import type { SysmlElement } from "@sysml-fhir-bridge/sysml-v2-client";
import type {
  Device,
  DeviceDefinition,
  DeviceMetric,
  ActivityDefinition,
  Observation,
  FhirAdapter,
} from "@sysml-fhir-bridge/fhir-adapter";
import type {
  GeneratedMapping,
  MappingError,
  MappingRuleset,
  MappingWarning,
  TransformResult,
} from "./types.js";

export function loadRuleset(path: string): MappingRuleset {
  const ruleset = JSON.parse(readFileSync(path, "utf8")) as MappingRuleset;
  for (const rule of ruleset.rules) assertValid("mapping-rule", rule);
  return ruleset;
}

export interface TransformOptions {
  /** Version stamped on generated profile bindings, e.g. the FHIR package version. */
  profileVersion: string;
  /** Profile name (canonical suffix) governing physiologic observations. */
  observationProfileName: string;
  /** Fixed timestamp for deterministic example instances. */
  exampleTimestamp: string;
}

function findRule(ruleset: MappingRuleset, id: string): MappingRule | undefined {
  return ruleset.rules.find((r) => r.id === id);
}

function slug(text: string): string {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Transform normalized SysML elements into FHIR artifacts under the given
 * ruleset. Semantics that do not cross legitimately produce explicit warnings
 * ("the warning is a feature, not a failure"), and unit gaps are errors —
 * never silent coercions.
 */
export function transformSysmlToFhir(
  elements: SysmlElement[],
  ruleset: MappingRuleset,
  fhir: FhirAdapter,
  options: TransformOptions,
): TransformResult {
  const generated: GeneratedMapping[] = [];
  const warnings: MappingWarning[] = [];
  const errors: MappingError[] = [];

  const byId = new Map(elements.map((e) => [e.elementId, e]));
  const observationProfileCanonical = fhir.profileCanonical(
    options.observationProfileName,
  );

  for (const element of elements) {
    switch (element.kind) {
      case "PartDefinition": {
        if (element.metadata?.["medicalDeviceType"] !== true) break;
        const rule = findRule(ruleset, "sysml-device-type-to-devicedefinition");
        if (!requireRule(rule, element, errors)) break;
        const resource: DeviceDefinition = {
          resourceType: "DeviceDefinition",
          id: `${slug(element.name)}-type`,
          description: element.documentation ?? element.name,
        };
        const modelNumber = element.metadata?.["modelNumber"];
        if (typeof modelNumber === "string") resource.modelNumber = modelNumber;
        generated.push({
          artifactType: "FHIRExample",
          sourceElementId: element.elementId,
          ruleId: rule.id,
          ruleVersion: rule.version,
          relationship: rule.relationship,
          semanticConfidence: rule.semanticConfidence,
          target: fhir.instanceRef(resource),
          resource,
        });
        break;
      }

      case "PartUsage": {
        const rule = findRule(ruleset, "sysml-deployed-part-to-device");
        if (!requireRule(rule, element, errors)) break;
        const binding = element.metadata?.["deploymentBinding"] as
          | { site?: string; serialNumber?: string }
          | undefined;
        if (!binding) {
          warnings.push({
            code: "SKIPPED",
            elementId: element.elementId,
            message:
              "Part usage has no deployment binding; a design allocation is not itself a runtime Device.",
          });
          break;
        }
        const definedBy = element.relationships?.find((r) => r.type === "definedBy");
        const typeElement = definedBy ? byId.get(definedBy.targetElementId) : undefined;
        const resource: Device = {
          resourceType: "Device",
          id: slug(element.name),
          status: "active",
        };
        if (typeElement) {
          resource.definition = {
            reference: `DeviceDefinition/${slug(typeElement.name)}-type`,
          };
          const modelNumber = typeElement.metadata?.["modelNumber"];
          if (typeof modelNumber === "string") resource.modelNumber = modelNumber;
        }
        if (typeof binding.serialNumber === "string")
          resource.serialNumber = binding.serialNumber;
        if (typeof binding.site === "string")
          resource.note = [{ text: `deployment site: ${binding.site}` }];
        generated.push({
          artifactType: "FHIRExample",
          sourceElementId: element.elementId,
          ruleId: rule.id,
          ruleVersion: rule.version,
          relationship: rule.relationship,
          semanticConfidence: rule.semanticConfidence,
          target: fhir.instanceRef(resource),
          resource,
        });
        break;
      }

      case "AttributeUsage": {
        if (element.metadata?.["observable"] !== true) break;
        const metricRule = findRule(ruleset, "sysml-metric-to-devicemetric");
        const obsRule = findRule(ruleset, "sysml-observable-to-fhir-observation");
        if (!requireRule(metricRule, element, errors)) break;
        if (!requireRule(obsRule, element, errors)) break;

        const unit = element.metadata?.["unit"];
        const ucum =
          typeof unit === "string" ? ruleset.unitCrosswalk.entries[unit] : undefined;
        if (typeof unit === "string" && ucum === undefined) {
          errors.push({
            code: "UNIT_UNMAPPED",
            elementId: element.elementId,
            message: `Engineering unit "${unit}" has no UCUM crosswalk entry; add an explicit conversion rule.`,
          });
          break;
        }

        const deviceRef = { reference: "Device/ultrasound-unit01" };
        const loincHint = element.metadata?.["loincHint"];
        const code = {
          coding:
            typeof loincHint === "string"
              ? [{ system: "http://loinc.org", code: loincHint, display: element.name }]
              : [{ system: `${fhir.canonicalBase}/CodeSystem/exmc-metrics`, code: slug(element.name), display: element.name }],
          text: element.documentation ?? element.name,
        };

        // Capability (DeviceMetric) and measured value (Observation) stay separate.
        const metric: DeviceMetric = {
          resourceType: "DeviceMetric",
          id: `${slug(element.name)}-capability`,
          type: code,
          device: deviceRef,
          category:
            element.metadata?.["metricCategory"] === "measurement"
              ? "measurement"
              : "unspecified",
        };
        if (ucum !== undefined) {
          metric.unit = {
            coding: [{ system: "http://unitsofmeasure.org", code: ucum }],
          };
        }
        generated.push({
          artifactType: "FHIRExample",
          sourceElementId: element.elementId,
          ruleId: metricRule.id,
          ruleVersion: metricRule.version,
          relationship: metricRule.relationship,
          semanticConfidence: metricRule.semanticConfidence,
          target: fhir.instanceRef(metric),
          resource: metric,
        });

        generated.push({
          artifactType: "FHIRProfileBinding",
          sourceElementId: element.elementId,
          ruleId: obsRule.id,
          ruleVersion: obsRule.version,
          relationship: obsRule.relationship,
          semanticConfidence: obsRule.semanticConfidence,
          target: fhir.profileRef(options.observationProfileName, options.profileVersion),
        });

        const example: Observation = {
          resourceType: "Observation",
          id: `${slug(element.name)}-example`,
          meta: { profile: [observationProfileCanonical] },
          status: "final",
          code,
          device: deviceRef,
          effectiveDateTime: options.exampleTimestamp,
        };
        if (ucum !== undefined) {
          example.valueQuantity = {
            value: 72,
            unit: typeof unit === "string" ? unit : ucum,
            system: "http://unitsofmeasure.org",
            code: ucum,
          };
        }
        generated.push({
          artifactType: "FHIRExample",
          sourceElementId: element.elementId,
          ruleId: obsRule.id,
          ruleVersion: obsRule.version,
          relationship: obsRule.relationship,
          semanticConfidence: obsRule.semanticConfidence,
          target: fhir.instanceRef(example),
          resource: example,
        });
        break;
      }

      case "RequirementUsage": {
        const rule = findRule(ruleset, "sysml-requirement-constrains-profile");
        if (!requireRule(rule, element, errors)) break;
        // A requirement is never itself a FHIR resource; it constrains the
        // clinical interface profile via TraceLink only.
        generated.push({
          artifactType: "FHIRProfileBinding",
          sourceElementId: element.elementId,
          ruleId: rule.id,
          ruleVersion: rule.version,
          relationship: rule.relationship,
          semanticConfidence: rule.semanticConfidence,
          target: fhir.profileRef(options.observationProfileName, options.profileVersion),
        });
        break;
      }

      case "PortUsage": {
        const rule = findRule(ruleset, "sysml-port-to-icd-contract");
        if (!requireRule(rule, element, errors)) break;
        warnings.push({
          code: "NO_DIRECT_MAPPING",
          elementId: element.elementId,
          message:
            "SysML ports do not map directly to FHIR resources; ICD contract generated.",
        });
        generated.push({
          artifactType: "ICDContract",
          sourceElementId: element.elementId,
          ruleId: rule.id,
          ruleVersion: rule.version,
          relationship: rule.relationship,
          semanticConfidence: rule.semanticConfidence,
          target: {
            standard: "external",
            kind: "icd-contract",
            uri: `generated/exmc-medical-icd.md#${slug(element.name)}`,
            mimeType: "text/markdown",
          },
        });
        break;
      }

      case "ActionDefinition": {
        if (element.metadata?.["clinicalWorkflow"] !== true) {
          warnings.push({
            code: "SKIPPED",
            elementId: element.elementId,
            message:
              "Behavior definition has no clinical/workflow semantics; remains engineering-only.",
          });
          break;
        }
        const rule = findRule(ruleset, "sysml-behavior-to-activitydefinition");
        if (!requireRule(rule, element, errors)) break;
        const resource: ActivityDefinition = {
          resourceType: "ActivityDefinition",
          id: slug(element.name),
          status: "draft",
          name: element.name,
          title: element.name.replace(/([a-z])([A-Z])/g, "$1 $2"),
          kind: "ServiceRequest",
          url: `${fhir.canonicalBase}/ActivityDefinition/${slug(element.name)}`,
          version: options.profileVersion,
        };
        if (element.documentation !== undefined)
          resource.description = element.documentation;
        generated.push({
          artifactType: "FHIRExample",
          sourceElementId: element.elementId,
          ruleId: rule.id,
          ruleVersion: rule.version,
          relationship: rule.relationship,
          semanticConfidence: rule.semanticConfidence,
          target: fhir.instanceRef(resource),
          resource,
        });
        break;
      }

      default:
        break;
    }
  }

  return { generated, warnings, errors };
}

function requireRule(
  rule: MappingRule | undefined,
  element: SysmlElement,
  errors: MappingError[],
): rule is MappingRule {
  if (!rule) {
    errors.push({
      code: "RULE_NOT_FOUND",
      elementId: element.elementId,
      message: `No mapping rule available for kind ${element.kind}`,
    });
    return false;
  }
  return true;
}
