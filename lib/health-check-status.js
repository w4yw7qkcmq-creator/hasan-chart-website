export const HEALTH_CHECK_CONSTANTS = {
  /** Supabase REST probe budget — avoids false degraded on cold-start spikes. */
  HEALTH_DB_TIMEOUT_MS: 1800,
  HEALTH_DB_CACHE_TTL_MS: 8000,
  HEALTH_DB_RECENT_SUCCESS_MS: 30_000,
  HEALTH_DB_MAX_TRANSIENT_FAILURES: 3,
  MARKET_STREAM_WARMUP_GRACE_MS: 20_000,
  MARKET_STREAM_WAIT_MS: 9000,
};

const NON_DEGRADING_CHECK_STATUSES = new Set(["ok", "not_configured", "warming_up"]);

export function classifyDatabaseProbeResult(result, probeState, now = Date.now()) {
  const normalized = { ...result };
  const { HEALTH_DB_TIMEOUT_MS, HEALTH_DB_RECENT_SUCCESS_MS, HEALTH_DB_MAX_TRANSIENT_FAILURES } =
    HEALTH_CHECK_CONSTANTS;

  if (result.status === "ok") {
    return normalized;
  }

  const recentSuccess =
    probeState.lastSuccessAt > 0 &&
    now - probeState.lastSuccessAt <= HEALTH_DB_RECENT_SUCCESS_MS;

  if (
    result.status === "degraded" &&
    result.timedOut &&
    recentSuccess &&
    probeState.consecutiveFailures < HEALTH_DB_MAX_TRANSIENT_FAILURES
  ) {
    normalized.transient = true;
    normalized.lastSuccessAgeMs = now - probeState.lastSuccessAt;
    normalized.message = `Database probe timed out after ${HEALTH_DB_TIMEOUT_MS}ms; last successful probe ${normalized.lastSuccessAgeMs}ms ago`;
  }

  return normalized;
}

export function classifyMarketStreamSnapshot(snapshot, options = {}) {
  const {
    uptimeMs = 0,
    warmupGraceMs = HEALTH_CHECK_CONSTANTS.MARKET_STREAM_WARMUP_GRACE_MS,
    now = Date.now(),
    waitedMs = 0,
  } = options;

  const ageMs = snapshot.updatedAt > 0 ? now - snapshot.updatedAt : null;
  const inWarmupGrace = uptimeMs < warmupGraceMs;
  const hasExplicitFailure = Boolean(snapshot.lastError);

  let status = "idle";

  if (
    inWarmupGrace &&
    !hasExplicitFailure &&
    ["connecting", "retrying", "idle"].includes(snapshot.status)
  ) {
    status = "warming_up";
  } else if (snapshot.status === "live" && ageMs !== null && ageMs <= 15000) {
    status = "ok";
  } else if (snapshot.status === "live" || snapshot.status === "stale") {
    status = "degraded";
  } else if (snapshot.status === "retrying" || snapshot.status === "connecting") {
    status = "degraded";
  } else if (snapshot.status === "offline") {
    status = "down";
  }

  const result = {
    status,
    streamStatus: snapshot.status,
    stale: Boolean(snapshot.stale),
    updatedAt: snapshot.updatedAt || null,
    ageMs,
    source: snapshot.source || "shared-memory",
    wsReadyState: snapshot.wsReadyState || null,
    reconnectAttempt: snapshot.reconnectAttempt ?? 0,
    messagesReceived: snapshot.messagesReceived ?? 0,
    waitedMs,
    warmupGraceMs,
    processUptimeMs: uptimeMs,
  };

  if (status === "warming_up") {
    result.message =
      "Market stream is warming up after process start; WebSocket connection in progress.";
  }

  if (snapshot.lastError) {
    result.lastError = snapshot.lastError;
    result.lastErrorAt = snapshot.lastErrorAt
      ? new Date(snapshot.lastErrorAt).toISOString()
      : null;
  }

  if (status !== "ok" && status !== "warming_up") {
    if (snapshot.lastError) {
      result.message = snapshot.lastError;
    } else if (snapshot.status === "connecting") {
      result.message =
        "Market stream is still connecting to OKX WebSocket; no price data received yet.";
    } else if (snapshot.status === "retrying") {
      result.message = "Market stream is retrying the OKX WebSocket connection.";
    } else if (snapshot.status === "offline") {
      result.message = "Market stream failed to connect to OKX WebSocket.";
    }
  }

  return result;
}

export function resolveOverallStatus(checks) {
  if (checks.app?.status === "down" || checks.database?.status === "down") {
    return "down";
  }

  if (checks.marketStream?.status === "down") {
    return "degraded";
  }

  const nonOk = Object.entries(checks).some(([name, item]) => {
    if (!item?.status) return false;
    if (name === "redis" && item.status === "degraded") return true;
    if (name === "database" && item.status === "degraded" && item.transient) {
      return false;
    }
    return !NON_DEGRADING_CHECK_STATUSES.has(item.status);
  });

  return nonOk ? "degraded" : "ok";
}

export function resolveReadiness(checks, overallStatus) {
  if (checks.marketStream?.status === "warming_up") {
    return "warming_up";
  }

  if (overallStatus === "degraded") {
    return "degraded";
  }

  if (overallStatus === "down") {
    return "down";
  }

  return "ready";
}

export function createDatabaseProbeState() {
  return {
    cache: null,
    cacheExpiresAt: 0,
    inFlight: null,
    lastSuccessAt: 0,
    lastSuccessLatencyMs: null,
    consecutiveFailures: 0,
  };
}
