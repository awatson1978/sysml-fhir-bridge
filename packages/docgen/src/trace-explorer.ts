/**
 * Interactive trace-graph explorer: a self-contained, dependency-free HTML
 * console rendering the SysML -> TraceLink -> FHIR thread with status-colored
 * edges, a commit-state toggle, and a detail readout panel.
 *
 * The page is a deterministic projection (ADR-005/006): all semantic content
 * arrives via the embedded JSON produced from the model + trace store; the
 * client script only lays it out and colors it. The panel is built with DOM
 * methods and textContent only — no innerHTML — so model-supplied strings can
 * never execute as markup.
 */

export interface ExplorerCommitState {
  commitId: string;
  label: string;
  description: string;
}

export interface ExplorerSysmlNode {
  id: string;
  name: string;
  kind: string;
  qualifiedName: string;
  documentation?: string;
  /** commitIds in which this element exists. */
  presentIn: string[];
}

export interface ExplorerTargetNode {
  id: string;
  label: string;
  sublabel: string;
  type: "fhir" | "external";
}

export interface ExplorerEdge {
  traceId: string;
  sourceId: string;
  targetId: string;
  relationship: string;
  ruleId: string;
  ruleVersion: string;
  confidence?: string;
  sourceHash?: string;
  targetHash?: string;
  statusByCommit: Record<string, { status: string; reason?: string }>;
}

export interface ExplorerModelEdge {
  sourceId: string;
  targetId: string;
  label: string;
}

export interface TraceExplorerInput {
  title: string;
  baselineId: string;
  generatedAt: string;
  commits: ExplorerCommitState[];
  sysmlNodes: ExplorerSysmlNode[];
  targetNodes: ExplorerTargetNode[];
  edges: ExplorerEdge[];
  modelEdges: ExplorerModelEdge[];
}

