import { RUNBOOK_MAP } from "../config.mjs";

/** Reads local release-gate.json — no network. */
export function runReleaseGate(ctx) {
  const t0 = Date.now();
  const artifact = ctx.operationalArtifacts?.releaseGate;

  if (!artifact || artifact.freshness.status === "missing") {
    return {
      status: "UNKNOWN",
      latencyMs: Date.now() - t0,
      evidence: { verdict: "UNKNOWN", reason: "release-gate.json missing" },
      priority: null,
      note: "UNKNOWN — not FAIL",
    };
  }

  const verdict = artifact.data?.verdict || "UNKNOWN";
  const freshness = artifact.freshness;

  if (freshness.status === "stale") {
    return {
      status: "WARN",
      latencyMs: Date.now() - t0,
      evidence: { verdict, freshness },
      priority: "P2",
      note: `stale release-gate age=${freshness.ageSeconds}s`,
      suggestedRunbook: RUNBOOK_MAP["release-gate"],
    };
  }

  if (verdict === "NO-GO") {
    return {
      status: "FAIL",
      latencyMs: Date.now() - t0,
      evidence: { verdict, score: artifact.data?.score },
      priority: "P1",
      note: "release gate NO-GO",
      suggestedRunbook: RUNBOOK_MAP["release-gate"],
      noRetry: true,
    };
  }

  return {
    status: verdict === "GO" || verdict === "GO WITH KNOWN ISSUES" ? "PASS" : "UNKNOWN",
    latencyMs: Date.now() - t0,
    evidence: { verdict, freshness },
    priority: null,
  };
}
