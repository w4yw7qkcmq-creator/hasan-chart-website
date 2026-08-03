import fs from "node:fs";
import path from "node:path";

const STATUS_COLORS = {
  PASS: "#16a34a",
  FAIL: "#dc2626",
  BLOCKED: "#ea580c",
  "VERIFY ONLY": "#2563eb",
  VERIFY_ONLY: "#2563eb",
  MANUAL_REQUIRED: "#6b7280",
  "NO-GO": "#dc2626",
  GO: "#16a34a",
  "GO WITH KNOWN ISSUES": "#ea580c",
};

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function rel(fromDir, targetPath) {
  return path.relative(fromDir, targetPath).split(path.sep).join("/");
}

/**
 * @param {object} payload
 * @param {string} outFile absolute path to smoke-report.html
 */
export function writeHtmlReport(payload, outFile) {
  const reportDir = path.dirname(outFile);
  const counts = payload.summary || {};
  const gate = payload.releaseGate || {};
  const verdict = gate.verdict || payload.verdict || "UNKNOWN";
  const steps = payload.steps || [];
  const metadata = payload.metadata || {};
  const visual = payload.visual || {};
  const consoleCapture = payload.consoleCapture || {};
  const cleanup = payload.cleanup || {};
  const perfPages = payload.performancePages || [];
  const score = gate.score ?? "—";
  const scoreBreakdown = gate.scoreBreakdown || {};
  const gateBadge =
    verdict === "GO"
      ? "🟢 GO"
      : verdict === "GO WITH KNOWN ISSUES"
        ? "🟡 GO WITH KNOWN ISSUES"
        : verdict === "NO-GO"
          ? "🔴 NO-GO"
          : esc(verdict);

  const blockingRows = (gate.topBlockingIssues || gate.blockingIssues || [])
    .slice(0, 15)
    .map(
      (item) => `<tr>
        <td class="mono">${esc(item.id)}</td>
        <td><span class="badge" style="background:${item.severity === "Critical" ? "#dc2626" : item.severity === "High" ? "#ea580c" : "#64748b"}">${esc(item.severity)}</span></td>
        <td>${esc(item.description)}</td>
        <td>${esc(item.suggestedFix)}</td>
      </tr>`
    )
    .join("");

  const checklistRows = (gate.checklist || [])
    .map(
      (item) => `<tr>
        <td class="mono" style="font-size:18px">${esc(item.symbol)}</td>
        <td>${esc(item.label)}</td>
        <td>${esc(item.status)}</td>
      </tr>`
    )
    .join("");

  const scoreBars = Object.entries(scoreBreakdown)
    .map(([key, val]) => {
      const max = gate.scoreWeights?.[key] || 20;
      const pct = max ? Math.round((val / max) * 100) : 0;
      return `<div class="score-row"><span>${esc(key)}</span><div class="bar"><div class="fill" style="width:${pct}%"></div></div><span class="mono">${val}/${max}</span></div>`;
    })
    .join("");

  const screenshotCards = (visual.visualResults || []).map((item) => {
    const shotPath = item.screenshotPath
      ? rel(reportDir, item.screenshotPath)
      : item.file
        ? rel(reportDir, path.join(payload.runPaths?.dirs?.screenshots || "", item.file))
        : "";
    const diffPath = item.diffPath ? rel(reportDir, item.diffPath) : "";
    const color = STATUS_COLORS[item.status] || "#374151";
    return `
      <article class="card">
        <header><span class="badge" style="background:${color}">${esc(item.status)}</span> ${esc(item.name || item.file)}</header>
        ${shotPath ? `<a href="${esc(shotPath)}"><img src="${esc(shotPath)}" alt="${esc(item.file)}" loading="lazy"/></a>` : ""}
        ${diffPath ? `<p><a href="${esc(diffPath)}">Diff image</a></p>` : ""}
        <p class="muted">${esc(item.note || "")}</p>
      </article>`;
  });

  const stepRows = steps
    .map((step) => {
      const color = STATUS_COLORS[step.status] || "#374151";
      return `<tr>
        <td><span class="badge" style="background:${color}">${esc(step.status)}</span></td>
        <td>${esc(step.name)}</td>
        <td class="mono">${step.durationMs}ms</td>
        <td>${esc(step.note || "")}${step.retried ? " <em>(retried)</em>" : ""}</td>
      </tr>`;
    })
    .join("");

  const perfRows = perfPages
    .map(
      (p) => `<tr>
        <td>${esc(p.name)}</td>
        <td class="mono">${p.loadTimeMs ?? "—"}ms</td>
        <td class="mono">${p.domReadyMs ?? "—"}</td>
        <td class="mono">${p.fcpMs ?? "—"}</td>
        <td class="mono">${p.lcpMs ?? "—"}</td>
        <td class="mono">${p.networkRequests ?? "—"}</td>
        <td class="mono">${p.jsErrors ?? 0}</td>
        <td class="mono">${p.failedRequests ?? 0}</td>
      </tr>`
    )
    .join("");

  const consoleRows = (consoleCapture.entries || [])
    .slice(0, 200)
    .map(
      (e) => `<tr>
        <td class="mono">${esc(e.ts)}</td>
        <td>${esc(e.kind || e.level)}</td>
        <td>${esc(e.text || e.message || e.error || e.url || "")}</td>
      </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Smoke Report — ${esc(metadata.environment)} — ${esc(verdict)}</title>
  <style>
    :root { font-family: system-ui, -apple-system, Segoe UI, sans-serif; color: #111; background: #f8fafc; }
    body { margin: 0; padding: 24px; max-width: 1200px; margin-inline: auto; }
    h1, h2 { margin: 0 0 12px; }
    .hero { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
    .verdict { font-size: 1.5rem; font-weight: 700; color: ${STATUS_COLORS[verdict] || "#111"}; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin: 16px 0; }
    .stat { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center; }
    .stat strong { display: block; font-size: 1.4rem; }
    .pass strong { color: ${STATUS_COLORS.PASS}; }
    .fail strong { color: ${STATUS_COLORS.FAIL}; }
    .blocked strong { color: ${STATUS_COLORS.BLOCKED}; }
    .verify strong { color: ${STATUS_COLORS.VERIFY_ONLY}; }
    .manual strong { color: ${STATUS_COLORS.MANUAL_REQUIRED}; }
    section { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { border-bottom: 1px solid #e2e8f0; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #f1f5f9; }
    .badge { color: #fff; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .muted { color: #64748b; font-size: 13px; }
    .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
    .card { border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
    .card header { padding: 8px 12px; background: #f8fafc; font-weight: 600; }
    .card img { width: 100%; display: block; background: #0f172a; }
    .card p { padding: 8px 12px; margin: 0; }
    dl { display: grid; grid-template-columns: 160px 1fr; gap: 6px 12px; margin: 0; font-size: 14px; }
    dt { color: #64748b; }
    pre { background: #0f172a; color: #e2e8f0; padding: 12px; border-radius: 8px; overflow: auto; font-size: 12px; }
    .gate-hero { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #f8fafc; border-radius: 12px; padding: 24px; margin-bottom: 20px; }
    .gate-badge { font-size: 2rem; font-weight: 800; margin: 12px 0; }
    .score-row { display: grid; grid-template-columns: 100px 1fr 70px; gap: 12px; align-items: center; margin: 8px 0; font-size: 14px; }
    .bar { background: #e2e8f0; border-radius: 999px; height: 10px; overflow: hidden; }
    .fill { background: #16a34a; height: 100%; border-radius: 999px; }
    .gate-hero .fill { background: #4ade80; }
    .gate-hero .bar { background: #334155; }
  </style>
</head>
<body>
  <div class="gate-hero">
    <h1>Release Gate</h1>
    <div class="gate-badge">${gateBadge}</div>
    <p>Production Readiness Score: <strong style="font-size:1.4rem">${esc(score)}/100</strong></p>
    ${scoreBars || "<p class='muted'>Score breakdown unavailable.</p>"}
    <dl style="margin-top:16px">
      <dt style="color:#94a3b8">Current Commit</dt><dd class="mono">${esc(gate.commit || metadata.gitCommit)}</dd>
      <dt style="color:#94a3b8">Branch</dt><dd class="mono">${esc(gate.branch || metadata.gitBranch)}</dd>
      <dt style="color:#94a3b8">Repository</dt><dd>${esc(gate.repositoryState || "unknown")}</dd>
      <dt style="color:#94a3b8">Environment</dt><dd>${esc(gate.environment || metadata.environment)}</dd>
      <dt style="color:#94a3b8">Execution Time</dt><dd class="mono">${gate.executionTimeMs != null ? `${gate.executionTimeMs}ms` : "—"}</dd>
    </dl>
  </div>

  <section>
    <h2>Top Blocking Issues</h2>
    <table>
      <thead><tr><th>ID</th><th>Severity</th><th>Description</th><th>Suggested Fix</th></tr></thead>
      <tbody>${blockingRows || "<tr><td colspan='4'>No blocking issues</td></tr>"}</tbody>
    </table>
  </section>

  <section>
    <h2>Deployment Checklist</h2>
    <table>
      <thead><tr><th></th><th>Item</th><th>Status</th></tr></thead>
      <tbody>${checklistRows || "<tr><td colspan='3'>Checklist unavailable</td></tr>"}</tbody>
    </table>
    <p class="muted">✓ pass · ✕ fail · ~ partial / blocked / manual / not run</p>
  </section>

  <section>
    <h2>Release Notes Preview</h2>
    <pre>${esc(gate.releaseNotesPreview || "")}</pre>
  </section>

  <div class="hero">
    <h1>Executive Summary</h1>
    <p class="verdict">Smoke Verdict: ${esc(payload.verdict || verdict)}</p>
    <p>Target: <strong>${esc(metadata.baseUrl)}</strong> · Environment: <strong>${esc(metadata.environment)}</strong></p>
    <div class="grid">
      <div class="stat pass"><strong>${counts.PASS || 0}</strong>PASS</div>
      <div class="stat fail"><strong>${counts.FAIL || 0}</strong>FAIL</div>
      <div class="stat blocked"><strong>${counts.BLOCKED || 0}</strong>BLOCKED</div>
      <div class="stat verify"><strong>${counts.VERIFY_ONLY || 0}</strong>VERIFY ONLY</div>
      <div class="stat manual"><strong>${counts.MANUAL_REQUIRED || 0}</strong>MANUAL REQUIRED</div>
    </div>
  </div>

  <section>
    <h2>Run Metadata</h2>
    <dl>
      <dt>Git Commit</dt><dd class="mono">${esc(metadata.gitCommit)}</dd>
      <dt>Branch</dt><dd class="mono">${esc(metadata.gitBranch)}</dd>
      <dt>Environment</dt><dd>${esc(metadata.environment)}</dd>
      <dt>Started At</dt><dd class="mono">${esc(metadata.startedAt)}</dd>
      <dt>Finished At</dt><dd class="mono">${esc(metadata.finishedAt)}</dd>
      <dt>Duration</dt><dd class="mono">${metadata.durationMs != null ? `${metadata.durationMs}ms` : "—"}</dd>
      <dt>Node Version</dt><dd class="mono">${esc(metadata.nodeVersion)}</dd>
      <dt>Platform</dt><dd>${esc(metadata.platform)}</dd>
      <dt>Browser</dt><dd>${esc(metadata.browser)}</dd>
      <dt>Viewport</dt><dd>${esc(metadata.viewport)}</dd>
      <dt>Run ID</dt><dd class="mono">${esc(payload.runId)}</dd>
    </dl>
  </section>

  <section>
    <h2>Steps</h2>
    <table>
      <thead><tr><th>Status</th><th>Step</th><th>Duration</th><th>Notes</th></tr></thead>
      <tbody>${stepRows || "<tr><td colspan='4'>No steps</td></tr>"}</tbody>
    </table>
  </section>

  <section>
    <h2>Performance Metrics</h2>
    <table>
      <thead><tr><th>Page</th><th>Load</th><th>DOM Ready</th><th>FCP</th><th>LCP</th><th>Requests</th><th>JS Errors</th><th>Failed Req</th></tr></thead>
      <tbody>${perfRows || "<tr><td colspan='8'>No browser metrics</td></tr>"}</tbody>
    </table>
  </section>

  <section>
    <h2>Screenshots &amp; Visual Regression</h2>
    <div class="cards">${screenshotCards.join("") || "<p class='muted'>No screenshots captured.</p>"}</div>
  </section>

  <section>
    <h2>Console &amp; Network Capture</h2>
    <p class="muted">Errors: ${consoleCapture.consoleErrors || 0} · Warnings: ${consoleCapture.consoleWarnings || 0} · Network failures: ${consoleCapture.networkFailures || 0} · Unhandled rejections: ${consoleCapture.unhandledRejections || 0}</p>
    <table>
      <thead><tr><th>Time</th><th>Kind</th><th>Message</th></tr></thead>
      <tbody>${consoleRows || "<tr><td colspan='3'>No console events</td></tr>"}</tbody>
    </table>
  </section>

  <section>
    <h2>Cleanup Report</h2>
    <p class="muted">Read-only inventory — smoke does not auto-delete.</p>
    <pre>${esc(JSON.stringify(cleanup, null, 2))}</pre>
  </section>
</body>
</html>`;

  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(outFile, html);
}
