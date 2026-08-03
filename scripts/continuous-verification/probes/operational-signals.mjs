import { RUNBOOK_MAP } from "../config.mjs";

/** Reads ops artifacts — no network. */
export function runOperationalSignals(ctx) {
  const t0 = Date.now();
  const ops = ctx.operationalArtifacts || {};
  const signals = {};
  const issues = [];

  for (const [key, artifact] of Object.entries(ops)) {
    if (key === "commitMatch") continue;
    if (!artifact?.freshness) continue;
    signals[key] = {
      freshness: artifact.freshness.status,
      ageSeconds: artifact.freshness.ageSeconds,
      generatedAt: artifact.freshness.generatedAt,
    };
    if (artifact.freshness.status === "stale") {
      issues.push(`${key} stale (${artifact.freshness.ageSeconds}s)`);
    }
    if (artifact.freshness.status === "missing") {
      issues.push(`${key} missing`);
    }
  }

  if (ops.commitMatch === "mismatch") {
    issues.push("deployment verification commit mismatch");
  }

  const status = issues.some((i) => i.includes("mismatch")) ? "WARN" : issues.length ? "WARN" : "PASS";
  return {
    status,
    latencyMs: Date.now() - t0,
    evidence: { signals, commitMatch: ops.commitMatch, issues },
    priority: issues.length ? "P2" : null,
    note: issues.join("; ") || "operational artifacts fresh",
    suggestedRunbook: issues.length ? RUNBOOK_MAP["operational-signals"] : null,
  };
}
