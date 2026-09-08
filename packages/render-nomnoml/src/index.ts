import { renderSvg } from "nomnoml";
import type {
  DiagramRenderer,
  ModelView,
  RenderedDiagram,
} from "@nodeonsysml/render-core";

/** Renders a ModelView to real SVG in-process via nomnoml (no browser, no Java). */
export class NomnomlRenderer implements DiagramRenderer {
  readonly id = "nomnoml";

  supports(_view: ModelView): boolean {
    return true;
  }

  async render(view: ModelView): Promise<RenderedDiagram> {
    return {
      mimeType: "image/svg+xml",
      extension: ".svg",
      content: renderSvg(toNomnomlSource(view)),
    };
  }
}

export function toNomnomlSource(view: ModelView): string {
  const lines: string[] = [
    "#direction: down",
    "#spacing: 40",
    "#padding: 10",
    `#.sysml: fill=#dbe9ff`,
    `#.trace: fill=#fff3d6`,
    `#.fhir: fill=#dcf5dc`,
    `#.artifact: fill=#eeeeee`,
  ];
  const labelOf = new Map(view.nodes.map((n) => [n.id, `<${n.kind}> ${n.label}`]));
  const nodes = [...view.nodes].sort((a, b) => a.id.localeCompare(b.id));
  for (const node of nodes) {
    lines.push(`[${labelOf.get(node.id)}]`);
  }
  const edges = [...view.edges].sort(
    (a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to),
  );
  for (const edge of edges) {
    const from = labelOf.get(edge.from);
    const to = labelOf.get(edge.to);
    if (!from || !to) continue;
    const label = edge.label ? ` ${edge.label} ` : "";
    lines.push(`[${from}]-${label}->[${to}]`);
  }
  return `${lines.join("\n")}\n`;
}
