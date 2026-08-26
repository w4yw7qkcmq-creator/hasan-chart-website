/**
 * Global public chart quota — authoritative persistence policy
 *
 * Authority row: news_system_metric_snapshots
 *   window_key = "public_chart_quota"
 *   bucket_start = "authority" (fixed singleton bucket)
 *
 * Rolling window: 24h from lastChartPublishedAt (max 1 chart per window).
 *
 * Concurrency: distributed lock (public_chart_quota_reserve) wraps read-check-write.
 * In-process reservationChain serializes reservations within one worker.
 *
 * Production fail-safe:
 *   - Distributed mode when Supabase client is available.
 *   - Local-only grants ONLY in test/dev (NODE_ENV=test, testMode, forceLocalAuthority, NEWS_DRY_RUN).
 *   - If Supabase is unavailable in production: deny chart grants (text-only news still allowed upstream).
 *   - Never allow independent multi-worker grants without shared authority.
 */
const { ROLLING_WINDOW_MS } = require("./chart-rate-limit");

const WINDOW_KEY = "public_chart_quota";
const AUTHORITY_BUCKET = "authority";
const RESERVE_LOCK_NAME = "public_chart_quota_reserve";
const RESERVE_LOCK_TTL_SECONDS = 8;

let memoryState = {
  lastChartPublishedAt: null,
  chartRolling24hCount: 0,
};

let reservationChain = Promise.resolve();

const telemetry = {
  chartQuotaChecked: 0,
  chartQuotaGranted: 0,
  chartQuotaBlocked: 0,
  chartFallbackTextOnly: 0,
  chartLastPublishedAt: null,
  chartRolling24hCount: 0,
  authorityHealthy: true,
  authorityMode: "local",
};

function isWithinRollingWindow(lastAtIso, nowMs = Date.now()) {
  const lastAt = lastAtIso ? Date.parse(lastAtIso) : null;
  if (!lastAt || Number.isNaN(lastAt)) {
    return false;
  }
  return nowMs - lastAt < ROLLING_WINDOW_MS;
}

function computeNextChartEligibleAt(lastAtIso) {
  const lastAt = lastAtIso ? Date.parse(lastAtIso) : null;
  if (!lastAt || Number.isNaN(lastAt)) {
    return null;
  }
  return new Date(lastAt + ROLLING_WINDOW_MS).toISOString();
}

function resolveSupabaseClient(options = {}) {
  const getSupabaseClient = options.getSupabaseClient || null;
  if (typeof getSupabaseClient === "function") {
    return getSupabaseClient();
  }
  return options.supabase || null;
}

function resolveQuotaAuthorityMode(options = {}) {
  if (options.forceLocalAuthority === true) return "local";
  if (options.testMode === true) return "local";
  if (process.env.NODE_ENV === "test") return "local";
  if (process.env.NEWS_DRY_RUN === "true") return "local";

  const supabase = resolveSupabaseClient(options);
  if (!supabase) {
    if (process.env.NODE_ENV === "production") {
      return "unavailable";
    }
    return "local";
  }
  return "distributed";
}

function syncTelemetryFromMetrics(metrics = {}) {
  if (typeof metrics.chartQuotaChecked === "number") telemetry.chartQuotaChecked = metrics.chartQuotaChecked;
  if (typeof metrics.chartQuotaGranted === "number") telemetry.chartQuotaGranted = metrics.chartQuotaGranted;
  if (typeof metrics.chartQuotaBlocked === "number") telemetry.chartQuotaBlocked = metrics.chartQuotaBlocked;
  if (typeof metrics.chartFallbackTextOnly === "number") {
    telemetry.chartFallbackTextOnly = metrics.chartFallbackTextOnly;
  }
  if (typeof metrics.authorityHealthy === "boolean") {
    telemetry.authorityHealthy = metrics.authorityHealthy;
  }
}

function buildPersistedMetrics(state = memoryState) {
  return {
    lastChartPublishedAt: state.lastChartPublishedAt,
    chartRolling24hCount: Number(state.chartRolling24hCount || 0),
    chartQuotaChecked: telemetry.chartQuotaChecked,
    chartQuotaGranted: telemetry.chartQuotaGranted,
    chartQuotaBlocked: telemetry.chartQuotaBlocked,
    chartFallbackTextOnly: telemetry.chartFallbackTextOnly,
    authorityHealthy: telemetry.authorityHealthy,
    authorityMode: telemetry.authorityMode,
    lastAuthoritySyncAt: new Date().toISOString(),
  };
}

