const REDIS_FALLBACK_MS = 5 * 60 * 1000;

let redisDisabledUntil = 0;
let lastFallbackWarningAt = 0;

function isEnvConfigured() {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  );
}

export function isRedisFallbackActive() {
  return Date.now() < redisDisabledUntil;
}

export function isUpstashEnvConfigured() {
  return isEnvConfigured();
}

/** Non-security paths (cache, market data) never use Redis. */
export function shouldUseRedis() {
  return false;
}

/**
 * Shared Redis for security rate limits (login, register, reset password).
 * Safe to extend for future cross-replica security features via useRedis: true.
 */
export function shouldUseRedisForSecurity() {
  return isEnvConfigured() && !isRedisFallbackActive();
}

export function isRedisFailureError(error) {
  const message = String(error?.message || error || "").toLowerCase();

  return (
    message.includes("max requests limit exceeded") ||
    message.includes("redis-write failed") ||
    message.includes("redis unavailable") ||
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("429") ||
    message.includes("econnrefused") ||
    message.includes("fetch failed")
  );
}

export function activateRedisFallback(reason = "redis unavailable") {
  redisDisabledUntil = Date.now() + REDIS_FALLBACK_MS;
  logRedisFallbackWarning(reason);
}

export function logRedisFallbackWarning(reason = "Redis unavailable, using memory fallback") {
  const now = Date.now();

  if (now - lastFallbackWarningAt < 60000) {
    return;
  }

  lastFallbackWarningAt = now;
  console.warn("Redis unavailable, using memory fallback", {
    timestamp: new Date().toISOString(),
    reason,
    disabledMs: REDIS_FALLBACK_MS,
  });
}
