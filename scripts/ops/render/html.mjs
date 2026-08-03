function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const CSS = `
  :root { font-family: system-ui,sans-serif; background:#0f172a; color:#e2e8f0; }
  body { margin:0; padding:24px; max-width:1280px; margin-inline:auto; }
  a { color:#38bdf8; }
  h1,h2,h3 { margin:0 0 12px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:16px; }
  .card { background:#1e293b; border:1px solid #334155; border-radius:12px; padding:16px; }
  .badge { display:inline-block; padding:4px 10px; border-radius:999px; font-size:12px; font-weight:700; }
  .ok { background:#166534; } .warn { background:#a16207; } .bad { background:#991b1b; } .muted { background:#475569; }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  th,td { border-bottom:1px solid #334155; padding:8px; text-align:left; }
  th { color:#94a3b8; }
  pre { background:#020617; padding:12px; border-radius:8px; overflow:auto; font-size:12px; }
  nav { margin-bottom:24px; display:flex; flex-wrap:wrap; gap:12px; }
  nav a { background:#1e293b; padding:8px 14px; border-radius:8px; text-decoration:none; }
  .hero { background:linear-gradient(135deg,#1e3a5f,#0f172a); padding:24px; border-radius:12px; margin-bottom:24px; }
  .score { font-size:2.5rem; font-weight:800; }
`;

