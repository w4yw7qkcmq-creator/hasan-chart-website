import { Redis } from "@upstash/redis";
import {
  activateRedisFallback,
  isRedisFailureError,
  isRedisFallbackActive,
  logRedisFallbackWarning,
} from "./redis-fallback";

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
    redisClient = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL.trim(),
      token: process.env.UPSTASH_REDIS_REST_TOKEN.trim(),
    });
  }

  return redisClient;
}

export async function pingUpstashRedis() {
  if (isRedisFallbackActive()) {
    return false;
  }

  const redis = getUpstashRedis();

  if (!redis) {
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
const REDIS_HEALTH_CACHE_MS = 30000;

export async function verifyUpstashRedisCached() {
  const now = Date.now();

  if (cachedRedisHealth && now - cachedRedisHealthAt < REDIS_HEALTH_CACHE_MS) {
    return cachedRedisHealth;
  }

  cachedRedisHealth = await verifyUpstashRedis();
  cachedRedisHealthAt = now;
  return cachedRedisHealth;
}

export async function verifyUpstashRedis() {
  const envConfigured = isUpstashEnvConfigured();

  if (!envConfigured) {
    return {
      envConfigured: false,
      mode: "memory",
      redisConnected: false,
      usesFallback: true,
    };
  }

  if (isRedisFallbackActive()) {
    logRedisFallbackWarning("health check skipped Redis ping during fallback");

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

    return {
      envConfigured: true,
      mode: "memory",
      redisConnected: false,
      usesFallback: true,
      error: error?.message || String(error),
    };
  }
}
