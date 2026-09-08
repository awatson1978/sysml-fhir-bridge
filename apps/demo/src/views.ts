import type { ModelView } from "@nodeonsysml/render-core";
import type { SysmlElement } from "@nodeonsysml/sysml-v2-client";
import type { TraceLink } from "@nodeonsysml/model-core";

/** Project the SysML snapshot + trace graph into a requirements-trace view. */
export function requirementsTraceView(
  elements: SysmlElement[],
  traces: TraceLink[],
): ModelView {
  const view: ModelView = {
    id: "requirements-trace",
    title: "ExMC requirement-to-FHIR traceability",
    nodes: [],
    edges: [],
  };
  const seen = new Set<string>();
  const addNode = (id: string, label: string, kind: string): void => {
    if (seen.has(id)) return;
    seen.add(id);
    view.nodes.push({ id, label, kind });
  };

  for (const element of elements) {
    if (element.kind === "PartDefinition" && element.elementId === "sys-medical") continue;
    addNode(element.elementId, `${element.name}\n(${element.kind})`, "sysml");
    for (const rel of element.relationships ?? []) {
      view.edges.push({
        from: element.elementId,
        to: rel.targetElementId,
        label: rel.type,
      });
    }
    if (element.ownerId && element.ownerId !== "sys-medical") {
      view.edges.push({ from: element.ownerId, to: element.elementId, label: "owns" });
    }
  }

  for (const trace of traces) {
    const targetId = traceTargetNodeId(trace);
    const label =
      trace.target.standard === "fhir"
        ? trace.target.canonical
          ? `profile ${shortCanonical(trace.target.canonical)}\nv${trace.target.profileVersion ?? "?"}`
          : `${trace.target.resourceType}/${trace.target.logicalId}`
        : `${trace.target.kind}`;
    addNode(targetId, label, trace.target.standard === "fhir" ? "fhir" : "artifact");
    view.edges.push({
      from: trace.source.elementId,
      to: targetId,
      label: `${trace.relationship} [${trace.status}]`,
    });
  }
  return view;
}

export function traceTargetNodeId(trace: TraceLink): string {
  if (trace.target.standard === "fhir") {
    return trace.target.canonical
      ? `fhir-${shortCanonical(trace.target.canonical)}`
      : `fhir-${trace.target.resourceType}-${trace.target.logicalId}`;
  }
  return `ext-${trace.target.kind}`;
}

function shortCanonical(canonical: string): string {
  const parts = canonical.split("/");
  return parts[parts.length - 1] ?? canonical;
}

/** Static reference-architecture view (mirrors the design document's component diagram). */
export function architectureView(): ModelView {
  return {
    id: "architecture",
    title: "NodeOnSysML reference architecture",
    nodes: [
      { id: "sys", label: "SysML v2 Model Service", kind: "sysml" },
      { id: "nos", label: "NodeOnSysML kernel", kind: "trace" },
      { id: "trace", label: "Trace graph (versioned TraceLinks)", kind: "trace" },
      { id: "fhir", label: "FHIR Gateway", kind: "fhir" },
      { id: "edge", label: "Medical Edge Gateway", kind: "fhir" },
      { id: "img", label: "DICOM / artifact store", kind: "artifact" },
      { id: "docs", label: "Generated ICD / verification docs", kind: "artifact" },
    ],
    edges: [
      { from: "nos", to: "sys", label: "Systems Modeling API" },
      { from: "nos", to: "trace", label: "versioned TraceLinks" },
      { from: "nos", to: "fhir", label: "FHIR REST" },
      { from: "nos", to: "img", label: "artifact metadata" },
      { from: "nos", to: "docs", label: "deterministic docgen" },
      { from: "fhir", to: "edge", label: "store-and-forward sync" },
      { from: "edge", to: "fhir", label: "Observations / Reports" },
      { from: "edge", to: "img", label: "DICOM / raw artifacts" },
    ],
  };
}
