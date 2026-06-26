import { getSupabaseAdmin } from "./auth-session";
import { getSharedMarketPrices } from "./binance-market-stream";
import { verifyUpstashRedis } from "./upstash-redis";

const APP_STARTED_AT = Date.now();

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

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("profiles").select("id").limit(1);

    if (error) {
      return {
        status: "degraded",
        latencyMs: Date.now() - startedAt,
        message: "Database query returned an error",
      };
    }

    return {
      status: "ok",
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      status: "down",
      latencyMs: Date.now() - startedAt,
      message: error?.message || "Database unavailable",
    };
  }
}

function checkMarketStreamHealth() {
  const snapshot = getSharedMarketPrices();
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

  return {
    status,
    streamStatus: snapshot.status,
    stale: Boolean(snapshot.stale),
    updatedAt: snapshot.updatedAt || null,
    ageMs,
    source: snapshot.source || "shared-memory",
  };
}

function resolveOverallStatus(checks) {
  const critical = [checks.app?.status, checks.database?.status];
  if (critical.includes("down")) return "down";
  if (Object.values(checks).some((item) => item?.status === "down")) return "degraded";

  const nonOk = Object.values(checks).some(
    (item) => item?.status && !["ok", "not_configured"].includes(item.status)
  );

  return nonOk ? "degraded" : "ok";
}

export async function collectHealthReport() {
  const [database, redis] = await Promise.all([
    checkDatabaseHealth(),
    verifyUpstashRedis(),
  ]);

  const marketStream = checkMarketStreamHealth();

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
