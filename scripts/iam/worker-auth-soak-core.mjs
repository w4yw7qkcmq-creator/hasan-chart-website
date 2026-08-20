/**
 * Worker auth soak monitoring — pure logic (read-only, testable).
 */
export const SCHEMA_VERSION = "1.0";

export const CHECKPOINT_OFFSETS_SEC = Object.freeze({
  t1h: 3600,
  t6h: 21600,
  t24h: 86400,
  t48h: 172800,
  t72h: 259200,
});

export const CHECKPOINT_ORDER = ["t1h", "t6h", "t24h", "t48h", "t72h"];

export const METRIC_KEYS = [
  "machine",
  "legacy",
  "denied",
  "originRejected",
  "machineHeaderRejected",
  "humanSessionRejected",
];

export function parseArgs(argv = process.argv.slice(2)) {
  const out = { once: false, evaluate: false, json: false, checkpoint: "manual" };
  for (const arg of argv) {
    if (arg === "--once") out.once = true;
    if (arg === "--evaluate") out.evaluate = true;
    if (arg === "--json") out.json = true;
    const cp = arg.match(/^--checkpoint=(t1h|t6h|t24h|t48h|t72h|manual)$/);
    if (cp) out.checkpoint = cp[1];
  }
  if (out.evaluate) out.checkpoint = null;
  if (out.once && out.checkpoint === "manual" && !out.evaluate) out.checkpoint = "manual";
  return out;
}

export function verifyBaseline(baseline) {
  if (!baseline || typeof baseline !== "object") {
    return { ok: false, error: "baseline_missing_or_invalid" };
  }
  if (baseline.authModeConfirmed !== true) {
    return { ok: false, error: "authModeConfirmed_not_true" };
  }
  if (baseline.e2eVerdict !== "OWNER_WEB_E2E_VALIDATED") {
    return { ok: false, error: "e2eVerdict_invalid" };
  }
  const e2eDelta = baseline.metricsDeltaFromE2e || {};
  if (Number(e2eDelta.machine || 0) <= 0) {
    return { ok: false, error: "e2e_machine_delta_not_positive" };
  }
  if (Number(e2eDelta.legacy || 0) !== 0) {
    return { ok: false, error: "e2e_legacy_delta_not_zero" };
  }
  const startedAt = baseline.startedAt || baseline.baselineAt;
  if (!startedAt) return { ok: false, error: "baseline_timestamp_missing" };
  if (baseline.metrics?.machine == null) return { ok: false, error: "baseline_metrics_missing" };
  return { ok: true, baselineAt: startedAt };
}

export function buildKnownCanaryBaseline(baseline) {
  const metrics = baseline.metrics || {};
  return {
    legacy: Number(metrics.legacy || 0),
    denied: Number(metrics.denied || 0),
    originRejected: Number(metrics.originRejected || 0),
    machineHeaderRejected: Number(metrics.machineHeaderRejected || 0),
    humanSessionRejected: Number(metrics.humanSessionRejected || 0),
    note: "Pre-soak canary and E2E probe counters — measure increases after baseline only",
  };
}

export function checkpointDueAt(baselineAt, checkpoint) {
  const offset = CHECKPOINT_OFFSETS_SEC[checkpoint];
  if (!offset) return null;
  return new Date(new Date(baselineAt).getTime() + offset * 1000).toISOString();
}

export function isCheckpointDue(baselineAt, checkpoint, now = new Date()) {
  const due = checkpointDueAt(baselineAt, checkpoint);
  if (!due) return false;
  return now.getTime() >= new Date(due).getTime();
}

export function dueCheckpoints(baselineAt, now = new Date(), captured = {}) {
  return CHECKPOINT_ORDER.filter(
    (cp) => isCheckpointDue(baselineAt, cp, now) && !captured[cp]?.capturedAt
  );
}

