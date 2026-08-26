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
  chartLastPublishedAt: null,
  chartRolling24hCount: 0,
};

function isWithinRollingWindow(lastAtIso, nowMs = Date.now()) {
  const lastAt = lastAtIso ? Date.parse(lastAtIso) : null;
  if (!lastAt || Number.isNaN(lastAt)) {
    return false;
  }
  return nowMs - lastAt < ROLLING_WINDOW_MS;
}

async function loadPublicChartQuotaState(options = {}) {
  if (options.stateOverride) {
    return { ...memoryState, ...options.stateOverride };
  }
  if (options.supabase) {
    try {
      const { data } = await options.supabase
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
      }
    } catch (_) {
      // non-blocking
    }
  }
  telemetry.chartLastPublishedAt = memoryState.lastChartPublishedAt;
  telemetry.chartRolling24hCount = memoryState.chartRolling24hCount;
  return { ...memoryState };
}

async function persistPublicChartQuotaState(state = {}, options = {}) {
  memoryState = { ...memoryState, ...state };
  telemetry.chartLastPublishedAt = memoryState.lastChartPublishedAt;
  telemetry.chartRolling24hCount = memoryState.chartRolling24hCount;
  if (options.supabase) {
    try {
      await options.supabase.from("news_system_metric_snapshots").upsert(
        {
          window_key: WINDOW_KEY,
          bucket_start: AUTHORITY_BUCKET,
          metrics: {
            lastChartPublishedAt: memoryState.lastChartPublishedAt,
            chartRolling24hCount: memoryState.chartRolling24hCount,
          },
        },
        { onConflict: "window_key,bucket_start" }
      );
    } catch (_) {
      // non-blocking
    }
  }
  return memoryState;
}

async function acquireQuotaReservationLock(getSupabaseClient) {
  const client = typeof getSupabaseClient === "function" ? getSupabaseClient() : null;
  if (!client) {
    return { acquired: true, reason: "local_only", distributed: false, owner: "local" };
  }
  try {
    const { acquireDistributedCycleLock } = require("../../news-worker-distributed-lock");
    return acquireDistributedCycleLock(() => client, {
      lockName: RESERVE_LOCK_NAME,
      ttlSeconds: RESERVE_LOCK_TTL_SECONDS,
    });
  } catch (_) {
    return { acquired: true, reason: "local_only", distributed: false, owner: "local" };
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

async function tryReservePublicChartQuota(options = {}) {
  telemetry.chartQuotaChecked += 1;
  const nowMs = options.nowMs || Date.now();
  const getSupabaseClient = options.getSupabaseClient || null;
  const supabase = typeof getSupabaseClient === "function" ? getSupabaseClient() : options.supabase || null;

  const run = async () => {
    const lock = await acquireQuotaReservationLock(() => supabase);
    if (!lock.acquired) {
      telemetry.chartQuotaBlocked += 1;
      return { granted: false, reason: "CHART_QUOTA_CONTENTION", state: { ...memoryState } };
    }

    try {
      const state = await loadPublicChartQuotaState({ supabase, stateOverride: options.stateOverride });
      if (isWithinRollingWindow(state.lastChartPublishedAt, nowMs)) {
        telemetry.chartQuotaBlocked += 1;
        return { granted: false, reason: "CHART_RATE_LIMITED", state };
      }

      const nextState = {
        lastChartPublishedAt: new Date(nowMs).toISOString(),
        chartRolling24hCount: 1,
      };
      await persistPublicChartQuotaState(nextState, { supabase });
      telemetry.chartQuotaGranted += 1;
      return { granted: true, reason: null, state: nextState };
    } finally {
      if (lock.distributed !== false) {
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

function isPublicChartQuotaBlocked(nowMs = Date.now(), state = memoryState) {
  return isWithinRollingWindow(state.lastChartPublishedAt, nowMs);
}

function getPublicChartQuotaTelemetrySnapshot() {
  return {
    ...telemetry,
    chartImageLastPublishedAt: memoryState.lastChartPublishedAt,
    chartRolling24hCount: memoryState.chartRolling24hCount,
  };
}

function resetPublicChartQuotaForTests() {
  memoryState = { lastChartPublishedAt: null, chartRolling24hCount: 0 };
  reservationChain = Promise.resolve();
  telemetry.chartQuotaChecked = 0;
  telemetry.chartQuotaGranted = 0;
  telemetry.chartQuotaBlocked = 0;
  telemetry.chartLastPublishedAt = null;
  telemetry.chartRolling24hCount = 0;
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
  getPublicChartQuotaTelemetrySnapshot,
  resetPublicChartQuotaForTests,
};
