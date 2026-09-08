/**
 * Renderer boundary (ADR-005): diagram renderers consume normalized model-view
 * objects projected from the semantic model. The renderer never supplies
 * semantic truth, and no engineering IDs are derived from rendered text.
 */

export interface ModelViewNode {
  id: string;
  label: string;
  /** semantic category used for styling, e.g. "sysml", "fhir", "trace", "artifact" */
  kind: string;
}

export interface ModelViewEdge {
  from: string;
  to: string;
  label?: string;
}

export interface ModelView {
  id: string;
  title: string;
  nodes: ModelViewNode[];
  edges: ModelViewEdge[];
}

export interface RenderedDiagram {
  mimeType: "image/svg+xml" | "text/vnd.mermaid" | "text/x-plantuml" | "text/x-nomnoml";
  extension: string;
  content: string;
}

export interface DiagramRenderer {
  readonly id: string;
  supports(view: ModelView): boolean;
  render(view: ModelView): Promise<RenderedDiagram>;
}