export function scanForSecrets(obj) {
  const blob = JSON.stringify(obj);
  const hits = [];
  if (/eyJ[A-Za-z0-9_-]{20,}/.test(blob)) hits.push("jwt_like");
  if (/Bearer\s+[A-Za-z0-9._-]{10,}/.test(blob)) hits.push("bearer");
  if (/secret_hash/i.test(blob)) hits.push("secret_hash");
  if (/hc_access_token/i.test(blob)) hits.push("cookie_token");
  return hits;
}

export function extractProductionState(webJson = {}, workerJson = {}) {
  const auth = workerJson.workerHttpAuth || {};
  const db = webJson.database || webJson.db || {};
  return {
    webReady: webJson.status === "ok" && webJson.readiness === "ready",
    workerReady: workerJson.success === true,
    deployedCommit: normalizeCommit(webJson.build?.commit),
    databaseStatus: db.status || webJson.databaseStatus || "unknown",
    databaseLatencyMs: Number(db.latencyMs ?? webJson.databaseLatencyMs ?? 0) || 0,
    workerUptimeSeconds: Number(workerJson.uptimeSeconds ?? workerJson.uptime ?? 0) || null,
    machineAuthConfigured: auth.machineAuthConfigured === true,
    legacyFallbackEnabled: auth.legacyFallbackEnabled === true,
    priceAlertsWorker: workerJson.alertsWorker !== false,
    checkIntervalMs: Number(workerJson.checkIntervalMs || 0),
    rawMetrics: Object.fromEntries(METRIC_KEYS.map((k) => [k, Number(auth[k] || 0)])),
  };
}

export function normalizeCommit(commit = "") {
  return String(commit || "").trim().slice(0, 7);
}

export function detectRestart(prev = {}, current = {}) {
  const reasons = [];
  const prevUptime = prev.workerUptimeSeconds;
  const curUptime = current.workerUptimeSeconds;
  if (prevUptime != null && curUptime != null && curUptime + 30 < prevUptime) {
    reasons.push("uptime_decreased");
  }
  for (const key of METRIC_KEYS) {
    const p = Number(prev.rawMetrics?.[key] ?? prev.lastRawMetrics?.[key] ?? -1);
    const c = Number(current.rawMetrics?.[key] ?? 0);
    if (p >= 0 && c < p) reasons.push(`counter_reset_${key}`);
  }
  const prevCommit = normalizeCommit(prev.deployedCommit);
  const curCommit = normalizeCommit(current.deployedCommit);
  if (prevCommit && curCommit && prevCommit !== curCommit) {
    reasons.push("deploy_commit_changed");
  }
  return { restartDetected: reasons.length > 0, reasons };
}

export function updateCumulativeMetrics(registry, rawMetrics, restartDetected) {
  const baselineMetrics = registry.baselineMetrics || {};
  const lastRaw = registry.lastRawMetrics || { ...baselineMetrics };
  const cumulative = { ...(registry.cumulativeDeltasFromBaseline || zeroMetrics()) };

  if (restartDetected) {
    registry.segments = registry.segments || [];
    registry.segments.push({
      startedAt: new Date().toISOString(),
      restartDetected: true,
      floorMetrics: { ...rawMetrics },
    });
    registry.lastRawMetrics = { ...rawMetrics };
    return { cumulative, segmentRestart: true };
  }

  for (const key of METRIC_KEYS) {
    const prev = Number(lastRaw[key] || 0);
    const cur = Number(rawMetrics[key] || 0);
    if (cur >= prev) cumulative[key] += cur - prev;
  }
  registry.lastRawMetrics = { ...rawMetrics };
  registry.cumulativeDeltasFromBaseline = { ...cumulative };
  return { cumulative, segmentRestart: false };
}

function zeroMetrics() {
  return Object.fromEntries(METRIC_KEYS.map((k) => [k, 0]));
}

export function detectRestartLoop(restartEvents = [], now = new Date(), windowMs = 3600000) {
  const recent = restartEvents.filter(
    (e) => now.getTime() - new Date(e.at).getTime() <= windowMs
  );
  const unexplained = recent.filter((e) => !e.knownDeploy);
  return unexplained.length > 2;
}

