/**
 * Global public chart quota — authoritative persistence policy
 *
 * Authority row: news_system_metric_snapshots
 *   window_key = "public_chart_quota"
 *   bucket_start = AUTHORITY_BUCKET (fixed timestamptz singleton)
 *
 * Rolling window: 24h from lastChartPublishedAt (max 1 chart per window).
 *
 * Bootstrap: when no authority row exists and Supabase is available, create one
 * with lastChartPublishedAt=null. No reliable persisted chart evidence exists
 * in legacy tables (rss_chart_image_policy / public_chart_quota both empty in prod),
 * so fail-closed recovery from publication history is not attempted.
 *
 * Production fail-closed: if Supabase authority cannot be read/written/locked,
 * deny chart grants (CHART_QUOTA_AUTHORITY_UNAVAILABLE). Text-only news continues.
 * Production never reports authorityMode=local unless testMode/forceLocalAuthority.
 */
const { ROLLING_WINDOW_MS } = require("./chart-rate-limit");

const WINDOW_KEY = "public_chart_quota";
const AUTHORITY_BUCKET = "1970-01-01T00:00:00.000Z";
const RESERVE_LOCK_NAME = "public_chart_quota_reserve";
const RESERVE_LOCK_TTL_SECONDS = 8;

let memoryState = {
  lastChartPublishedAt: null,
  chartRolling24hCount: 0,
};

let authorityLoadMeta = {
  rowPresent: false,
  queryFailed: false,
  queryError: null,
  bootstrapped: false,
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
  authorityMode: "unknown",
};

function isProductionRuntime() {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.RAILWAY_ENVIRONMENT === "production" ||
    Boolean(process.env.RAILWAY_GIT_COMMIT_SHA)
  );
}

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

  const supabase = resolveSupabaseClient(options);
  if (supabase) {
    return "distributed";
  }

  if (process.env.NODE_ENV === "test") return "local";
  if (process.env.NEWS_DRY_RUN === "true") return "local";

  return isProductionRuntime() ? "unavailable" : "local";
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
  if (typeof metrics.authorityMode === "string") {
    telemetry.authorityMode = metrics.authorityMode;
  }
}

function buildPersistedMetrics(state = memoryState, options = {}) {
  const authorityMode = resolveQuotaAuthorityMode(options);
  return {
    lastChartPublishedAt: state.lastChartPublishedAt,
    chartRolling24hCount: Number(state.chartRolling24hCount || 0),
    chartQuotaChecked: telemetry.chartQuotaChecked,
    chartQuotaGranted: telemetry.chartQuotaGranted,
    chartQuotaBlocked: telemetry.chartQuotaBlocked,
    chartFallbackTextOnly: telemetry.chartFallbackTextOnly,
    authorityHealthy: authorityMode !== "unavailable" && telemetry.authorityHealthy !== false,
    authorityMode,
    lastAuthoritySyncAt: new Date().toISOString(),
  };
}

function applyAuthorityMetrics(metrics = {}) {
  memoryState = {
    lastChartPublishedAt: metrics.lastChartPublishedAt || null,
    chartRolling24hCount: Number(metrics.chartRolling24hCount || 0),
  };
  syncTelemetryFromMetrics(metrics);
  telemetry.chartLastPublishedAt = memoryState.lastChartPublishedAt;
  telemetry.chartRolling24hCount = memoryState.chartRolling24hCount;
}

async function bootstrapAuthorityRow(supabase, options = {}) {
  const metrics = buildPersistedMetrics(
    { lastChartPublishedAt: null, chartRolling24hCount: 0 },
    options
  );
  metrics.bootstrapReason = "initial_authority_row";
  metrics.bootstrapAt = new Date().toISOString();

  const { error } = await supabase.from("news_system_metric_snapshots").upsert(
    {
      window_key: WINDOW_KEY,
      bucket_start: AUTHORITY_BUCKET,
      metrics,
    },
    { onConflict: "window_key,bucket_start" }
  );
  if (error) {
    throw error;
  }
  authorityLoadMeta.bootstrapped = true;
  authorityLoadMeta.rowPresent = true;
  applyAuthorityMetrics(metrics);
  telemetry.authorityHealthy = true;
  telemetry.authorityMode = resolveQuotaAuthorityMode(options);
  return { ...memoryState };
}

