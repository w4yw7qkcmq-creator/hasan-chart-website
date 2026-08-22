import { LATENCY_BASELINES } from "./config.mjs";
import { openIncidents, worstSeverity } from "./incidents.mjs";

export function assessLatency(probeId, latencyMs) {
  const baseline = LATENCY_BASELINES[probeId];
  if (!baseline || latencyMs == null) return { level: "ok", priority: null };
  if (latencyMs >= baseline.criticalMs) return { level: "critical", priority: "P1" };
  if (latencyMs >= baseline.warnMs) return { level: "warning", priority: "P2" };
  return { level: "ok", priority: null };
}

export function deriveFinalVerdict({ checkpoints, incidents, completedCheckpointIds, expectedCheckpointIds }) {
  const open = openIncidents(incidents);
  const sev = worstSeverity(incidents);

  if (!completedCheckpointIds.length && !checkpoints.length) return "INCOMPLETE";
  if (expectedCheckpointIds.length && completedCheckpointIds.length < expectedCheckpointIds.length) {
    const anyFail = checkpoints.some((c) => c.verdict === "UNHEALTHY" || c.verdict === "DEGRADED");
    if (!anyFail && open.length === 0) return "INCOMPLETE";
  }

  if (sev === "P0" || open.some((i) => i.severity === "P0")) return "UNHEALTHY";
  if (sev === "P1" || open.filter((i) => i.severity === "P1").length >= 2) return "UNHEALTHY";
  if (open.length > 0 || sev === "P1") return "DEGRADED";
  if (checkpoints.some((c) => c.verdict === "DEGRADED")) return "DEGRADED";
  if (checkpoints.every((c) => c.verdict === "HEALTHY" || c.verdict === "UNKNOWN")) return "HEALTHY";
  return "INCOMPLETE";
}

export function deriveCheckpointVerdict(probeResults) {
  const fails = probeResults.filter((r) => r.status === "FAIL");
  const warns = probeResults.filter((r) => r.status === "WARN" || r.latencyPriority === "P2");
  const p0 = fails.some((r) => r.priority === "P0" || r.probe === "web-health" || r.probe === "auth-gate");
  const p1 = fails.some((r) => r.priority === "P1" || ["order-book", "news", "workers", "release-gate"].includes(r.probe));

  if (p0) return "UNHEALTHY";
  if (p1 || fails.length >= 2) return "UNHEALTHY";
  if (fails.length === 1 || warns.length > 0) return "DEGRADED";
  return "HEALTHY";
}

export function sanitizeForReport(obj) {
  const str = JSON.stringify(obj);
  return JSON.parse(str.replace(/(password|token|secret|apikey|api_key)=[^&"]+/gi, "$1=***"));
}

export function maskSecrets(text) {
  return String(text).replace(/(password|token|secret|apikey|api_key)=[^&\s"]+/gi, "$1=***");
}
