import type {
  DiagramRenderer,
  ModelView,
  RenderedDiagram,
} from "@nodeonsysml/render-core";

/**
 * Projects a ModelView to deterministic PlantUML component-diagram source.
 * In-process SVG rendering via @plantuml/core can be layered on later without
 * touching the semantic model (ADR-005); the source artifact is authoritative
 * input for CI rendering.
 */
export class PlantUmlRenderer implements DiagramRenderer {
  readonly id = "plantuml";

  supports(_view: ModelView): boolean {
    return true;
  }

  async render(view: ModelView): Promise<RenderedDiagram> {
    const lines: string[] = ["@startuml", `title ${view.title}`];
    const nodes = [...view.nodes].sort((a, b) => a.id.localeCompare(b.id));
    for (const node of nodes) {
      const shape = node.kind === "trace" ? "database" : "component";
      lines.push(`${shape} "${node.label}" as ${sanitizeId(node.id)}`);
    }
    const edges = [...view.edges].sort(
      (a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to),
    );
    for (const edge of edges) {
      const label = edge.label ? ` : ${edge.label}` : "";
      lines.push(`${sanitizeId(edge.from)} --> ${sanitizeId(edge.to)}${label}`);
    }
    lines.push("@enduml");
    return {
      mimeType: "text/x-plantuml",
      extension: ".puml",
      content: `${lines.join("\n")}\n`,
    };
  }
}

function sanitizeId(id: string): string {
  return id.replace(/[^A-Za-z0-9_]/g, "_");
}
