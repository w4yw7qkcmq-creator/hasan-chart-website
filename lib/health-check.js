import {
  startMarketStream,
  waitForMarketStreamLive,
} from "./okx-market-stream";
import { fetchWithTimeout } from "./fetch-with-timeout";
import { verifyUpstashRedisCached } from "./upstash-redis";

const APP_STARTED_AT = Date.now();
const MARKET_STREAM_WAIT_MS = 9000;
const HEALTH_DB_TIMEOUT_MS = 800;

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

async function checkDatabaseHealth() {
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
    };
  }
}

async function checkMarketStreamHealth() {
  startMarketStream("health-check");
  const snapshot = await waitForMarketStreamLive(MARKET_STREAM_WAIT_MS);
  const ageMs = snapshot.updatedAt > 0 ? Date.now() - snapshot.updatedAt : null;

  let status = "idle";
  if (snapshot.status === "live" && ageMs !== null && ageMs <= 15000) {
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
    waitedMs: MARKET_STREAM_WAIT_MS,
  };

  if (snapshot.lastError) {
    result.lastError = snapshot.lastError;
    result.lastErrorAt = snapshot.lastErrorAt
      ? new Date(snapshot.lastErrorAt).toISOString()
      : null;
  }

  if (status !== "ok") {
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

function resolveOverallStatus(checks) {
  if (checks.app?.status === "down" || checks.database?.status === "down") {
    return "down";
  }

  if (checks.marketStream?.status === "down") {
    return "degraded";
  }

  const nonOk = Object.entries(checks).some(([name, item]) => {
    if (!item?.status) return false;
    if (name === "redis" && item.status === "degraded") return true;
    return !["ok", "not_configured"].includes(item.status);
  });

  return nonOk ? "degraded" : "ok";
}

export async function collectHealthReport() {
  const [database, redis, marketStream] = await Promise.all([
    checkDatabaseHealth(),
    verifyUpstashRedisCached(),
    checkMarketStreamHealth(),
  ]);

  const checks = {
    app: {
      status: "ok",
      uptimeSeconds: Math.floor(process.uptime()),
      startedAt: new Date(APP_STARTED_AT).toISOString(),
    },
    database,
    redis: {
      status: redis.redisConnected
        ? "ok"
        : redis.envConfigured
          ? "degraded"
          : "not_configured",
      mode: redis.mode,
      envConfigured: redis.envConfigured,
      connected: redis.redisConnected,
      usesFallback: redis.usesFallback,
      cacheTtlSeconds: 60,
    },
    marketStream,
    memory: {
      status: "ok",
      ...formatMemoryUsage(),
    },
  };

  return {
    status: resolveOverallStatus(checks),
    checks,
    build: getBuildMeta(),
    timestamp: new Date().toISOString(),
  };
}
