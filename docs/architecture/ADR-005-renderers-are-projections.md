# ADR-005: Diagram renderers are projections, never semantic sources

**Status:** accepted

## Decision

Renderers consume normalized `ModelView` objects (`packages/render-core`)
projected from the semantic model and trace graph. The renderer never supplies
semantic truth and no engineering IDs are derived from rendered output.

Implemented adapters:

- `render-mermaid` — deterministic Mermaid flowchart source (`.mmd`);
- `render-nomnoml` — real SVG rendered in-process via nomnoml (no browser, no
  Java);
- `render-plantuml` — deterministic PlantUML source (`.puml`); in-process SVG
  via `@plantuml/core` can be layered on without touching the model.

All adapters sort nodes and edges before emitting, so identical baselines
produce identical bytes.

## Consequence

Swapping or adding diagram libraries is a leaf concern; the semantic thread is
unaffected.