async function loadPublicChartQuotaState(options = {}) {
  if (options.stateOverride) {
    return { ...memoryState, ...options.stateOverride };
  }
  const supabase = resolveSupabaseClient(options);
  if (supabase) {
    try {
      const { data } = await supabase
        .from("news_system_metric_snapshots")
        .select("metrics")
        .eq("window_key", WINDOW_KEY)
        .eq("bucket_start", AUTHORITY_BUCKET)
        .maybeSingle();
      if (data?.metrics) {
        memoryState = {
          lastChartPublishedAt: data.metrics.lastChartPublishedAt || null,
          chartRolling24hCount: Number(data.metrics.chartRolling24hCount || 0),
        };
        syncTelemetryFromMetrics(data.metrics);
      }
      telemetry.authorityHealthy = true;
    } catch (_) {
      telemetry.authorityHealthy = false;
    }
  } else if (resolveQuotaAuthorityMode(options) === "unavailable") {
    telemetry.authorityHealthy = false;
  }
  telemetry.chartLastPublishedAt = memoryState.lastChartPublishedAt;
  telemetry.chartRolling24hCount = memoryState.chartRolling24hCount;
  return { ...memoryState };
}

async function persistPublicChartQuotaState(state = {}, options = {}) {
  memoryState = { ...memoryState, ...state };
  telemetry.chartLastPublishedAt = memoryState.lastChartPublishedAt;
  telemetry.chartRolling24hCount = memoryState.chartRolling24hCount;
  const supabase = resolveSupabaseClient(options);
  const authorityMode = resolveQuotaAuthorityMode(options);
  telemetry.authorityMode = authorityMode;

  if (supabase) {
    try {
      await supabase.from("news_system_metric_snapshots").upsert(
        {
          window_key: WINDOW_KEY,
          bucket_start: AUTHORITY_BUCKET,
          metrics: buildPersistedMetrics(memoryState),
        },
        { onConflict: "window_key,bucket_start" }
      );
      telemetry.authorityHealthy = true;
    } catch (_) {
      telemetry.authorityHealthy = false;
    }
  } else if (authorityMode === "unavailable") {
    telemetry.authorityHealthy = false;
  }
  return memoryState;
}

async function acquireQuotaReservationLock(getSupabaseClient, options = {}) {
  const mode = resolveQuotaAuthorityMode(options);
  if (mode === "local") {
    return { acquired: true, reason: "local_only", distributed: false, owner: "local", mode };
  }
  if (mode === "unavailable") {
    return {
      acquired: false,
      reason: "CHART_QUOTA_AUTHORITY_UNAVAILABLE",
      distributed: false,
      owner: null,
      mode,
    };
  }

  const client = typeof getSupabaseClient === "function" ? getSupabaseClient() : null;
  if (!client) {
    return {
      acquired: false,
      reason: "CHART_QUOTA_AUTHORITY_UNAVAILABLE",
      distributed: false,
      owner: null,
      mode: "unavailable",
    };
  }

  try {
    const { acquireDistributedCycleLock } = require("../../news-worker-distributed-lock");
    const lock = await acquireDistributedCycleLock(() => client, {
      lockName: RESERVE_LOCK_NAME,
      ttlSeconds: RESERVE_LOCK_TTL_SECONDS,
    });
    return { ...lock, mode: "distributed" };
  } catch (_) {
    telemetry.authorityHealthy = false;
    return {
      acquired: false,
      reason: "CHART_QUOTA_AUTHORITY_UNAVAILABLE",
      distributed: false,
      owner: null,
      mode: "unavailable",
    };
  }
}

async function releaseQuotaReservationLock(getSupabaseClient, owner, lockName = RESERVE_LOCK_NAME) {
  try {
    const { releaseDistributedCycleLock } = require("../../news-worker-distributed-lock");
    await releaseDistributedCycleLock(getSupabaseClient, owner, lockName);
  } catch (_) {
    // non-blocking
  }
}

async function persistTelemetryCounters(options = {}) {
  return persistPublicChartQuotaState({}, options);
}

function recordChartQuotaTextFallback(options = {}) {
  telemetry.chartFallbackTextOnly += 1;
  persistTelemetryCounters(options).catch(() => {});
}

