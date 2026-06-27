import { Redis } from "@upstash/redis";
import {
  isRedisFallbackActive,
  isUpstashEnvConfigured,
  shouldUseRedisForSecurity,
  logRedisFallbackWarning,
} from "./redis-fallback";
import { createInstrumentedRedis } from "./redis-instrumentation";

let redisClient = null;

export { isUpstashEnvConfigured };

/**
 * Lazy Redis client — created on first security rate-limit call only.
 */
export function getUpstashRedis() {
  if (!shouldUseRedisForSecurity()) {
    return null;
  }

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

/** Health / status without opening a Redis connection or sending commands. */
export function getRedisSecurityStatus() {
  const envConfigured = isUpstashEnvConfigured();

  if (!envConfigured) {
    return {
      envConfigured: false,
      mode: "memory",
      scope: "security-only-lazy",
      redisConnected: false,
      usesFallback: true,
    };
  }

  if (isRedisFallbackActive()) {
    logRedisFallbackWarning("Redis security fallback active");
    return {
      envConfigured: true,
      mode: "memory",
      scope: "security-only-lazy",
      redisConnected: false,
      usesFallback: true,
      fallbackActive: true,
    };
  }

  return {
    envConfigured: true,
    mode: "security-lazy",
    scope: "security-only-lazy",
    redisConnected: Boolean(redisClient),
    usesFallback: false,
    lazyClient: !redisClient,
  };
}

export async function verifyUpstashRedisCached() {
  return getRedisSecurityStatus();
}

export async function verifyUpstashRedis() {
  return getRedisSecurityStatus();
}
