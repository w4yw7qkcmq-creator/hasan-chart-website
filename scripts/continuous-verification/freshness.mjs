import fs from "node:fs";
import { FRESHNESS_RULES } from "./config.mjs";

/**
 * @param {string|null} generatedAt ISO timestamp
 * @param {number} maxAgeSec
 */
export function assessFreshness(generatedAt, maxAgeSec) {
  if (!generatedAt) return { status: "missing", ageSeconds: null, generatedAt: null };
  const ageSeconds = Math.floor((Date.now() - new Date(generatedAt).getTime()) / 1000);
  if (ageSeconds < 0) return { status: "fresh", ageSeconds: 0, generatedAt };
  if (ageSeconds <= maxAgeSec) return { status: "fresh", ageSeconds, generatedAt };
  return { status: "stale", ageSeconds, generatedAt };
}

export function readArtifactFreshness(filePath, maxAgeSec) {
  if (!fs.existsSync(filePath)) {
    return { path: filePath, freshness: { status: "missing", ageSeconds: null, generatedAt: null } };
  }
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const generatedAt = data.generatedAt || data.metadata?.finishedAt || data.finishedAt || null;
    return { path: filePath, data, freshness: assessFreshness(generatedAt, maxAgeSec) };
  } catch {
    return { path: filePath, freshness: { status: "missing", ageSeconds: null, generatedAt: null }, parseError: true };
  }
}

export function loadOperationalArtifacts(opsRoot, expectedCommit = "") {
  const files = {
    releaseGate: `${opsRoot}/release-gate.json`,
    incidentReport: findLatestJson(opsRoot, "incident-report.json"),
    errorBudget: findLatestJson(opsRoot, "error-budget.json"),
    alertRules: findLatestJson(opsRoot, "alert-rules-status.json"),
    deploymentVerification: findLatestJson(opsRoot, "deployment-verification.json"),
  };

  return {
    releaseGate: readArtifactFreshness(files.releaseGate, FRESHNESS_RULES.releaseGateMaxAgeSec),
    incidentReport: readArtifactFreshness(files.incidentReport, FRESHNESS_RULES.incidentReportMaxAgeSec),
    errorBudget: readArtifactFreshness(files.errorBudget, FRESHNESS_RULES.errorBudgetMaxAgeSec),
    alertRules: readArtifactFreshness(files.alertRules, FRESHNESS_RULES.errorBudgetMaxAgeSec),
    deploymentVerification: readArtifactFreshness(
      files.deploymentVerification,
      FRESHNESS_RULES.deploymentVerificationMaxAgeSec
    ),
    commitMatch:
      expectedCommit && files.releaseGate
        ? checkCommitMatch(files.releaseGate, expectedCommit)
        : "unknown",
  };
}

function findLatestJson(opsRoot, filename) {
  const direct = `${opsRoot}/${filename}`;
  if (fs.existsSync(direct)) return direct;
  const jsonRoot = `${opsRoot}/json`;
  if (!fs.existsSync(jsonRoot)) return direct;
  const runs = fs.readdirSync(jsonRoot).sort().reverse();
  for (const run of runs) {
    const p = `${jsonRoot}/${run}/${filename}`;
    if (fs.existsSync(p)) return p;
  }
  return direct;
}

function checkCommitMatch(artifact, expectedCommit) {
  if (!artifact.data?.commit) return "unknown";
  return artifact.data.commit.startsWith(expectedCommit.slice(0, 7)) ? "match" : "mismatch";
}