export function evaluateCheckpointVerdict(ctx) {
  const issues = [];
  const {
    production,
    cumulativeDeltas,
    restartDetected,
    restartLoop,
    restartKnownDeploy,
    manualKnownLegacyProbe,
    databaseLatencyWarnMs = 500,
  } = ctx;

  if (!production.webReady) issues.push({ code: "web_not_ready", severity: "FAIL" });
  if (!production.workerReady) issues.push({ code: "worker_not_ready", severity: "FAIL" });
  if (!production.machineAuthConfigured) {
    issues.push({ code: "machine_auth_not_configured", severity: "FAIL" });
  }
  if (!production.legacyFallbackEnabled) {
    issues.push({ code: "legacy_fallback_disabled", severity: "FAIL" });
  }
  if (!production.priceAlertsWorker) {
    issues.push({ code: "price_alerts_worker_false", severity: "FAIL" });
  }
  if (production.checkIntervalMs && production.checkIntervalMs !== 30000) {
    issues.push({ code: "check_interval_unexpected", severity: "WARN" });
  }
  if (production.databaseLatencyMs > databaseLatencyWarnMs) {
    issues.push({ code: "database_latency_high", severity: "WARN" });
  }

  if (restartLoop) issues.push({ code: "restart_loop", severity: "FAIL" });
  else if (restartDetected && restartKnownDeploy) {
    issues.push({ code: "known_restart", severity: "WARN" });
  } else if (restartDetected) {
    issues.push({ code: "worker_restart", severity: "WARN" });
  }

  const d = cumulativeDeltas || zeroMetrics();
  if (d.machineHeaderRejected > 0) {
    issues.push({ code: "machine_header_rejected_increased", severity: "FAIL" });
  }
  if (d.legacy > 1) {
    issues.push({ code: "legacy_traffic_repeated", severity: "FAIL" });
  } else if (d.legacy === 1 && !manualKnownLegacyProbe) {
    issues.push({ code: "legacy_traffic_undocumented", severity: "WARN" });
  } else if (d.legacy === 1 && manualKnownLegacyProbe) {
    issues.push({ code: "legacy_known_probe", severity: "WARN" });
  }
  if (d.machine === 0) {
    issues.push({ code: "no_machine_traffic_since_baseline", severity: "WARN" });
  }

  const hasFail = issues.some((i) => i.severity === "FAIL");
  const hasWarn = issues.some((i) => i.severity === "WARN");
  const verdict = hasFail ? "FAIL" : hasWarn ? "WARN" : "PASS";
  return { verdict, issues };
}

export function buildSnapshot({
  checkpoint,
  capturedAt,
  baselineAt,
  production,
  cumulativeDeltas,
  priceAlerts,
  issues,
  verdict,
}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    checkpoint,
    capturedAt,
    baselineAt,
    elapsedSeconds: Math.floor((new Date(capturedAt).getTime() - new Date(baselineAt).getTime()) / 1000),
    production: {
      webReady: production.webReady,
      workerReady: production.workerReady,
      deployedCommit: production.deployedCommit,
      databaseStatus: production.databaseStatus,
      databaseLatencyMs: production.databaseLatencyMs,
    },
    workerAuth: {
      machineAuthConfigured: production.machineAuthConfigured,
      legacyFallbackEnabled: production.legacyFallbackEnabled,
      machineTotal: production.rawMetrics.machine,
      legacyTotal: production.rawMetrics.legacy,
      deniedTotal: production.rawMetrics.denied,
      originRejectedTotal: production.rawMetrics.originRejected,
      machineHeaderRejectedTotal: production.rawMetrics.machineHeaderRejected,
      humanSessionRejectedTotal: production.rawMetrics.humanSessionRejected,
    },
    deltasFromBaseline: { ...cumulativeDeltas },
    priceAlerts: {
      workerActive: priceAlerts.workerActive,
      checkIntervalMs: priceAlerts.checkIntervalMs,
      restartDetected: priceAlerts.restartDetected,
    },
    issues: issues.map((i) => ({ code: i.code, severity: i.severity })),
    verdict,
  };
}