export function generateTraceExplorerHtml(input: TraceExplorerInput): string {
  const json = JSON.stringify(input, null, 0).replace(/<\//g, "<\\/");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(input.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root {
  --bg: #0a0f14;
  --bg-grid: rgba(87, 199, 255, .05);
  --panel: #0f161e;
  --panel-edge: #1d2935;
  --text: #d7e0e8;
  --dim: #74818d;
  --faint: #46525e;
  --valid: #35d97e;
  --stale: #ffb43a;
  --invalid: #ff5449;
  --model-edge: #33404d;
  --select: #57c7ff;
  --mono: "IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace;
}
* { box-sizing: border-box; margin: 0; }
html, body { height: 100%; }
body {
  font-family: var(--mono);
  background:
    linear-gradient(var(--bg-grid) 1px, transparent 1px) 0 0 / 100% 48px,
    linear-gradient(90deg, var(--bg-grid) 1px, transparent 1px) 0 0 / 48px 100%,
    var(--bg);
  color: var(--text);
  display: grid;
  grid-template-rows: auto 1fr;
  grid-template-columns: 1fr 340px;
  grid-template-areas: "toolbar toolbar" "canvas panel";
  overflow: hidden;
}
header {
  grid-area: toolbar;
  display: flex;
  align-items: center;
  gap: 1.6rem;
  padding: .8rem 1.4rem;
  background: var(--panel);
  border-bottom: 1px solid var(--panel-edge);
  flex-wrap: wrap;
}
header h1 {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .28em;
  text-transform: uppercase;
}
header h1 span { color: var(--select); }
.baseline-tag { font-size: 10px; color: var(--dim); letter-spacing: .14em; }
.states { display: flex; border: 1px solid var(--panel-edge); }
.states button {
  font: 600 10px/1 var(--mono);
  letter-spacing: .16em;
  text-transform: uppercase;
  color: var(--dim);
  background: transparent;
  border: none;
  border-right: 1px solid var(--panel-edge);
  padding: .55rem .9rem;
  cursor: pointer;
}
.states button:last-child { border-right: none; }
.states button.on { color: var(--bg); background: var(--select); }
.counters { display: flex; gap: 1.1rem; margin-left: auto; }
.counter { font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: var(--dim); }
.counter b { font-size: 15px; display: block; letter-spacing: 0; }
.counter.valid b { color: var(--valid); }
.counter.stale b { color: var(--stale); }
.counter.invalid b { color: var(--invalid); }
.legend { display: flex; gap: 1rem; font-size: 9.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--dim); }
.legend i { display: inline-block; width: 14px; height: 3px; margin-right: .35rem; vertical-align: middle; }
main { grid-area: canvas; overflow: auto; position: relative; }
svg { display: block; }
.col-title {
  font: 600 10px var(--mono);
  letter-spacing: .3em;
  text-transform: uppercase;
  fill: var(--faint);
}
.node rect {
  fill: var(--panel);
  stroke: var(--panel-edge);
  stroke-width: 1.2;
  cursor: pointer;
}
.node text { pointer-events: none; }
.node .n-name { font: 600 12px var(--mono); fill: var(--text); }
.node .n-kind { font: 500 9px var(--mono); fill: var(--dim); letter-spacing: .12em; text-transform: uppercase; }
.node.sel rect { stroke: var(--select); stroke-width: 1.8; }
.node.removed rect { stroke: var(--invalid); stroke-dasharray: 4 3; }
.node.removed .n-name { fill: var(--dim); text-decoration: line-through; }
.node .removed-tag { font: 700 8.5px var(--mono); fill: var(--invalid); letter-spacing: .18em; }
.edge { fill: none; stroke-width: 1.6; cursor: pointer; transition: opacity .15s; }
.edge.model { stroke: var(--model-edge); stroke-width: 1.1; stroke-dasharray: 2 4; cursor: default; }
.edge.valid { stroke: var(--valid); }
.edge.stale { stroke: var(--stale); stroke-dasharray: 7 4; }
.edge.invalid { stroke: var(--invalid); stroke-dasharray: 2 3; }
.edge.dimmed { opacity: .12; }
.edge.sel { stroke-width: 3; filter: drop-shadow(0 0 4px currentColor); }
.edge-hit { fill: none; stroke: transparent; stroke-width: 14; cursor: pointer; }
aside {
  grid-area: panel;
  background: var(--panel);
  border-left: 1px solid var(--panel-edge);
  overflow-y: auto;
  padding: 1.2rem 1.3rem 2rem;
}
aside h2 {
  font-size: 10px;
  letter-spacing: .26em;
  text-transform: uppercase;
  color: var(--faint);
  border-bottom: 1px solid var(--panel-edge);
  padding-bottom: .6rem;
  margin-bottom: 1rem;
}
.readout dt {
  font-size: 9px;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: var(--dim);
  margin-top: .9rem;
}
.readout dd { font-size: 11.5px; word-break: break-all; line-height: 1.5; margin-top: .15rem; }
.status-chip {
  display: inline-block;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: .18em;
  text-transform: uppercase;
  padding: .28rem .55rem;
  border: 1px solid currentColor;
  margin-right: .4rem;
}
.status-chip.valid { color: var(--valid); }
.status-chip.stale { color: var(--stale); }
.status-chip.invalid { color: var(--invalid); }
.trace-list { list-style: none; padding: 0; margin-top: .4rem; }
.trace-list li {
  border: 1px solid var(--panel-edge);
  padding: .5rem .6rem;
  margin-bottom: .45rem;
  font-size: 10.5px;
  cursor: pointer;
  line-height: 1.6;
}
.trace-list li:hover { border-color: var(--select); }
.hint { color: var(--faint); font-size: 11px; line-height: 1.7; }
.reason { color: var(--stale); display: block; margin-top: .4rem; }
</style>
</head>
<body>
<header>
  <h1>Trace <span>Explorer</span></h1>
  <span class="baseline-tag" id="baseline-tag"></span>
  <div class="states" id="states"></div>
  <div class="legend">
    <span><i style="background:var(--valid)"></i>valid</span>
    <span><i style="background:repeating-linear-gradient(90deg,var(--stale) 0 6px,transparent 6px 10px)"></i>stale</span>
    <span><i style="background:repeating-linear-gradient(90deg,var(--invalid) 0 3px,transparent 3px 6px)"></i>invalid</span>
    <span><i style="background:repeating-linear-gradient(90deg,var(--model-edge) 0 2px,transparent 2px 5px)"></i>model</span>
  </div>
  <div class="counters">
    <span class="counter valid"><b id="c-valid">0</b>valid</span>
    <span class="counter stale"><b id="c-stale">0</b>stale</span>
    <span class="counter invalid"><b id="c-invalid">0</b>invalid</span>
  </div>
</header>
<main><svg id="graph" xmlns="http://www.w3.org/2000/svg"></svg></main>
<aside>
  <h2>Readout</h2>
  <div id="panel"></div>
</aside>
<script id="data" type="application/json">${json}</script>
<script>
"use strict";
const DATA = JSON.parse(document.getElementById("data").textContent);
const svg = document.getElementById("graph");
const NS = "http://www.w3.org/2000/svg";
const NODE_W = 250, NODE_H = 52, ROW_GAP = 30, TOP = 64;
const COLS = [
  { key: "req", title: "Requirements", x: 36 },
  { key: "sys", title: "System model (SysML)", x: 372 },
  { key: "clin", title: "Clinical interface (FHIR)", x: 736 },
];
let stateIdx = 0;
const hashState = location.hash.match(/state=(\\d+)/);
if (hashState) stateIdx = Math.min(DATA.commits.length - 1, parseInt(hashState[1], 10) || 0);
let selection = null; // {type:"node"|"edge", id}

