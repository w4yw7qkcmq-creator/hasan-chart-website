import fs from "node:fs";
import { sanitizeForReport, maskSecrets } from "./report-engine.mjs";

function esc(v) {
  return maskSecrets(String(v ?? "")).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const VERDICT_COLOR = {
  HEALTHY: "#16a34a",
  DEGRADED: "#ea580c",
  UNHEALTHY: "#dc2626",
  INCOMPLETE: "#64748b",
};

export function writeCvReport(payload, paths) {
  fs.writeFileSync(paths.files.reportJson, JSON.stringify(payload, null, 2));
  fs.copyFileSync(paths.files.reportJson, paths.files.reportLatest);
  fs.writeFileSync(paths.files.timelineJson, JSON.stringify(payload.timeline, null, 2));
  fs.copyFileSync(paths.files.timelineJson, paths.files.timelineLatest);

  const html = renderHtml(payload);
  fs.writeFileSync(paths.files.reportHtml, html);
  fs.copyFileSync(paths.files.reportHtml, paths.files.reportHtmlLatest);
  return paths;
}

function renderHtml(payload) {
  const color = VERDICT_COLOR[payload.finalVerdict] || "#64748b";
  const cpRows = (payload.checkpoints || [])
    .map(
      (cp) => `<tr><td>${esc(cp.label)}</td><td style="color:${VERDICT_COLOR[cp.verdict] || "#fff"}">${esc(cp.verdict)}</td><td>${esc(cp.startedAt)}</td></tr>`
    )
    .join("");
  const probeRows = (payload.checkpoints || [])
    .flatMap((cp) =>
      (cp.probes || []).map(
        (p) => `<tr><td>${esc(cp.id)}</td><td>${esc(p.probe)}</td><td>${esc(p.status)}</td><td>${p.latencyMs ?? "—"}ms</td><td>${esc(p.retryStatus)}</td></tr>`
      )
    )
    .join("");
  const incRows = (payload.incidents?.all || [])
    .map(
      (i) => `<tr><td>${esc(i.incidentId)}</td><td>${esc(i.severity)}</td><td>${esc(i.status)}</td><td>${esc(i.summary)}</td></tr>`
    )
    .join("");
  const tlRows = (payload.timeline || [])
    .map((e) => `<tr><td class="mono">${esc(e.ts)}</td><td>${esc(e.type)}</td><td>${esc(e.message)}</td></tr>`)
    .join("");

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Continuous Verification — ${esc(payload.finalVerdict)}</title>
<style>
body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:24px;max-width:1200px;margin-inline:auto}
.hero{background:#1e293b;border-radius:12px;padding:24px;margin-bottom:20px;border:1px solid #334155}
.badge{font-size:2rem;font-weight:800;color:${color}}
table{width:100%;border-collapse:collapse;font-size:14px;margin-top:12px}
th,td{border-bottom:1px solid #334155;padding:8px;text-align:left}
th{color:#94a3b8}.mono{font-family:monospace}section{background:#1e293b;border-radius:12px;padding:16px;margin-bottom:16px;border:1px solid #334155}
</style></head><body>
<div class="hero"><h1>Continuous Verification Report</h1><div class="badge">${esc(payload.finalVerdict)}</div>
<p>Environment: ${esc(payload.environment)} · Commit: ${esc(payload.commit)} · Dry run: ${esc(payload.dryRun)}</p>
<p>Started: ${esc(payload.startedAt)} · Completed: ${esc(payload.completedAt)}</p>
<p>Production Gate: ${esc(payload.productionGate?.note)}</p></div>
<section><h2>Checkpoints</h2><table><thead><tr><th>Checkpoint</th><th>Verdict</th><th>Started</th></tr></thead><tbody>${cpRows || "<tr><td colspan='3'>None</td></tr>"}</tbody></table></section>
<section><h2>Probe Results</h2><table><thead><tr><th>Checkpoint</th><th>Probe</th><th>Status</th><th>Latency</th><th>Retry</th></tr></thead><tbody>${probeRows || "<tr><td colspan='5'>None</td></tr>"}</tbody></table></section>
<section><h2>Incidents</h2><table><thead><tr><th>ID</th><th>Severity</th><th>Status</th><th>Summary</th></tr></thead><tbody>${incRows || "<tr><td colspan='4'>None</td></tr>"}</tbody></table></section>
<section><h2>Timeline</h2><table><thead><tr><th>Time</th><th>Type</th><th>Message</th></tr></thead><tbody>${tlRows || "<tr><td colspan='3'>Empty</td></tr>"}</tbody></table></section>
</body></html>`;
}

export { sanitizeForReport };