export function initRegistry(baseline) {
  const verified = verifyBaseline(baseline);
  if (!verified.ok) throw new Error(verified.error);
  const baselineAt = verified.baselineAt;
  const checkpoints = {};
  for (const cp of CHECKPOINT_ORDER) {
    checkpoints[cp] = {
      dueAt: checkpointDueAt(baselineAt, cp),
      capturedAt: null,
      verdict: null,
      artifact: null,
      late: false,
      notes: [],
    };
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    baselineAt,
    deployedCommitAtBaseline: normalizeCommit(baseline.deployedCommit),
    knownCanaryBaseline: buildKnownCanaryBaseline(baseline),
    baselineMetrics: { ...baseline.metrics },
    checkpoints,
    segments: [{ startedAt: baselineAt, restartDetected: false, floorMetrics: { ...baseline.metrics } }],
    restartEvents: [],
    cumulativeDeltasFromBaseline: zeroMetrics(),
    lastRawMetrics: { ...baseline.metrics },
    lastWorkerUptimeSeconds: null,
    lastDeployedCommit: normalizeCommit(baseline.deployedCommit),
    snapshots: [],
  };
}

export function evaluateSoakDecision(registry, now = new Date()) {
  const earliestDecisionAt = checkpointDueAt(registry.baselineAt, "t72h");
  const completed = CHECKPOINT_ORDER.filter((cp) => registry.checkpoints[cp]?.capturedAt);
  const remaining = CHECKPOINT_ORDER.filter((cp) => !registry.checkpoints[cp]?.capturedAt);
  const beforeT72 = now.getTime() < new Date(earliestDecisionAt).getTime();

  if (beforeT72) {
    return {
      decision: "SOAK_IN_PROGRESS",
      completedCheckpoints: completed,
      remainingCheckpoints: remaining,
      earliestDecisionAt,
    };
  }

  if (remaining.length > 0) {
    return {
      decision: "EXTEND_SOAK",
      completedCheckpoints: completed,
      remainingCheckpoints: remaining,
      earliestDecisionAt,
      reason: "missing_checkpoints",
    };
  }

  const fails = completed.filter((cp) => registry.checkpoints[cp]?.verdict === "FAIL");
  if (fails.length > 0) {
    return {
      decision: "ROLLBACK_RECOMMENDED",
      completedCheckpoints: completed,
      remainingCheckpoints: remaining,
      earliestDecisionAt,
      failingCheckpoints: fails,
    };
  }

  const warns = completed.filter((cp) => registry.checkpoints[cp]?.verdict === "WARN");
  if (warns.length > 0) {
    return {
      decision: "READY_FOR_B2_4_REVIEW",
      completedCheckpoints: completed,
      remainingCheckpoints: remaining,
      earliestDecisionAt,
      warnings: warns,
      note: "Review WARN checkpoints before disabling legacy fallback",
    };
  }

  return {
    decision: "READY_FOR_B2_4_REVIEW",
    completedCheckpoints: completed,
    remainingCheckpoints: remaining,
    earliestDecisionAt,
  };
}

export async function fetchProductionReadOnly(webBase, workerBase) {
  const [web, worker] = await Promise.all([
    fetch(`${webBase}/api/health`, { method: "GET", headers: { Accept: "application/json" } }).then(async (res) => ({
      ok: res.ok,
      status: res.status,
      json: await res.json().catch(() => null),
    })),
    fetch(`${workerBase}/health`, { method: "GET", headers: { Accept: "application/json" } }).then(async (res) => ({
      ok: res.ok,
      status: res.status,
      json: await res.json().catch(() => null),
    })),
  ]);
  return { web: web.json || {}, worker: worker.json || {} };
}
