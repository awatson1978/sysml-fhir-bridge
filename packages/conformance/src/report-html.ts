import type { ConformanceReport } from "./check.js";

/** Deterministic HTML projection of a conformance report — an engineering
 * "conformance certificate" in the same document family as the ICD. */
export function generateConformanceReportHtml(report: ConformanceReport): string {
  const esc = escapeHtml;
  const conformant = report.verdict === "conformant";
  const h: string[] = [];

  h.push("<!doctype html>");
  h.push('<html lang="en">');
  h.push("<head>");
  h.push('<meta charset="utf-8">');
  h.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
  h.push(`<title>Conformance report — ${esc(report.interfaceName)}</title>`);
  h.push('<link rel="preconnect" href="https://fonts.googleapis.com">');
  h.push(
    '<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=IBM+Plex+Serif:wght@400;600&display=swap" rel="stylesheet">',
  );
  h.push("<style>");
  h.push(`
:root {
  --paper: #f7f5f0; --ink: #1c1a17; --ink-soft: #57524a; --rule: #c9c3b6;
  --rule-dark: #8f8878; --pass: #1c6b34; --fail: #b3341f; --na: #8f8878;
  --accent: #1f4e8c; --mono: "IBM Plex Mono", ui-monospace, Menlo, monospace;
  --serif: "IBM Plex Serif", Georgia, serif;
}
* { box-sizing: border-box; }
html { background: #dedbd3; }
body {
  font-family: var(--serif); color: var(--ink);
  background: repeating-linear-gradient(0deg, transparent 0 31px, rgba(28,26,23,.025) 31px 32px), var(--paper);
  max-width: 58rem; margin: 2.5rem auto 5rem; padding: 3.5rem 4rem 4rem;
  border: 1px solid var(--rule-dark);
  box-shadow: 0 2px 0 rgba(28,26,23,.18), 0 18px 40px rgba(28,26,23,.22);
  line-height: 1.55; font-size: 15px;
}
.verdict {
  border: 3px solid ${conformant ? "var(--pass)" : "var(--fail)"};
  color: ${conformant ? "var(--pass)" : "var(--fail)"};
  padding: 1rem 1.3rem; margin-bottom: 2rem; display: flex;
  justify-content: space-between; align-items: center;
}
.verdict .v-label { font-family: var(--mono); font-size: 9.5px; letter-spacing: .24em; text-transform: uppercase; color: var(--ink-soft); }
.verdict .v-value { font-family: var(--mono); font-weight: 700; font-size: 1.4rem; letter-spacing: .1em; text-transform: uppercase; }
.verdict .v-counts { font-family: var(--mono); font-size: 12px; text-align: right; color: var(--ink-soft); }
.verdict .v-counts b.pass { color: var(--pass); } .verdict .v-counts b.fail { color: var(--fail); }
h1 { font-family: var(--serif); font-weight: 600; font-size: 1.5rem; margin: 0 0 .3rem; }
.sub { font-family: var(--mono); font-size: 11px; color: var(--ink-soft); letter-spacing: .04em; margin-bottom: 2rem; }
.defer {
  font-family: var(--mono); font-size: 11px; line-height: 1.6; color: var(--ink-soft);
  border-left: 3px solid var(--accent); padding: .5rem .9rem; margin: 1.5rem 0 2rem; background: rgba(31,78,140,.05);
}
h2 { font-family: var(--mono); font-size: 12px; font-weight: 600; letter-spacing: .22em; text-transform: uppercase;
  border-bottom: 2px solid var(--ink); padding-bottom: .4rem; margin: 2rem 0 1rem; }
table { border-collapse: collapse; width: 100%; font-size: 13px; }
th, td { border: 1px solid var(--rule); padding: .42rem .6rem; text-align: left; vertical-align: top; }
th { font-family: var(--mono); font-size: 10px; letter-spacing: .14em; text-transform: uppercase; font-weight: 600; background: rgba(28,26,23,.045); color: var(--ink-soft); }
code { font-family: var(--mono); font-size: .86em; background: rgba(31,78,140,.07); color: var(--accent); padding: .05em .3em; }
.st { font-family: var(--mono); font-weight: 700; font-size: 10px; letter-spacing: .1em; text-transform: uppercase; }
.st.pass { color: var(--pass); } .st.fail { color: var(--fail); } .st.na { color: var(--na); }
footer { margin-top: 3rem; padding-top: .8rem; border-top: 1px solid var(--rule-dark);
  font-family: var(--mono); font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-soft);
  display: flex; justify-content: space-between; }
@media print { html { background: #fff; } body { box-shadow: none; border: none; } }
`);
  h.push("</style></head><body>");

  h.push('<div class="verdict">');
  h.push(
    `<div><div class="v-label">Interface conformance verdict</div><div class="v-value">${conformant ? "Conformant" : "Non-conformant"}</div></div>`,
  );
  h.push(
    `<div class="v-counts"><b class="pass">${report.summary.pass}</b> pass · <b class="fail">${report.summary.fail}</b> fail · ${report.summary.notApplicable} n/a</div>`,
  );
  h.push("</div>");

  h.push(`<h1>Conformance report — ${esc(report.interfaceName)}</h1>`);
  h.push(
    `<div class="sub">bundle <code>${esc(report.bundleId)}</code> · interface <code>${esc(report.interfaceId)}</code> · baseline <code>${esc(report.baselineId)}</code> · checked ${esc(report.checkedAt)}</div>`,
  );

  h.push(
    `<div class="defer"><strong>Scope.</strong> This report checks the <em>interface-contract</em> layer — permitted payload types, SysML-modeled units, and terminology bindings. Full FHIR StructureDefinition conformance against <code>${esc(report.profile.canonical)}</code> (v${esc(report.profile.version)}, FHIR ${esc(report.profile.fhirVersion)}) is <strong>deferred to the HL7 FHIR Validator</strong> — SysML–FHIR Bridge does not reimplement it.</div>`,
  );

  h.push("<h2>Checks</h2>");
  h.push("<table><thead><tr><th>Check</th><th>Resource</th><th>Status</th><th>Detail</th></tr></thead><tbody>");
  for (const c of report.checks) {
    const cls = c.status === "pass" ? "pass" : c.status === "fail" ? "fail" : "na";
    const label = c.status === "not-applicable" ? "n/a" : c.status;
    h.push(
      `<tr><td>${esc(c.check)}</td><td>${esc(c.resourceType)}/<code>${esc(c.resourceId)}</code></td><td><span class="st ${cls}">${esc(label)}</span></td><td>${esc(c.detail)}</td></tr>`,
    );
  }
  h.push("</tbody></table>");

  h.push(
    `<footer><span>Interface-contract conformance · projection of baseline ${esc(report.baselineId)}</span><span>FHIR profile conformance: HL7 validator</span></footer>`,
  );
  h.push("</body></html>");
  h.push("");
  return h.join("\n");
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
