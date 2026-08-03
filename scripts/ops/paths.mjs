import fs from "node:fs";
import path from "node:path";

const OPS_ROOT = path.resolve(import.meta.dirname);
const REPO_ROOT = path.resolve(OPS_ROOT, "../..");
const E2E_ARTIFACTS = path.join(REPO_ROOT, "scripts/e2e/.artifacts");

export const ARTIFACTS_ROOT = path.join(OPS_ROOT, ".artifacts");

export function createOpsPaths(runId = formatRunId()) {
  const dirs = {
    root: ARTIFACTS_ROOT,
    json: path.join(ARTIFACTS_ROOT, "json", runId),
    dashboards: path.join(ARTIFACTS_ROOT, "dashboards", runId),
    incidents: path.join(ARTIFACTS_ROOT, "incidents", runId),
    reports: path.join(ARTIFACTS_ROOT, "reports", runId),
  };

  for (const dir of Object.values(dirs)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return {
    runId,
    opsRoot: OPS_ROOT,
    repoRoot: REPO_ROOT,
    e2eArtifacts: E2E_ARTIFACTS,
    dirs,
    files: {
      platformJson: path.join(dirs.json, "ops-platform.json"),
      platformLatest: path.join(ARTIFACTS_ROOT, "ops-platform.json"),
      sloJson: path.join(dirs.json, "slo-report.json"),
      errorBudgetJson: path.join(dirs.json, "error-budget.json"),
      dependencyJson: path.join(dirs.json, "dependency-graph.json"),
      incidentJson: path.join(dirs.json, "incident-report.json"),
      alertsJson: path.join(dirs.json, "alert-rules-status.json"),
      deploymentJson: path.join(dirs.json, "deployment-verification.json"),
      monitoringHtml: path.join(dirs.dashboards, "monitoring-dashboard.html"),
      healthHtml: path.join(dirs.dashboards, "health-dashboard.html"),
      executiveHtml: path.join(dirs.dashboards, "executive-dashboard.html"),
      productionHtml: path.join(dirs.dashboards, "production-readiness-dashboard.html"),
      indexHtml: path.join(dirs.dashboards, "index.html"),
      monitoringLatest: path.join(ARTIFACTS_ROOT, "monitoring-dashboard.html"),
      healthLatest: path.join(ARTIFACTS_ROOT, "health-dashboard.html"),
      executiveLatest: path.join(ARTIFACTS_ROOT, "executive-dashboard.html"),
      productionLatest: path.join(ARTIFACTS_ROOT, "production-readiness-dashboard.html"),
      indexLatest: path.join(ARTIFACTS_ROOT, "index.html"),
    },
  };
}

export function formatRunId(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

export function findLatestE2eRun() {
  const jsonRoot = path.join(E2E_ARTIFACTS, "json");
  if (!fs.existsSync(jsonRoot)) return null;
  const runs = fs
    .readdirSync(jsonRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .reverse();
  for (const runId of runs) {
    const smoke = path.join(jsonRoot, runId, "smoke.json");
    if (fs.existsSync(smoke)) return { runId, smokePath: smoke };
  }
  return null;
}
