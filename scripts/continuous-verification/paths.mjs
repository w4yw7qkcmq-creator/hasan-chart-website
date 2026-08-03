import fs from "node:fs";
import path from "node:path";

const CV_ROOT = path.resolve(import.meta.dirname);
const REPO_ROOT = path.resolve(CV_ROOT, "../..");
const OPS_ARTIFACTS = path.join(REPO_ROOT, "scripts/ops/.artifacts");
const E2E_ARTIFACTS = path.join(REPO_ROOT, "scripts/e2e/.artifacts");

export const ARTIFACTS_ROOT = path.join(CV_ROOT, ".artifacts");

export function createCvPaths(runId = formatRunId()) {
  const dirs = {
    root: ARTIFACTS_ROOT,
    json: path.join(ARTIFACTS_ROOT, "json", runId),
    reports: path.join(ARTIFACTS_ROOT, "reports", runId),
    logs: path.join(ARTIFACTS_ROOT, "logs", runId),
    timelines: path.join(ARTIFACTS_ROOT, "timelines", runId),
    incidents: path.join(ARTIFACTS_ROOT, "incidents", runId),
  };
  for (const d of Object.values(dirs)) fs.mkdirSync(d, { recursive: true });

  return {
    runId,
    dirs,
    files: {
      reportJson: path.join(dirs.json, "continuous-verification.json"),
      reportLatest: path.join(ARTIFACTS_ROOT, "continuous-verification.json"),
      reportHtml: path.join(dirs.reports, "continuous-verification-report.html"),
      reportHtmlLatest: path.join(ARTIFACTS_ROOT, "continuous-verification-report.html"),
      timelineJson: path.join(dirs.timelines, "timeline.json"),
      timelineLatest: path.join(ARTIFACTS_ROOT, "timeline.json"),
      incidentsDir: dirs.incidents,
      logFile: path.join(dirs.logs, "cv.log"),
    },
    opsArtifacts: OPS_ARTIFACTS,
    e2eArtifacts: E2E_ARTIFACTS,
  };
}

export function formatRunId(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

export function findLatestCvRun() {
  const jsonRoot = path.join(ARTIFACTS_ROOT, "json");
  if (!fs.existsSync(jsonRoot)) return null;
  const runs = fs.readdirSync(jsonRoot).filter((n) => fs.existsSync(path.join(jsonRoot, n, "continuous-verification.json"))).sort().reverse();
  if (!runs.length) return null;
  const runId = runs[0];
  return { runId, path: path.join(jsonRoot, runId, "continuous-verification.json") };
}
