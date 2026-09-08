/**
 * Deterministic Interface Control Document generation (ADR-006):
 * the ICD is a projection of the authoritative model and trace graph,
 * reproducible byte-for-byte from a BaselineManifest.
 */

export const DOC_TEMPLATES_VERSION = "3.2.0";

export interface IcdInterfaceEntry {
  anchor: string;
  name: string;
  qualifiedName: string;
  sourceElementId: string;
  ownerName: string;
  connectedSystems: string[];
  direction: string;
  payloadTypes: string[];
  profiles: { canonical: string; version: string; fhirVersion: string }[];
  terminologyBindings: { system: string; note: string }[];
  cardinalities: string[];
  units: { engineering: string; ucum: string }[];
  updateFrequency: string;
  latency: string;
  offlineBehavior: string;
  bufferingPolicy: string;
  security: string;
  errorSemantics: string;
  dataProvenance: string;
  powerComputeNetwork: string;
  constrainedBy: { elementId: string; name: string; text: string }[];
  verification: {
    caseId: string;
    name: string;
    method: string;
    status: string;
    evidence: { uri: string; sha256?: string }[];
  }[];
}

export interface IcdModel {
  title: string;
  baselineId: string;
  sysml: { projectId: string; commitId: string };
  fhirPackage: { name: string; version: string; fhirVersion: string };
  mappingRulesVersion: string;
  generatedAt: string;
  generator: { name: string; version: string };
  interfaces: IcdInterfaceEntry[];
  changeHistory: { commitId: string; description: string }[];
}

export function generateIcdMarkdown(model: IcdModel): string {
  const lines: string[] = [];
  lines.push(`# ${model.title}`);
  lines.push("");
  lines.push("## Interface identity and baseline");
  lines.push("");
  lines.push("| Field | Value |");
  lines.push("| --- | --- |");
  lines.push(`| Baseline | \`${model.baselineId}\` |`);
  lines.push(`| SysML project | \`${model.sysml.projectId}\` |`);
  lines.push(`| SysML commit | \`${model.sysml.commitId}\` |`);
  lines.push(
    `| FHIR package | \`${model.fhirPackage.name}#${model.fhirPackage.version}\` (FHIR ${model.fhirPackage.fhirVersion}) |`,
  );
  lines.push(`| Mapping rules | \`${model.mappingRulesVersion}\` |`);
  lines.push(`| Doc templates | \`${DOC_TEMPLATES_VERSION}\` |`);
  lines.push(
    `| Generator | \`${model.generator.name} ${model.generator.version}\` |`,
  );
  lines.push(`| Generated at | ${model.generatedAt} |`);
  lines.push("");

  for (const itf of model.interfaces) {
    lines.push(`## Interface: ${itf.name} {#${itf.anchor}}`);
    lines.push("");
    lines.push(`Source element: \`${itf.sourceElementId}\` (\`${itf.qualifiedName}\`)`);
    lines.push("");
    lines.push("| Field | Value |");
    lines.push("| --- | --- |");
    lines.push(`| Owning part | ${itf.ownerName} |`);
    lines.push(`| Connected systems | ${itf.connectedSystems.join(", ") || "—"} |`);
    lines.push(`| Direction | ${itf.direction} |`);
    lines.push(`| Payload / resource types | ${itf.payloadTypes.join(", ") || "—"} |`);
    lines.push(
      `| FHIR profiles | ${
        itf.profiles
          .map((p) => `\`${p.canonical}\` v${p.version} (FHIR ${p.fhirVersion})`)
          .join("<br>") || "—"
      } |`,
    );
    lines.push(
      `| Terminology bindings | ${
        itf.terminologyBindings.map((t) => `${t.system} — ${t.note}`).join("<br>") || "—"
      } |`,
    );
    lines.push(`| Cardinalities | ${itf.cardinalities.join("<br>") || "—"} |`);
    lines.push(
      `| Units | ${
        itf.units.map((u) => `${u.engineering} → UCUM \`${u.ucum}\``).join("<br>") || "—"
      } |`,
    );
    lines.push(`| Update frequency / volume | ${itf.updateFrequency} |`);
    lines.push(`| Latency / priority | ${itf.latency} |`);
    lines.push(`| Offline behavior | ${itf.offlineBehavior} |`);
    lines.push(`| Buffering / retry | ${itf.bufferingPolicy} |`);
    lines.push(`| Security / authorization | ${itf.security} |`);
    lines.push(`| Error semantics | ${itf.errorSemantics} |`);
    lines.push(`| Data provenance | ${itf.dataProvenance} |`);
    lines.push(`| Power / compute / network | ${itf.powerComputeNetwork} |`);
    lines.push("");
    lines.push("### Constraining requirements");
    lines.push("");
    if (itf.constrainedBy.length === 0) {
      lines.push("None.");
    } else {
      for (const req of itf.constrainedBy) {
        lines.push(`- **${req.name}** (\`${req.elementId}\`): ${req.text}`);
      }
    }
    lines.push("");
    lines.push("### Verification");
    lines.push("");
    if (itf.verification.length === 0) {
      lines.push("No verification cases linked.");
    } else {
      lines.push("| Case | Method | Status | Evidence |");
      lines.push("| --- | --- | --- | --- |");
      for (const v of itf.verification) {
        const evidence =
          v.evidence
            .map((e) => (e.sha256 ? `${e.uri} (\`${e.sha256.slice(0, 16)}…\`)` : e.uri))
            .join("<br>") || "—";
        lines.push(`| ${v.name} (\`${v.caseId}\`) | ${v.method} | ${v.status} | ${evidence} |`);
      }
    }
    lines.push("");
  }

  lines.push("## Change history");
  lines.push("");
  lines.push("| SysML commit | Description |");
  lines.push("| --- | --- |");
  for (const change of model.changeHistory) {
    lines.push(`| \`${change.commitId}\` | ${change.description} |`);
  }
  lines.push("");
  return lines.join("\n");
}