function layout(title, nav, body) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${esc(title)}</title><style>${CSS}</style></head><body><nav>${nav}</nav>${body}</body></html>`;
}

function navLinks(base) {
  const pages = [
    ["index.html", "Home"],
    ["monitoring-dashboard.html", "Monitoring"],
    ["health-dashboard.html", "Health"],
    ["production-readiness-dashboard.html", "Production"],
    ["executive-dashboard.html", "Executive"],
  ];
  return pages.map(([f, l]) => `<a href="${esc(f)}">${esc(l)}</a>`).join("");
}

function statusBadge(status) {
  const s = String(status || "").toLowerCase();
  const cls = s.includes("healthy") || s.includes("met") || s.includes("pass") || s === "go" || s === "ok" ? "ok" : s.includes("degrad") || s.includes("partial") || s.includes("warn") ? "warn" : s.includes("fail") || s.includes("breach") || s.includes("no-go") || s.includes("critical") ? "bad" : "muted";
  return `<span class="badge ${cls}">${esc(status)}</span>`;
}

export function renderAllDashboards(platform, files) {
  const nav = navLinks("");
  const exec = platform.executiveDashboard;
  const prod = platform.productionReadinessDashboard;

  const index = layout(
    "Enterprise Operations",
    nav,
    `<div class="hero"><h1>Enterprise Operations Platform</h1><p>Version ${esc(platform.version)} · ${esc(platform.generatedAt)}</p><p>${esc(platform.note)}</p><p>QA data: ${platform.qaSource ? esc(platform.qaSource.runId) : "none — run smoke first"}</p></div>
    <div class="grid">
      <div class="card"><h3>Release Verdict</h3><div class="score">${statusBadge(exec.verdict)}</div></div>
      <div class="card"><h3>Readiness Score</h3><div class="score">${esc(exec.readinessScore)}/100</div></div>
      <div class="card"><h3>SLO</h3>${statusBadge(platform.sloVerification.overallStatus)}</div>
      <div class="card"><h3>Error Budget</h3>${statusBadge(platform.errorBudget.status)}</div>
      <div class="card"><h3>Incidents</h3><div class="score">${esc(exec.openIncidents)}</div></div>
      <div class="card"><h3>Deploy Ready</h3>${statusBadge(exec.deployReady ? "yes" : "no")}</div>
    </div>
    <section class="card" style="margin-top:24px"><h2>Quick Links</h2><ul>
      <li><a href="monitoring-dashboard.html">Monitoring Dashboard</a></li>
      <li><a href="health-dashboard.html">Health + Dependency Graph</a></li>
      <li><a href="production-readiness-dashboard.html">Production Readiness</a></li>
      <li><a href="executive-dashboard.html">Executive Dashboard</a></li>
    </ul></section>`
  );

  const monitoring = layout(
    "Monitoring Dashboard",
    nav,
    `<h1>Monitoring Dashboard</h1>
    <div class="grid">
      <div class="card"><h3>Overall</h3>${statusBadge(platform.monitoringDashboard.status)}</div>
      <div class="card"><h3>Alerts Fired</h3><div class="score">${esc(platform.monitoringDashboard.alertsFired)}</div></div>
      <div class="card"><h3>Latency Pages</h3><div class="score">${esc(platform.latencyMonitoring.pages.length)}</div></div>
      <div class="card"><h3>SSE</h3>${statusBadge(platform.sseMonitoring.status)}</div>
    </div>
    <section class="card" style="margin-top:16px"><h2>Latency</h2>${table(platform.latencyMonitoring.pages, ["name", "loadTimeMs", "lcpMs", "status"])}</section>
    <section class="card" style="margin-top:16px"><h2>Alert Rules</h2>${table(platform.alertRules.rules, ["id", "severity", "condition", "fired"])}</section>
    <section class="card" style="margin-top:16px"><h2>Component Monitors</h2>
      ${componentRow("Worker", platform.workerMonitoring)}
      ${componentRow("Queue", platform.queueMonitoring)}
      ${componentRow("OpenAI", platform.openaiMonitoring)}
      ${componentRow("Supabase", platform.supabaseMonitoring)}
      ${componentRow("Railway", platform.railwayMonitoring)}
      ${componentRow("Database", platform.databaseHealth)}
      ${componentRow("Storage", platform.storageHealth)}
      ${componentRow("Memory", platform.memoryMonitoring)}
      ${componentRow("CPU", platform.cpuMonitoring)}
    </section>`
  );

  const health = layout(
    "Health Dashboard",
    nav,
    `<h1>Health Dashboard</h1>
    <div class="grid">${Object.entries(platform.serviceHealthSummary).map(([k,v]) => `<div class="card"><h3>${esc(k)}</h3><div class="score">${esc(v)}</div></div>`).join("")}</div>
    <section class="card" style="margin-top:16px"><h2>Services</h2>${table(platform.healthDashboard.services, ["name", "tier", "health", "health"])}</section>
    <section class="card" style="margin-top:16px"><h2>Dependency Graph</h2><pre>${esc(platform.dependencyGraph.mermaid)}</pre></section>
    <section class="card" style="margin-top:16px"><h2>SLO Checks</h2>${table(platform.sloVerification.checks, ["name", "target", "actual", "status"])}</section>
    <section class="card" style="margin-top:16px"><h2>Error Budget</h2><pre>${esc(JSON.stringify(platform.errorBudget, null, 2))}</pre></section>`
  );

  const production = layout(
    "Production Readiness",
    nav,
    `<h1>Production Readiness Dashboard</h1>
    <div class="hero"><h2>${statusBadge(prod.releaseGateVerdict)}</h2><p>Score: ${esc(prod.releaseGateScore)}/100 · SLO: ${statusBadge(prod.sloStatus)} · Deploy: ${statusBadge(prod.deploymentReady ? "ready" : "blocked")}</p></div>
    <section class="card"><h2>Deployment Verification</h2>${table(Object.entries(prod.deploymentChecks).map(([k,v]) => ({ check: k, status: v.status, detail: v.detail })), ["check", "status", "detail"])}</section>
    <section class="card" style="margin-top:16px"><h2>Canary Release</h2><pre>${esc(JSON.stringify(platform.canaryRelease, null, 2))}</pre></section>
    <section class="card" style="margin-top:16px"><h2>Blue/Green</h2><pre>${esc(JSON.stringify(platform.blueGreenReadiness, null, 2))}</pre></section>
    <section class="card" style="margin-top:16px"><h2>Rollback</h2><pre>${esc(JSON.stringify(platform.rollbackVerification, null, 2))}</pre></section>
    <section class="card" style="margin-top:16px"><h2>Migration</h2><pre>${esc(JSON.stringify(platform.migrationVerification, null, 2))}</pre></section>
    <section class="card" style="margin-top:16px"><h2>Feature Flags</h2>${table(platform.featureFlagValidation, ["id", "env", "validation"])}</section>`
  );

  const executive = layout(
    "Executive Dashboard",
    nav,
    `<div class="hero"><h1>Executive Dashboard</h1><h2>${statusBadge(exec.verdict)}</h2><p class="score">${esc(exec.readinessScore)}/100</p><p>${esc(exec.recommendation)}</p></div>
    <div class="grid">
      <div class="card"><h3>SLO Met</h3><div class="score">${esc(exec.sloMet)}</div></div>
      <div class="card"><h3>SLO Breached</h3><div class="score">${esc(exec.sloBreached)}</div></div>
      <div class="card"><h3>Error Budget Left</h3><div class="score">${esc(exec.errorBudgetRemainingMin)}m</div></div>
      <div class="card"><h3>Incidents</h3><div class="score">${esc(exec.openIncidents)}</div></div>
    </div>
    <section class="card" style="margin-top:16px"><h2>Incident Timeline</h2>${table(platform.incidentTimeline, ["ts", "type", "message"])}</section>
    <section class="card" style="margin-top:16px"><h2>Auto Incidents</h2>${table(platform.incidentReport.incidents, ["id", "severity", "title", "status"])}</section>
    <section class="card" style="margin-top:16px"><h2>Root Cause Templates</h2>${table(platform.rootCauseTemplates, ["id", "template"])}</section>`
  );

  return [
    [files.indexHtml, index],
    [files.monitoringHtml, monitoring],
    [files.healthHtml, health],
    [files.productionHtml, production],
    [files.executiveHtml, executive],
  ];
}

function table(rows, cols) {
  if (!rows?.length) return "<p>No data</p>";
  const head = cols.map((c) => `<th>${esc(c)}</th>`).join("");
  const body = rows
    .map((r) => `<tr>${cols.map((c) => `<td>${esc(typeof r[c] === "object" ? JSON.stringify(r[c]) : r[c])}</td>`).join("")}</tr>`)
    .join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function componentRow(label, data) {
  return `<p><strong>${esc(label)}</strong>: ${statusBadge(data.status || data.overall || data.title)} <span style="color:#94a3b8">${esc(data.note || "")}</span></p>`;
}
