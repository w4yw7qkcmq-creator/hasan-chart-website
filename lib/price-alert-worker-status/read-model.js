const DEFAULT_EXPECTED_CYCLE_MS = 30_000;
const STALE_CYCLE_MULTIPLIER = 10;
const MIN_STALE_THRESHOLD_MS = 5 * 60_000;
const DEPLOYMENT_GRACE_MS = 2 * 60_000;

export const PRICE_ALERT_WORKER_STATUS = Object.freeze({
  HEALTHY: "HEALTHY",
  STALE: "STALE",
  DOWN: "DOWN",
  UNKNOWN: "UNKNOWN",
});

function resolveStaleThresholdMs(expectedCycleMs = DEFAULT_EXPECTED_CYCLE_MS) {
  const cycleMs = Number(expectedCycleMs) > 0 ? Number(expectedCycleMs) : DEFAULT_EXPECTED_CYCLE_MS;
  return Math.max(cycleMs * STALE_CYCLE_MULTIPLIER + DEPLOYMENT_GRACE_MS, MIN_STALE_THRESHOLD_MS);
}

function mapRunRow(row) {
  if (!row) return null;
  return {
    runId: row.run_id,
    workerInstance: row.worker_instance,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationMs: row.duration_ms,
    status: row.status,
    alertsFetched: row.alerts_fetched,
    alertsEvaluated: row.alerts_evaluated,
    alertsTriggered: row.alerts_triggered,
    alertsCompleted: row.alerts_completed,
    siteSent: row.site_sent,
    pushSent: row.push_sent,
    pushFailed: row.push_failed,
    emailQueued: row.email_queued,
    emailFailed: row.email_failed,
    stalePrices: row.stale_prices,
    errorCodeSafe: row.error_code_safe,
    buildCommit: row.build_commit,
  };
}

function deriveWorkerStatus({ latestRun, recentRuns = [], expectedCycleMs, nowMs = Date.now() }) {
  if (!latestRun?.completedAt) {
    if (recentRuns.length === 0) {
      return {
        status: PRICE_ALERT_WORKER_STATUS.UNKNOWN,
        reason: "no_telemetry_rows",
      };
    }
    return {
      status: PRICE_ALERT_WORKER_STATUS.DOWN,
      reason: "latest_run_incomplete",
    };
  }

  const completedAtMs = Date.parse(latestRun.completedAt);
  if (Number.isNaN(completedAtMs)) {
    return {
      status: PRICE_ALERT_WORKER_STATUS.UNKNOWN,
      reason: "invalid_completed_at",
    };
  }

  const ageMs = nowMs - completedAtMs;
  const staleThresholdMs = resolveStaleThresholdMs(expectedCycleMs);

  if (ageMs <= staleThresholdMs) {
    return {
      status: PRICE_ALERT_WORKER_STATUS.HEALTHY,
      reason: "recent_cycle",
      ageMs,
      staleThresholdMs,
    };
  }

  return {
    status: PRICE_ALERT_WORKER_STATUS.STALE,
    reason: "heartbeat_stale",
    ageMs,
    staleThresholdMs,
  };
}

function countConsecutiveFailures(recentRuns = []) {
  let count = 0;
  for (const run of recentRuns) {
    if (run.status === "failed") {
      count += 1;
      continue;
    }
    if (run.status === "success" || run.status === "skipped") break;
  }
  return count;
}

export async function getPriceAlertWorkerStatusFromDb(
  supabase,
  { expectedCycleMs = DEFAULT_EXPECTED_CYCLE_MS, nowMs = Date.now() } = {}
) {
  if (!supabase) {
    return {
      dbAvailable: false,
      workerStatus: PRICE_ALERT_WORKER_STATUS.UNKNOWN,
      reason: "supabase_unavailable",
      latestRun: null,
      recentRuns: [],
      consecutiveFailures: 0,
      staleThresholdMs: resolveStaleThresholdMs(expectedCycleMs),
      expectedCycleMs,
      dataSource: "unavailable",
    };
  }

  const { data: recentRows, error } = await supabase
    .from("price_alert_worker_runs")
    .select(
      "run_id,worker_instance,started_at,completed_at,duration_ms,status,alerts_fetched,alerts_evaluated,alerts_triggered,alerts_completed,site_sent,push_sent,push_failed,email_queued,email_failed,stale_prices,error_code_safe,build_commit"
    )
    .order("started_at", { ascending: false })
    .limit(20);

  if (error) {
    const tableMissing = /relation .* does not exist/i.test(error.message);
    return {
      dbAvailable: true,
      workerStatus: PRICE_ALERT_WORKER_STATUS.UNKNOWN,
      reason: tableMissing ? "telemetry_table_missing" : "telemetry_query_failed",
      latestRun: null,
      recentRuns: [],
      consecutiveFailures: 0,
      staleThresholdMs: resolveStaleThresholdMs(expectedCycleMs),
      expectedCycleMs,
      dataSource: "persisted_telemetry",
      queryError: tableMissing ? null : "query_failed",
    };
  }

  const recentRuns = (recentRows || []).map(mapRunRow).filter(Boolean);
  const latestRun = recentRuns[0] || null;
  const derived = deriveWorkerStatus({ latestRun, recentRuns, expectedCycleMs, nowMs });
  const consecutiveFailures = countConsecutiveFailures(recentRuns);

  return {
    dbAvailable: true,
    workerStatus: derived.status,
    reason: derived.reason,
    lastCycleCompletedAt: latestRun?.completedAt || null,
    lastCycleStartedAt: latestRun?.startedAt || null,
    lastCycleDurationMs: latestRun?.durationMs ?? null,
    lastCycleStatus: latestRun?.status || null,
    lastErrorCodeSafe: latestRun?.errorCodeSafe || null,
    consecutiveFailures,
    heartbeatAgeMs: derived.ageMs ?? null,
    staleThresholdMs: derived.staleThresholdMs ?? resolveStaleThresholdMs(expectedCycleMs),
    expectedCycleMs,
    latestRun,
    recentRuns: recentRuns.slice(0, 5),
    deliverySnapshot: latestRun
      ? {
          siteSent: latestRun.siteSent,
          pushSent: latestRun.pushSent,
          pushFailed: latestRun.pushFailed,
          emailQueued: latestRun.emailQueued,
          emailFailed: latestRun.emailFailed,
          stalePrices: latestRun.stalePrices,
        }
      : null,
    dataSource: "persisted_telemetry",
    timestamp: new Date().toISOString(),
  };
}

export { resolveStaleThresholdMs, DEFAULT_EXPECTED_CYCLE_MS };