const colOf = (n) => n.kind === "RequirementUsage" ? "req" : "sys";
const nodes = new Map();
DATA.sysmlNodes.forEach((n) => nodes.set(n.id, { ...n, col: colOf(n), isTarget: false }));
DATA.targetNodes.forEach((n) => nodes.set(n.id, { ...n, col: "clin", isTarget: true }));

// deterministic row assignment per column
for (const col of COLS) {
  let i = 0;
  for (const n of nodes.values()) if (n.col === col.key) {
    n.x = col.x; n.y = TOP + i * (NODE_H + ROW_GAP); i += 1;
  }
  col.count = i;
}
const height = TOP + Math.max(...COLS.map((c) => c.count)) * (NODE_H + ROW_GAP) + 40;
svg.setAttribute("width", 1030);
svg.setAttribute("height", height);
svg.setAttribute("viewBox", "0 0 1030 " + height);

function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  (parent || svg).appendChild(e);
  return e;
}
// DOM helper: HTML element with textContent only (no markup interpretation).
function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function bezier(a, b, sameCol) {
  const x1 = sameCol ? a.x : a.x + NODE_W, y1 = a.y + NODE_H / 2;
  const x2 = b.x, y2 = b.y + NODE_H / 2;
  const dx = sameCol ? -70 : Math.max(50, (x2 - x1) / 2);
  return "M" + x1 + "," + y1 + " C" + (x1 + dx) + "," + y1 + " " + (x2 - dx) + "," + y2 + " " + x2 + "," + y2;
}

COLS.forEach((c) => {
  const t = el("text", { x: c.x, y: 34, class: "col-title" });
  t.textContent = c.title.toUpperCase();
});

// model edges (structure) below trace edges, nodes on top
const edgeEls = [];
DATA.modelEdges.forEach((me) => {
  const a = nodes.get(me.sourceId), b = nodes.get(me.targetId);
  if (!a || !b) return;
  const p = el("path", { d: bezier(a, b, a.col === b.col), class: "edge model" });
  const t = el("title", {}, p);
  t.textContent = me.label;
});
DATA.edges.forEach((e) => {
  const a = nodes.get(e.sourceId), b = nodes.get(e.targetId);
  if (!a || !b) return;
  const d = bezier(a, b, false);
  const path = el("path", { d, class: "edge" });
  const hit = el("path", { d, class: "edge-hit" });
  hit.addEventListener("click", () => select({ type: "edge", id: e.traceId }));
  edgeEls.push({ e, path });
});
const nodeEls = new Map();
for (const n of nodes.values()) {
  const g = el("g", { class: "node" });
  el("rect", { x: n.x, y: n.y, width: NODE_W, height: NODE_H, rx: 2 }, g);
  const name = el("text", { x: n.x + 12, y: n.y + 22, class: "n-name" }, g);
  name.textContent = (n.name || n.label).slice(0, 28);
  const kind = el("text", { x: n.x + 12, y: n.y + 38, class: "n-kind" }, g);
  kind.textContent = n.isTarget ? n.sublabel : n.kind;
  const tag = el("text", { x: n.x + NODE_W - 66, y: n.y + 14, class: "removed-tag" }, g);
  g.addEventListener("click", () => select({ type: "node", id: n.id }));
  g.addEventListener("mouseenter", () => dimUnrelated(n.id));
  g.addEventListener("mouseleave", () => dimUnrelated(null));
  nodeEls.set(n.id, { g, tag });
}

function refresh() {
  const commit = DATA.commits[stateIdx];
  const counts = { valid: 0, stale: 0, invalid: 0 };
  edgeEls.forEach(({ e, path }) => {
    const st = e.statusByCommit[commit.commitId] || { status: "valid" };
    const isSel = selection && selection.type === "edge" && selection.id === e.traceId;
    path.setAttribute("class", "edge " + st.status + (isSel ? " sel" : ""));
    if (counts[st.status] !== undefined) counts[st.status] += 1;
  });
  for (const n of nodes.values()) {
    const { g, tag } = nodeEls.get(n.id);
    const removed = !n.isTarget && n.presentIn.indexOf(commit.commitId) < 0;
    const isSel = selection && selection.type === "node" && selection.id === n.id;
    g.setAttribute("class", "node" + (removed ? " removed" : "") + (isSel ? " sel" : ""));
    tag.textContent = removed ? "REMOVED" : "";
  }
  document.getElementById("c-valid").textContent = counts.valid;
  document.getElementById("c-stale").textContent = counts.stale;
  document.getElementById("c-invalid").textContent = counts.invalid;
  document.querySelectorAll(".states button").forEach((b, i) => {
    b.className = i === stateIdx ? "on" : "";
  });
  renderPanel();
}