async function loadPublicChartQuotaState(options = {}) {
  if (options.stateOverride) {
    return { ...memoryState, ...options.stateOverride };
  }

  const supabase = resolveSupabaseClient(options);
  const authorityMode = resolveQuotaAuthorityMode(options);
  telemetry.authorityMode = authorityMode;

  if (!supabase) {
    if (authorityMode === "unavailable") {
      telemetry.authorityHealthy = false;
      authorityLoadMeta.queryFailed = true;
    }
    return { ...memoryState };
  }

  try {
    const { data, error } = await supabase
      .from("news_system_metric_snapshots")
      .select("metrics,bucket_start,created_at")
      .eq("window_key", WINDOW_KEY)
      .eq("bucket_start", AUTHORITY_BUCKET)
      .maybeSingle();

    if (error) {
      authorityLoadMeta.queryFailed = true;
      authorityLoadMeta.queryError = error.message;
      authorityLoadMeta.rowPresent = false;
      telemetry.authorityHealthy = false;
      return { ...memoryState };
    }

    authorityLoadMeta.queryFailed = false;
    authorityLoadMeta.queryError = null;

    if (!data?.metrics) {
      authorityLoadMeta.rowPresent = false;
      if (authorityMode === "distributed") {
        return bootstrapAuthorityRow(supabase, options);
      }
      return { ...memoryState };
    }

    authorityLoadMeta.rowPresent = true;
    applyAuthorityMetrics(data.metrics);
    telemetry.authorityHealthy = true;
    telemetry.authorityMode = authorityMode;
  } catch (error) {
    authorityLoadMeta.queryFailed = true;
    authorityLoadMeta.queryError = error.message;
    authorityLoadMeta.rowPresent = false;
    telemetry.authorityHealthy = false;
  }

  return { ...memoryState };
}