async function tryReservePublicChartQuota(options = {}) {
  telemetry.chartQuotaChecked += 1;
  const nowMs = options.nowMs || Date.now();
  const getSupabaseClient = options.getSupabaseClient || null;
  const supabase = resolveSupabaseClient(options);
  telemetry.authorityMode = resolveQuotaAuthorityMode(options);

  const run = async () => {
    const lock = await acquireQuotaReservationLock(() => supabase, options);
    if (!lock.acquired) {
      telemetry.chartQuotaBlocked += 1;
      if (lock.reason === "CHART_QUOTA_AUTHORITY_UNAVAILABLE") {
        telemetry.authorityHealthy = false;
      }
      await persistTelemetryCounters({ supabase, getSupabaseClient, ...options });
      return {
        granted: false,
        reason: lock.reason || "CHART_QUOTA_CONTENTION",
        state: { ...memoryState },
        authorityHealthy: telemetry.authorityHealthy,
        authorityMode: telemetry.authorityMode,
      };
    }

    try {
      const state = await loadPublicChartQuotaState({ supabase, getSupabaseClient, stateOverride: options.stateOverride });
      if (isWithinRollingWindow(state.lastChartPublishedAt, nowMs)) {
        telemetry.chartQuotaBlocked += 1;
        await persistTelemetryCounters({ supabase, getSupabaseClient, ...options });
        return {
          granted: false,
          reason: "CHART_RATE_LIMITED",
          state,
          authorityHealthy: telemetry.authorityHealthy,
          authorityMode: telemetry.authorityMode,
        };
      }

      const nextState = {
        lastChartPublishedAt: new Date(nowMs).toISOString(),
        chartRolling24hCount: 1,
      };
      await persistPublicChartQuotaState(nextState, { supabase, getSupabaseClient, ...options });
      telemetry.chartQuotaGranted += 1;
      return {
        granted: true,
        reason: null,
        state: nextState,
        authorityHealthy: telemetry.authorityHealthy,
        authorityMode: telemetry.authorityMode,
      };
    } finally {
      if (lock.distributed !== false && lock.owner) {
        await releaseQuotaReservationLock(() => supabase, lock.owner, lock.lockName || RESERVE_LOCK_NAME);
      }
    }
  };

  if (options.skipProcessQueue === true) {
    return run();
  }

  const resultPromise = reservationChain.then(run, run);
  reservationChain = resultPromise.catch(() => {});
  return resultPromise;
}

function isPublicChartQuotaBlocked(nowMs = Date.now(), state = memoryState, options = {}) {
  const mode = resolveQuotaAuthorityMode(options);
  if (mode === "unavailable") {
    return true;
  }
  return isWithinRollingWindow(state.lastChartPublishedAt, nowMs);
}

function buildPublicChartQuotaReadModel(state = memoryState, options = {}) {
  const nowMs = options.nowMs || Date.now();
  const mode = resolveQuotaAuthorityMode(options);
  const blocked = isPublicChartQuotaBlocked(nowMs, state, options);
  const chartsInWindow = blocked && state.lastChartPublishedAt ? 1 : 0;

  return {
    quotaStatus: mode === "unavailable" ? "authority_unhealthy" : blocked ? "exhausted" : "available",
    chartsPublishedInRolling24h: chartsInWindow,
    lastChartPublishedAt: state.lastChartPublishedAt || null,
    nextChartEligibleAt: blocked ? computeNextChartEligibleAt(state.lastChartPublishedAt) : null,
    chartQuotaChecked: telemetry.chartQuotaChecked,
    chartQuotaGranted: telemetry.chartQuotaGranted,
    chartQuotaBlocked: telemetry.chartQuotaBlocked,
    chartFallbackTextOnly: telemetry.chartFallbackTextOnly,
    chartImagesPublished: chartsInWindow,
    authorityHealthy: mode !== "unavailable" && telemetry.authorityHealthy !== false,
    authorityMode: mode,
    rollingWindowMs: ROLLING_WINDOW_MS,
    sourceOfTruth: "news_system_metric_snapshots.public_chart_quota.authority",
  };
}

async function loadPublicChartQuotaReadModel(options = {}) {
  const state = await loadPublicChartQuotaState(options);
  return buildPublicChartQuotaReadModel(state, options);
}

function getPublicChartQuotaTelemetrySnapshot() {
  return {
    ...telemetry,
    ...buildPublicChartQuotaReadModel(memoryState),
    chartImageLastPublishedAt: memoryState.lastChartPublishedAt,
  };
}

function resetPublicChartQuotaForTests() {
  memoryState = { lastChartPublishedAt: null, chartRolling24hCount: 0 };
  reservationChain = Promise.resolve();
  telemetry.chartQuotaChecked = 0;
  telemetry.chartQuotaGranted = 0;
  telemetry.chartQuotaBlocked = 0;
  telemetry.chartFallbackTextOnly = 0;
  telemetry.chartLastPublishedAt = null;
  telemetry.chartRolling24hCount = 0;
  telemetry.authorityHealthy = true;
  telemetry.authorityMode = "local";
}

module.exports = {
  WINDOW_KEY,
  AUTHORITY_BUCKET,
  ROLLING_WINDOW_MS,
  loadPublicChartQuotaState,
  persistPublicChartQuotaState,
  tryReservePublicChartQuota,
  isPublicChartQuotaBlocked,
  isWithinRollingWindow,
  computeNextChartEligibleAt,
  resolveQuotaAuthorityMode,
  recordChartQuotaTextFallback,
  buildPublicChartQuotaReadModel,
  loadPublicChartQuotaReadModel,
  getPublicChartQuotaTelemetrySnapshot,
  resetPublicChartQuotaForTests,
};
