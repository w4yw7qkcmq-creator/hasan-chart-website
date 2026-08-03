import fs from "node:fs";
import path from "node:path";

const E2E_ROOT = path.resolve(import.meta.dirname);
const REPO_ROOT = path.resolve(E2E_ROOT, "../..");

export const BASELINE_DIR = path.join(E2E_ROOT, ".baseline");
export const ARTIFACTS_ROOT = path.join(E2E_ROOT, ".artifacts");

/** @param {string} [runId] */
export function createRunPaths(runId = formatRunId()) {
  const dirs = {
    artifactsRoot: ARTIFACTS_ROOT,
    baseline: BASELINE_DIR,
    screenshots: path.join(ARTIFACTS_ROOT, "screenshots", runId),
    reports: path.join(ARTIFACTS_ROOT, "reports", runId),
    logs: path.join(ARTIFACTS_ROOT, "logs", runId),
    json: path.join(ARTIFACTS_ROOT, "json", runId),
  };

  for (const dir of [dirs.screenshots, dirs.reports, dirs.logs, dirs.json, BASELINE_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return {
    runId,
    repoRoot: REPO_ROOT,
    e2eRoot: E2E_ROOT,
    dirs,
    files: {
      smokeJson: path.join(dirs.json, "smoke.json"),
      cleanupJson: path.join(dirs.json, "cleanup-report.json"),
      releaseGateJson: path.join(dirs.json, "release-gate.json"),
      releaseGateLatest: path.join(ARTIFACTS_ROOT, "release-gate.json"),
      consoleLog: path.join(dirs.logs, "console.jsonl"),
      networkLog: path.join(dirs.logs, "network.jsonl"),
      htmlReport: path.join(dirs.reports, "smoke-report.html"),
      htmlReportLatest: path.join(ARTIFACTS_ROOT, "smoke-report.html"),
    },
  };
}

export function formatRunId(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

export function screenshotPath(runDirs, filename) {
  return path.join(runDirs.screenshots, filename);
}

export function baselinePath(filename) {
  return path.join(BASELINE_DIR, filename);
}