async function persistPublicChartQuotaState(state = {}, options = {}) {
  memoryState = { ...memoryState, ...state };
  telemetry.chartLastPublishedAt = memoryState.lastChartPublishedAt;
  telemetry.chartRolling24hCount = memoryState.chartRolling24hCount;
  const supabase = resolveSupabaseClient(options);
  const authorityMode = resolveQuotaAuthorityMode(options);
  telemetry.authorityMode = authorityMode;

  if (supabase && authorityMode === "distributed") {
    try {
      const { error } = await supabase.from("news_system_metric_snapshots").upsert(
        {
          window_key: WINDOW_KEY,
          bucket_start: AUTHORITY_BUCKET,
          metrics: buildPersistedMetrics(memoryState, options),
        },
        { onConflict: "window_key,bucket_start" }
      );
      if (error) {
        telemetry.authorityHealthy = false;
        authorityLoadMeta.queryFailed = true;
        authorityLoadMeta.queryError = error.message;
      } else {
        telemetry.authorityHealthy = true;
        authorityLoadMeta.rowPresent = true;
        authorityLoadMeta.queryFailed = false;
      }
    } catch (error) {
      telemetry.authorityHealthy = false;
      authorityLoadMeta.queryFailed = true;
      authorityLoadMeta.queryError = error.message;
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
    if (!lock.acquired) {
      return { ...lock, mode: "distributed", reason: lock.reason || "CHART_QUOTA_CONTENTION" };
    }
    return { ...lock, mode: "distributed" };
  } catch (_) {
    telemetry.authorityHealthy = false;
    authorityLoadMeta.queryFailed = true;
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
  const authorityMode = resolveQuotaAuthorityMode(options);
  telemetry.authorityMode = authorityMode;

  if (authorityMode === "unavailable") {
    telemetry.chartQuotaBlocked += 1;
    telemetry.authorityHealthy = false;
    return {
      granted: false,
      reason: "CHART_QUOTA_AUTHORITY_UNAVAILABLE",
      state: { ...memoryState },
      authorityHealthy: false,
      authorityMode,
    };
  }

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
      if (authorityLoadMeta.queryFailed) {
        telemetry.chartQuotaBlocked += 1;
        telemetry.authorityHealthy = false;
        return {
          granted: false,
          reason: "CHART_QUOTA_AUTHORITY_UNAVAILABLE",
          state,
          authorityHealthy: false,
          authorityMode: telemetry.authorityMode,
        };
      }

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
      if (!telemetry.authorityHealthy) {
        telemetry.chartQuotaBlocked += 1;
        return {
          granted: false,
          reason: "CHART_QUOTA_AUTHORITY_UNAVAILABLE",
          state: memoryState,
          authorityHealthy: false,
          authorityMode: telemetry.authorityMode,
        };
      }
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
  if (authorityLoadMeta.queryFailed) {
    return true;
  }
  return isWithinRollingWindow(state.lastChartPublishedAt, nowMs);
}

function buildPublicChartQuotaReadModel(state = memoryState, options = {}) {
  const nowMs = options.nowMs || Date.now();
  const mode = resolveQuotaAuthorityMode(options);
  const blocked = isWithinRollingWindow(state.lastChartPublishedAt, nowMs);
  const chartsInWindow = blocked && state.lastChartPublishedAt ? 1 : 0;

  if (options.authorityQueryFailed || authorityLoadMeta.queryFailed) {
    return {
      quotaStatus: "authority_unhealthy",
      chartsPublishedInRolling24h: chartsInWindow,
      lastChartPublishedAt: state.lastChartPublishedAt || null,
      nextChartEligibleAt: blocked ? computeNextChartEligibleAt(state.lastChartPublishedAt) : null,
      chartQuotaChecked: telemetry.chartQuotaChecked,
      chartQuotaGranted: telemetry.chartQuotaGranted,
      chartQuotaBlocked: telemetry.chartQuotaBlocked,
      chartFallbackTextOnly: telemetry.chartFallbackTextOnly,
      chartImagesPublished: chartsInWindow,
      authorityHealthy: false,
      authorityMode: "unavailable",
      authorityQueryFailed: true,
      authorityRowMissing: false,
      rollingWindowMs: ROLLING_WINDOW_MS,
      sourceOfTruth: `news_system_metric_snapshots.${WINDOW_KEY}.${AUTHORITY_BUCKET}`,
    };
  }

  if (mode === "unavailable") {
    return {
      quotaStatus: "authority_unhealthy",
      chartsPublishedInRolling24h: chartsInWindow,
      lastChartPublishedAt: state.lastChartPublishedAt || null,
      nextChartEligibleAt: blocked ? computeNextChartEligibleAt(state.lastChartPublishedAt) : null,
      chartQuotaChecked: telemetry.chartQuotaChecked,
      chartQuotaGranted: telemetry.chartQuotaGranted,
      chartQuotaBlocked: telemetry.chartQuotaBlocked,
      chartFallbackTextOnly: telemetry.chartFallbackTextOnly,
      chartImagesPublished: chartsInWindow,
      authorityHealthy: false,
      authorityMode: "unavailable",
      authorityQueryFailed: false,
      authorityRowMissing: !authorityLoadMeta.rowPresent,
      rollingWindowMs: ROLLING_WINDOW_MS,
      sourceOfTruth: `news_system_metric_snapshots.${WINDOW_KEY}.${AUTHORITY_BUCKET}`,
    };
  }

  const rowMissing = options.authorityRowMissing === true || !authorityLoadMeta.rowPresent;
  const authorityHealthy =
    mode === "distributed" && telemetry.authorityHealthy !== false && !rowMissing;

  return {
    quotaStatus: !authorityHealthy
      ? rowMissing
        ? "authority_missing"
        : "authority_unhealthy"
      : blocked
        ? "exhausted"
        : "available",
    chartsPublishedInRolling24h: chartsInWindow,
    lastChartPublishedAt: state.lastChartPublishedAt || null,
    nextChartEligibleAt: blocked ? computeNextChartEligibleAt(state.lastChartPublishedAt) : null,
    chartQuotaChecked: telemetry.chartQuotaChecked,
    chartQuotaGranted: telemetry.chartQuotaGranted,
    chartQuotaBlocked: telemetry.chartQuotaBlocked,
    chartFallbackTextOnly: telemetry.chartFallbackTextOnly,
    chartImagesPublished: chartsInWindow,
    authorityHealthy,
    authorityMode: mode,
    authorityQueryFailed: false,
    authorityRowMissing: rowMissing,
    rollingWindowMs: ROLLING_WINDOW_MS,
    sourceOfTruth: `news_system_metric_snapshots.${WINDOW_KEY}.${AUTHORITY_BUCKET}`,
  };
}

async function loadPublicChartQuotaReadModel(options = {}) {
  await loadPublicChartQuotaState(options);
  return buildPublicChartQuotaReadModel(memoryState, options);
}

async function syncPublicChartQuotaAuthority(options = {}) {
  await loadPublicChartQuotaState(options);
  return buildPublicChartQuotaReadModel(memoryState, options);
}

function getPublicChartQuotaTelemetrySnapshot(options = {}) {
  return {
    ...buildPublicChartQuotaReadModel(memoryState, options),
    chartImageLastPublishedAt: memoryState.lastChartPublishedAt,
  };
}

function getAuthorityLoadMetaForTests() {
  return { ...authorityLoadMeta };
}

function resetPublicChartQuotaForTests() {
  memoryState = { lastChartPublishedAt: null, chartRolling24hCount: 0 };
  reservationChain = Promise.resolve();
  authorityLoadMeta = {
    rowPresent: false,
    queryFailed: false,
    queryError: null,
    bootstrapped: false,
  };
  telemetry.chartQuotaChecked = 0;
  telemetry.chartQuotaGranted = 0;
  telemetry.chartQuotaBlocked = 0;
  telemetry.chartFallbackTextOnly = 0;
  telemetry.chartLastPublishedAt = null;
  telemetry.chartRolling24hCount = 0;
  telemetry.authorityHealthy = true;
  telemetry.authorityMode = "unknown";
}

module.exports = {
  WINDOW_KEY,
  AUTHORITY_BUCKET,
  ROLLING_WINDOW_MS,
  isProductionRuntime,
  loadPublicChartQuotaState,
  persistPublicChartQuotaState,
  bootstrapAuthorityRow,
  tryReservePublicChartQuota,
  isPublicChartQuotaBlocked,
  isWithinRollingWindow,
  computeNextChartEligibleAt,
  resolveQuotaAuthorityMode,
  recordChartQuotaTextFallback,
  buildPublicChartQuotaReadModel,
  loadPublicChartQuotaReadModel,
  syncPublicChartQuotaAuthority,
  getPublicChartQuotaTelemetrySnapshot,
  getAuthorityLoadMetaForTests,
  resetPublicChartQuotaForTests,
};
