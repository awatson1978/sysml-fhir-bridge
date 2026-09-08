import type {
  DiagramRenderer,
  ModelView,
  RenderedDiagram,
} from "@nodeonsysml/render-core";

/**
 * Projects a ModelView to deterministic Mermaid flowchart source.
 * SVG rasterization of Mermaid requires a browser runtime and is deliberately
 * out of scope for the kernel; the source artifact is the deliverable.
 */
export class MermaidRenderer implements DiagramRenderer {
  readonly id = "mermaid";

  supports(_view: ModelView): boolean {
    return true;
  }

  async render(view: ModelView): Promise<RenderedDiagram> {
    const lines: string[] = ["flowchart TD"];
    const nodes = [...view.nodes].sort((a, b) => a.id.localeCompare(b.id));
    for (const node of nodes) {
      lines.push(`  ${sanitizeId(node.id)}["${escapeLabel(node.label)}"]`);
      lines.push(`  class ${sanitizeId(node.id)} ${node.kind}`);
    }
    const edges = [...view.edges].sort(
      (a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to),
    );
    for (const edge of edges) {
      const label = edge.label ? `|${escapeLabel(edge.label)}|` : "";
      lines.push(`  ${sanitizeId(edge.from)} -->${label} ${sanitizeId(edge.to)}`);
    }
    lines.push(
      "  classDef sysml fill:#dbe9ff,stroke:#3b6db3",
      "  classDef trace fill:#fff3d6,stroke:#b3923b",
      "  classDef fhir fill:#dcf5dc,stroke:#3f9c3f",
      "  classDef artifact fill:#eeeeee,stroke:#888888",
    );
    return {
      mimeType: "text/vnd.mermaid",
      extension: ".mmd",
      content: `${lines.join("\n")}\n`,
    };
  }
}

function sanitizeId(id: string): string {
  return id.replace(/[^A-Za-z0-9_]/g, "_");
}

function escapeLabel(label: string): string {
  return label.replace(/"/g, "'");
}
