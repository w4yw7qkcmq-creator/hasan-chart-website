import { Redis } from "@upstash/redis";
import {
  activateRedisFallback,
  isRedisFailureError,
  isRedisFallbackActive,
  shouldUseRedisHealthProbe,
  logRedisFallbackWarning,
} from "./redis-fallback";
import {
  createInstrumentedRedis,
  recordRedisUsage,
  recordRedisVerifyUsage,
} from "./redis-instrumentation";

let redisClient = null;

export function isUpstashEnvConfigured() {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  );
}

export function getUpstashRedis() {
  if (!isUpstashEnvConfigured()) {
    return null;
  }

  if (!redisClient) {
    redisClient = createInstrumentedRedis(
      new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL.trim(),
        token: process.env.UPSTASH_REDIS_REST_TOKEN.trim(),
      })
    );
  }

  return redisClient;
}

export async function pingUpstashRedis() {
  if (!shouldUseRedisHealthProbe()) {
    recordRedisUsage({
      operation: "ping",
      source: "lib/upstash-redis.js",
      function: "pingUpstashRedis",
      keyPrefix: "redis:ping",
      success: true,
      meta: { skipped: true, reason: "health-probe-disabled-or-fallback" },
    });
    return false;
  }

  const redis = getUpstashRedis();

  if (!redis) {
    recordRedisUsage({
      operation: "ping",
      source: "lib/upstash-redis.js",
      function: "pingUpstashRedis",
      keyPrefix: "redis:ping",
      success: false,
      error: "redis client unavailable",
    });
    return false;
  }

  try {
    const response = await redis.ping();
    return response === "PONG";
  } catch (error) {
    if (isRedisFailureError(error)) {
      activateRedisFallback(error?.message || "redis ping failed");
    }

    return false;
  }
}

let cachedRedisHealth = null;
let cachedRedisHealthAt = 0;
const REDIS_HEALTH_CACHE_MS = 60000;

export async function verifyUpstashRedisCached() {
  const now = Date.now();

  if (cachedRedisHealth && now - cachedRedisHealthAt < REDIS_HEALTH_CACHE_MS) {
    recordRedisVerifyUsage({
      source: "lib/upstash-redis.js",
      function: "verifyUpstashRedisCached",
      skipped: true,
    });
    return cachedRedisHealth;
  }

  cachedRedisHealth = await verifyUpstashRedis();
  cachedRedisHealthAt = now;
  return cachedRedisHealth;
}

export async function verifyUpstashRedis() {
  const envConfigured = isUpstashEnvConfigured();

  if (!envConfigured) {
    recordRedisVerifyUsage({
      source: "lib/upstash-redis.js",
      function: "verifyUpstashRedis",
      skipped: true,
      meta: { reason: "env-not-configured" },
    });

    return {
      envConfigured: false,
      mode: "memory",
      redisConnected: false,
      usesFallback: true,
    };
  }

  if (isRedisFallbackActive()) {
    logRedisFallbackWarning("health check skipped Redis ping during fallback");
    recordRedisVerifyUsage({
      source: "lib/upstash-redis.js",
      function: "verifyUpstashRedis",
      skipped: true,
    });

    return {
      envConfigured: true,
      mode: "memory",
      redisConnected: false,
      usesFallback: true,
      fallbackActive: true,
    };
  }

  try {
    const redisConnected = await pingUpstashRedis();
    recordRedisVerifyUsage({
      source: "lib/upstash-redis.js",
      function: "verifyUpstashRedis",
      success: redisConnected,
      error: redisConnected ? null : "ping failed",
    });

    return {
      envConfigured: true,
      mode: redisConnected ? "redis" : "memory",
      redisConnected,
      usesFallback: !redisConnected,
    };
  } catch (error) {
    if (isRedisFailureError(error)) {
      activateRedisFallback(error?.message || "redis verify failed");
    }

    recordRedisVerifyUsage({
      source: "lib/upstash-redis.js",
      function: "verifyUpstashRedis",
      success: false,
      error: error?.message || String(error),
    });

    return {
      envConfigured: true,
      mode: "memory",
      redisConnected: false,
      usesFallback: true,
      error: error?.message || String(error),
    };
  }
}