function dimUnrelated(nodeId) {
  edgeEls.forEach(({ e, path }) => {
    const related = nodeId === null || e.sourceId === nodeId || e.targetId === nodeId;
    path.classList.toggle("dimmed", !related);
  });
}

function select(sel) { selection = sel; refresh(); }

function readoutRow(dl, label, valueNode) {
  dl.appendChild(h("dt", null, label));
  const dd = h("dd");
  if (typeof valueNode === "string") dd.textContent = valueNode;
  else dd.appendChild(valueNode);
  dl.appendChild(dd);
}
function chipNode(st) {
  const wrap = h("span");
  wrap.appendChild(h("span", "status-chip " + st.status, st.status));
  if (st.reason) wrap.appendChild(h("em", "reason", st.reason));
  return wrap;
}

function renderPanel() {
  const panel = document.getElementById("panel");
  const commit = DATA.commits[stateIdx];
  panel.replaceChildren();
  if (!selection) {
    const hint = h("p", "hint",
      "Select a node or a trace edge. Toggle the commit state above to watch links go stale " +
      "(requirement changed) or invalid (element deleted) — the digital thread's impact analysis, live.");
    panel.appendChild(hint);
    return;
  }
  const dl = h("dl", "readout");
  if (selection.type === "edge") {
    const e = DATA.edges.find((x) => x.traceId === selection.id);
    const a = nodes.get(e.sourceId), b = nodes.get(e.targetId);
    const st = e.statusByCommit[commit.commitId] || { status: "valid" };
    readoutRow(dl, "TraceLink", e.traceId);
    readoutRow(dl, "Status @ " + commit.label, chipNode(st));
    const rel = h("span");
    rel.appendChild(h("span", null, (a.name || a.label) + " "));
    rel.appendChild(h("b", null, e.relationship));
    rel.appendChild(h("span", null, " " + (b.name || b.label)));
    readoutRow(dl, "Relationship", rel);
    readoutRow(dl, "Mapping rule", e.ruleId + " @ " + e.ruleVersion);
    if (e.confidence) readoutRow(dl, "Semantic confidence", e.confidence);
    if (e.sourceHash) readoutRow(dl, "Source hash (pinned)", e.sourceHash.slice(0, 30) + "…");
    if (e.targetHash) readoutRow(dl, "Target hash (pinned)", e.targetHash.slice(0, 30) + "…");
    panel.appendChild(dl);
    return;
  }
  const n = nodes.get(selection.id);
  const touching = DATA.edges.filter((e) => e.sourceId === n.id || e.targetId === n.id);
  const removed = !n.isTarget && n.presentIn.indexOf(commit.commitId) < 0;
  const title = h("span");
  title.appendChild(h("b", null, n.name || n.label));
  if (removed) title.appendChild(h("span", "status-chip invalid", "removed @ " + commit.label));
  readoutRow(dl, n.isTarget ? "Clinical artifact" : "SysML element", title);
  readoutRow(dl, "Type", n.isTarget ? n.sublabel : n.kind);
  if (n.qualifiedName) readoutRow(dl, "Qualified name", n.qualifiedName);
  if (n.documentation) readoutRow(dl, "Documentation", n.documentation);
  readoutRow(dl, "TraceLinks", String(touching.length));
  panel.appendChild(dl);
  const list = h("ul", "trace-list");
  touching.forEach((e) => {
    const st = e.statusByCommit[commit.commitId] || { status: "valid" };
    const li = h("li");
    li.appendChild(h("span", "status-chip " + st.status, st.status));
    const other = nodes.get(e.sourceId === n.id ? e.targetId : e.sourceId);
    li.appendChild(h("span", null, e.relationship + " → " + (other.label || other.name)));
    li.addEventListener("click", () => select({ type: "edge", id: e.traceId }));
    list.appendChild(li);
  });
  panel.appendChild(list);
}

const statesBox = document.getElementById("states");
DATA.commits.forEach((c, i) => {
  const b = h("button", null, c.label);
  b.title = c.description;
  b.addEventListener("click", () => { stateIdx = i; location.hash = "state=" + i; refresh(); });
  statesBox.appendChild(b);
});
document.getElementById("baseline-tag").textContent =
  DATA.baselineId + " · generated " + DATA.generatedAt;
refresh();
</script>
</body>
</html>
`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
