import {
  getMarketStreamHub,
  startMarketStream,
  waitForMarketStreamLive,
} from "./okx-market-stream";
import { getHistoryWriterStatus } from "./market-data/history/historical-market-recorder.js";
import { fetchWithTimeout } from "./fetch-with-timeout";
import { verifyUpstashRedisCached } from "./upstash-redis";
import {
  HEALTH_CHECK_CONSTANTS,
  classifyDatabaseProbeResult,
  classifyMarketStreamSnapshot,
  createDatabaseProbeState,
  resolveOverallStatus,
  resolveReadiness,
} from "./health-check-status";

const APP_STARTED_AT = Date.now();
const {
  HEALTH_DB_TIMEOUT_MS,
  HEALTH_DB_CACHE_TTL_MS,
  MARKET_STREAM_WARMUP_GRACE_MS,
  MARKET_STREAM_WAIT_MS,
} = HEALTH_CHECK_CONSTANTS;

function getBuildMeta() {
  return {
    version: process.env.npm_package_version || "1.0.0",
    commit:
      process.env.RAILWAY_GIT_COMMIT_SHA ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.GIT_COMMIT ||
      null,
    environment: process.env.NODE_ENV || "development",
  };
}

function formatMemoryUsage() {
  const usage = process.memoryUsage();

  return {
    rssMb: roundMb(usage.rss),
    heapUsedMb: roundMb(usage.heapUsed),
    heapTotalMb: roundMb(usage.heapTotal),
    externalMb: roundMb(usage.external),
  };
}

function roundMb(value) {
  return Math.round((Number(value || 0) / (1024 * 1024)) * 100) / 100;
}

const dbProbeState = createDatabaseProbeState();

export function resetDatabaseHealthProbeStateForTests() {
  Object.assign(dbProbeState, createDatabaseProbeState());
}

export function seedDatabaseHealthProbeStateForTests({
  lastSuccessAt = 0,
  consecutiveFailures = 0,
} = {}) {
  dbProbeState.lastSuccessAt = lastSuccessAt;
  dbProbeState.consecutiveFailures = consecutiveFailures;
}

function cloneDatabaseCheckResult(result) {
  return { ...result };
}

async function runDatabaseProbeFresh() {
  const startedAt = Date.now();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      status: "down",
      latencyMs: Date.now() - startedAt,
      message: "Missing Supabase configuration",
    };
  }

  const probeUrl = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/profiles?select=id&limit=1`;

  try {
    const response = await fetchWithTimeout(
      probeUrl,
      {
        method: "GET",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          Accept: "application/json",
          Prefer: "count=none",
        },
        cache: "no-store",
      },
      HEALTH_DB_TIMEOUT_MS
    );

    if (!response.ok) {
      return {
        status: "degraded",
        latencyMs: Date.now() - startedAt,
        message: `Database probe returned HTTP ${response.status}`,
      };
    }

    return {
      status: "ok",
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    const timedOut =
      error?.code === "FETCH_TIMEOUT" || error?.message === "FETCH_TIMEOUT";

    return {
      status: timedOut ? "degraded" : "down",
      latencyMs: Date.now() - startedAt,
      message: timedOut
        ? `Database health probe timed out after ${HEALTH_DB_TIMEOUT_MS}ms`
        : error?.message || "Database unavailable",
      timedOut: Boolean(timedOut),
    };
  }
}

async function checkDatabaseHealth() {
  const now = Date.now();

  if (dbProbeState.cache && dbProbeState.cacheExpiresAt > now) {
    return cloneDatabaseCheckResult({
      ...dbProbeState.cache,
      cached: true,
      cacheAgeMs: now - (dbProbeState.cacheExpiresAt - HEALTH_DB_CACHE_TTL_MS),
    });
  }

  if (dbProbeState.inFlight) {
    return dbProbeState.inFlight.then(cloneDatabaseCheckResult);
  }

  dbProbeState.inFlight = (async () => {
    const fresh = await runDatabaseProbeFresh();
    const result = classifyDatabaseProbeResult(fresh, dbProbeState, Date.now());

    if (fresh.status === "ok") {
      dbProbeState.lastSuccessAt = Date.now();
      dbProbeState.lastSuccessLatencyMs = fresh.latencyMs;
      dbProbeState.consecutiveFailures = 0;
      dbProbeState.cache = { ...result };
      dbProbeState.cacheExpiresAt = Date.now() + HEALTH_DB_CACHE_TTL_MS;
    } else {
      dbProbeState.consecutiveFailures += 1;
      dbProbeState.cache = null;
      dbProbeState.cacheExpiresAt = 0;
    }

    return result;
  })();

  try {
    return await dbProbeState.inFlight;
  } finally {
    dbProbeState.inFlight = null;
  }
}

async function checkMarketStreamHealth() {
  startMarketStream("health-check");
  const uptimeMs = Math.floor(process.uptime() * 1000);
  const inWarmupGrace = uptimeMs < MARKET_STREAM_WARMUP_GRACE_MS;

  let snapshot;
  let waitedMs = 0;

  if (inWarmupGrace) {
    snapshot = getMarketStreamHub().getSnapshot();
  } else {
    const waitStartedAt = Date.now();
    snapshot = await waitForMarketStreamLive(MARKET_STREAM_WAIT_MS);
    waitedMs = Date.now() - waitStartedAt;
  }

  return classifyMarketStreamSnapshot(snapshot, {
    uptimeMs,
    waitedMs,
  });
}

export {
  HEALTH_CHECK_CONSTANTS,
  classifyDatabaseProbeResult,
  classifyMarketStreamSnapshot,
  resolveOverallStatus,
  resolveReadiness,
};

function checkMarketHistoryHealth() {
  const status = getHistoryWriterStatus();
  return {
    status: "ok",
    enabled: Boolean(status.enabled),
    lastSuccessfulFlushAt: status.lastSuccessfulFlushAt,
    pending: {
      flowBuckets: status.flowBucketsPending,
      largeTrades: status.largeTradesPending,
    },
    failures: status.flushFailures,
    collectingSince: status.collectingSince,
  };
}

export async function collectHealthReport() {
  const [database, redis, marketStream] = await Promise.all([
    checkDatabaseHealth(),
    verifyUpstashRedisCached(),
    checkMarketStreamHealth(),
  ]);

  const marketHistory = checkMarketHistoryHealth();

  const checks = {
    app: {
      status: "ok",
      uptimeSeconds: Math.floor(process.uptime()),
      startedAt: new Date(APP_STARTED_AT).toISOString(),
    },
    database,
    redis: {
      status: !redis.envConfigured
        ? "not_configured"
        : redis.usesFallback
          ? "degraded"
          : "ok",
      state: !redis.envConfigured
        ? "unconfigured"
        : redis.usesFallback
          ? "failed"
          : redis.redisConnected
            ? "connected"
            : "lazy",
      configured: Boolean(redis.envConfigured),
      required: false,
      mode: redis.mode,
      scope: redis.scope,
      envConfigured: redis.envConfigured,
      connected: redis.redisConnected,
      lazyClient: Boolean(redis.lazyClient),
      usesFallback: redis.usesFallback,
    },
    marketStream,
    marketHistory,
    memory: {
      status: "ok",
      ...formatMemoryUsage(),
    },
  };

  const status = resolveOverallStatus(checks);

  return {
    status,
    readiness: resolveReadiness(checks, status),
    checks,
    build: getBuildMeta(),
    timestamp: new Date().toISOString(),
  };
}