/**
 * Deterministic HTML rendering of the ICD model: a formal engineering
 * "technical data package" document, rendered directly from structured data
 * (never from the markdown). Same aesthetic family as the trace explorer.
 */
export function generateIcdHtml(model: IcdModel): string {
  const h: string[] = [];
  const esc = escapeHtml;

  h.push("<!doctype html>");
  h.push('<html lang="en">');
  h.push("<head>");
  h.push('<meta charset="utf-8">');
  h.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
  h.push(`<title>${esc(model.title)}</title>`);
  h.push('<link rel="preconnect" href="https://fonts.googleapis.com">');
  h.push(
    '<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Serif:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">',
  );
  h.push("<style>");
  h.push(`
:root {
  --paper: #f7f5f0;
  --ink: #1c1a17;
  --ink-soft: #57524a;
  --rule: #c9c3b6;
  --rule-dark: #8f8878;
  --stamp: #b3341f;
  --accent: #1f4e8c;
  --mono: "IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace;
  --serif: "IBM Plex Serif", Georgia, "Times New Roman", serif;
}
* { box-sizing: border-box; }
html { background: #dedbd3; }
body {
  font-family: var(--serif);
  color: var(--ink);
  background:
    repeating-linear-gradient(0deg, transparent 0 31px, rgba(28,26,23,.025) 31px 32px),
    var(--paper);
  max-width: 62rem;
  margin: 2.5rem auto 5rem;
  padding: 3.5rem 4rem 4rem;
  border: 1px solid var(--rule-dark);
  box-shadow: 0 2px 0 rgba(28,26,23,.18), 0 18px 40px rgba(28,26,23,.22);
  line-height: 1.55;
  font-size: 15px;
}
header.titleblock {
  border: 2px solid var(--ink);
  margin-bottom: 2.5rem;
  position: relative;
}
.titleblock .doc-org {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: .22em;
  text-transform: uppercase;
  padding: .55rem .9rem;
  border-bottom: 2px solid var(--ink);
  display: flex;
  justify-content: space-between;
  color: var(--ink-soft);
}
.titleblock h1 {
  font-family: var(--serif);
  font-weight: 600;
  font-size: 1.72rem;
  line-height: 1.25;
  margin: 0;
  padding: 1.1rem .9rem 1.2rem;
  border-bottom: 2px solid var(--ink);
}
.titleblock .meta {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  font-family: var(--mono);
  font-size: 11.5px;
}
.titleblock .meta > div {
  padding: .5rem .9rem .6rem;
  border-right: 1px solid var(--rule-dark);
}
.titleblock .meta > div:nth-child(4n) { border-right: none; }
.titleblock .meta > div:nth-child(-n+4) { border-bottom: 1px solid var(--rule-dark); }
.titleblock .meta dt {
  font-size: 9.5px;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: var(--ink-soft);
  margin: 0 0 .15rem;
}
.titleblock .meta dd { margin: 0; word-break: break-all; }
.stamp {
  position: absolute;
  top: -1.1rem;
  right: 1.4rem;
  transform: rotate(-3deg);
  font-family: var(--mono);
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: .2em;
  text-transform: uppercase;
  color: var(--stamp);
  border: 2px solid var(--stamp);
  padding: .38rem .7rem;
  background: var(--paper);
  box-shadow: 0 1px 0 rgba(28,26,23,.15);
}
h2 {
  font-family: var(--mono);
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: .24em;
  text-transform: uppercase;
  color: var(--ink);
  border-bottom: 2px solid var(--ink);
  padding-bottom: .4rem;
  margin: 2.8rem 0 1rem;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
h2 .secno { color: var(--stamp); margin-right: .8rem; }
h2 .anchor { color: var(--rule-dark); font-size: 10px; letter-spacing: .1em; }
h3 {
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .2em;
  text-transform: uppercase;
  color: var(--ink-soft);
  margin: 1.8rem 0 .6rem;
}
table { border-collapse: collapse; width: 100%; font-size: 13.5px; }
th, td {
  border: 1px solid var(--rule);
  padding: .42rem .65rem;
  text-align: left;
  vertical-align: top;
}
th {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: .16em;
  text-transform: uppercase;
  font-weight: 600;
  background: rgba(28,26,23,.045);
  color: var(--ink-soft);
  width: 15rem;
}
thead th { width: auto; }
code {
  font-family: var(--mono);
  font-size: .86em;
  background: rgba(31,78,140,.07);
  color: var(--accent);
  padding: .05em .3em;
  word-break: break-all;
}
.req { margin: .5rem 0 .5rem; padding-left: 1rem; border-left: 3px solid var(--accent); }
.req .req-id { font-family: var(--mono); font-size: 11px; color: var(--accent); letter-spacing: .08em; }
.req p { margin: .2rem 0 0; }
.pass { color: #1c6b34; font-weight: 600; font-family: var(--mono); font-size: 12px; text-transform: uppercase; letter-spacing: .1em; }
.fail { color: var(--stamp); font-weight: 600; font-family: var(--mono); font-size: 12px; text-transform: uppercase; letter-spacing: .1em; }
footer {
  margin-top: 3.5rem;
  padding-top: .8rem;
  border-top: 1px solid var(--rule-dark);
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--ink-soft);
  display: flex;
  justify-content: space-between;
}
@media print { html { background: #fff; } body { box-shadow: none; border: none; margin: 0; } }
`);
  h.push("</style>");
  h.push("</head>");
  h.push("<body>");

  h.push('<header class="titleblock">');
  h.push('<div class="stamp">Generated from model — do not edit</div>');
  h.push('<div class="doc-org"><span>NodeOnSysML digital-thread kernel</span><span>Interface Control Document</span></div>');
  h.push(`<h1>${esc(model.title)}</h1>`);
  h.push('<dl class="meta">');
  const metaCell = (label: string, value: string): void => {
    h.push(`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`);
  };
  metaCell("Baseline", model.baselineId);
  metaCell("SysML commit", model.sysml.commitId);
  metaCell("FHIR package", `${model.fhirPackage.name}#${model.fhirPackage.version} (FHIR ${model.fhirPackage.fhirVersion})`);
  metaCell("Mapping rules", model.mappingRulesVersion);
  metaCell("SysML project", model.sysml.projectId);
  metaCell("Doc templates", DOC_TEMPLATES_VERSION);
  metaCell("Generator", `${model.generator.name} ${model.generator.version}`);
  metaCell("Generated at", model.generatedAt);
  h.push("</dl>");
  h.push("</header>");

  let section = 1;
  for (const itf of model.interfaces) {
    h.push(
      `<h2 id="${esc(itf.anchor)}"><span><span class="secno">${section}.0</span>Interface — ${esc(itf.name)}</span><span class="anchor">${esc(itf.sourceElementId)}</span></h2>`,
    );
    h.push(`<p>Source element <code>${esc(itf.qualifiedName)}</code>, owned by <strong>${esc(itf.ownerName)}</strong>.</p>`);
    h.push("<table><tbody>");
    const row = (label: string, valueHtml: string): void => {
      h.push(`<tr><th>${esc(label)}</th><td>${valueHtml}</td></tr>`);
    };
    row("Connected systems", esc(itf.connectedSystems.join(", ") || "—"));
    row("Direction", esc(itf.direction));
    row("Payload / resource types", itf.payloadTypes.map((p) => `<code>${esc(p)}</code>`).join(" ") || "—");
    row(
      "FHIR profiles",
      itf.profiles
        .map((p) => `<code>${esc(p.canonical)}</code> v${esc(p.version)} (FHIR ${esc(p.fhirVersion)})`)
        .join("<br>") || "—",
    );
    row(
      "Terminology bindings",
      itf.terminologyBindings.map((t) => `<code>${esc(t.system)}</code> — ${esc(t.note)}`).join("<br>") || "—",
    );
    row("Cardinalities", itf.cardinalities.map(esc).join("<br>") || "—");
    row("Units", itf.units.map((u) => `${esc(u.engineering)} → UCUM <code>${esc(u.ucum)}</code>`).join("<br>") || "—");
    row("Update frequency / volume", esc(itf.updateFrequency));
    row("Latency / priority", esc(itf.latency));
    row("Offline behavior", esc(itf.offlineBehavior));
    row("Buffering / retry", esc(itf.bufferingPolicy));
    row("Security / authorization", esc(itf.security));
    row("Error semantics", esc(itf.errorSemantics));
    row("Data provenance", esc(itf.dataProvenance));
    row("Power / compute / network", esc(itf.powerComputeNetwork));
    h.push("</tbody></table>");

    h.push(`<h3>${section}.1 Constraining requirements</h3>`);
    if (itf.constrainedBy.length === 0) {
      h.push("<p>None.</p>");
    } else {
      for (const req of itf.constrainedBy) {
        h.push(
          `<div class="req"><span class="req-id">${esc(req.elementId)} — ${esc(req.name)}</span><p>${esc(req.text)}</p></div>`,
        );
      }
    }

    h.push(`<h3>${section}.2 Verification</h3>`);
    if (itf.verification.length === 0) {
      h.push("<p>No verification cases linked.</p>");
    } else {
      h.push("<table><thead><tr><th>Case</th><th>Method</th><th>Status</th><th>Evidence</th></tr></thead><tbody>");
      for (const v of itf.verification) {
        const evidence =
          v.evidence
            .map((e) => (e.sha256 ? `${esc(e.uri)} <code>${esc(e.sha256.slice(0, 16))}…</code>` : esc(e.uri)))
            .join("<br>") || "—";
        const statusClass = v.status === "pass" ? "pass" : "fail";
        h.push(
          `<tr><td>${esc(v.name)}<br><code>${esc(v.caseId)}</code></td><td>${esc(v.method)}</td><td><span class="${statusClass}">${esc(v.status)}</span></td><td>${evidence}</td></tr>`,
        );
      }
      h.push("</tbody></table>");
    }
    section += 1;
  }

  h.push(`<h2><span><span class="secno">${section}.0</span>Change history</span></h2>`);
  h.push("<table><thead><tr><th>SysML commit</th><th>Description</th></tr></thead><tbody>");
  for (const change of model.changeHistory) {
    h.push(`<tr><td><code>${esc(change.commitId)}</code></td><td>${esc(change.description)}</td></tr>`);
  }
  h.push("</tbody></table>");

  h.push(
    `<footer><span>Deterministic projection of baseline ${esc(model.baselineId)}</span><span>${esc(model.generator.name)} ${esc(model.generator.version)}</span></footer>`,
  );
  h.push("</body>");
  h.push("</html>");
  h.push("");
  return h.join("\n");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
