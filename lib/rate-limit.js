import { Ratelimit } from "@upstash/ratelimit";
import {
  activateRedisFallback,
  isRedisFailureError,
  isRedisFallbackActive,
  shouldUseRedis,
} from "./redis-fallback";
import {
  getUpstashRedis,
  isUpstashEnvConfigured,
  verifyUpstashRedis,
} from "./upstash-redis";
import { recordRateLimitUsage } from "./redis-instrumentation";

const requests = new Map();

export const RATE_LIMIT_ERROR =
  "تم تجاوز عدد المحاولات المسموح. حاول لاحقاً.";

export const TEN_MINUTES_MS = 10 * 60 * 1000;
export const ONE_HOUR_MS = 60 * 60 * 1000;

const upstashLimiters = new Map();
let storageLogPromise = null;

export { isUpstashEnvConfigured };

export function getRateLimitStorageMode() {
  return isUpstashEnvConfigured() ? "redis" : "memory";
}

export async function verifyRateLimitStorage() {
  return verifyUpstashRedis();
}

function logRateLimitStorageOnce() {
  if (storageLogPromise) {
    return storageLogPromise;
  }

  storageLogPromise = (async () => {
    if (isRedisFallbackActive()) {
      console.warn("Rate Limit Storage: In-Memory (Redis fallback active)");
      return;
    }

    const status = await verifyUpstashRedis();

    if (status.envConfigured && status.redisConnected) {
      console.log("Rate Limit Storage: Redis");
      return;
    }

    if (status.envConfigured && !status.redisConnected) {
      console.warn(
        "Rate Limit Storage: In-Memory (Upstash env present but Redis ping failed)"
      );
      if (status.error) {
        console.warn("Upstash ping error:", status.error);
      }
      return;
    }

    console.log("Rate Limit Storage: In-Memory");
  })();

  return storageLogPromise;
}

function windowMsToUpstashDuration(windowMs) {
  if (windowMs % ONE_HOUR_MS === 0) {
    const hours = windowMs / ONE_HOUR_MS;
    return `${hours} h`;
  }

  if (windowMs % (60 * 1000) === 0) {
    const minutes = windowMs / (60 * 1000);
    return `${minutes} m`;
  }

  return `${Math.max(1, Math.ceil(windowMs / 1000))} s`;
}

export function getClientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");

  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function createMemoryRateLimit({
  windowMs = 15 * 60 * 1000,
  max = 10,
  prefix = "default",
} = {}) {
  return function check(identifier) {
    const now = Date.now();
    const key = `${prefix}:${identifier}`;

    const current = requests.get(key) || {
      count: 0,
      resetTime: now + windowMs,
    };

    if (now > current.resetTime) {
      current.count = 0;
      current.resetTime = now + windowMs;
    }

    current.count += 1;
    requests.set(key, current);

    return {
      success: current.count <= max,
      remaining: Math.max(0, max - current.count),
      resetTime: current.resetTime,
    };
  };
}

function getUpstashLimiter({ prefix, windowMs, max }) {
  if (!shouldUseRedis()) {
    return null;
  }

  const cacheKey = `${prefix}:${windowMs}:${max}`;

  if (upstashLimiters.has(cacheKey)) {
    return upstashLimiters.get(cacheKey);
  }

  const redis = getUpstashRedis();

  if (!redis) {
    return null;
  }

  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(
      max,
      windowMsToUpstashDuration(windowMs)
    ),
    prefix: `hasan-chart:${prefix}`,
    analytics: true,
  });

  upstashLimiters.set(cacheKey, limiter);
  return limiter;
}

export function createRateLimit({
  windowMs = 15 * 60 * 1000,
  max = 10,
  prefix = "default",
  useRedis = false,
} = {}) {
  const memoryCheck = createMemoryRateLimit({ windowMs, max, prefix });
  const upstashLimiter =
    useRedis && shouldUseRedis()
      ? getUpstashLimiter({ prefix, windowMs, max })
      : null;

  return async function check(identifier) {
    if (useRedis && !isRedisFallbackActive()) {
      await logRateLimitStorageOnce();
    }

    const normalizedIdentifier = String(identifier || "unknown");

    if (upstashLimiter && shouldUseRedis()) {
      try {
        const result = await upstashLimiter.limit(normalizedIdentifier);
        recordRateLimitUsage({
          prefix,
          identifier: normalizedIdentifier,
          source: "lib/rate-limit.js",
          function: "check",
          success: result.success,
        });

        return {
          success: result.success,
          remaining: result.remaining,
          resetTime: result.reset,
          storage: "redis",
        };
      } catch (error) {
        recordRateLimitUsage({
          prefix,
          identifier: normalizedIdentifier,
          source: "lib/rate-limit.js",
          function: "check",
          success: false,
          error: error?.message || String(error),
        });

        if (isRedisFailureError(error)) {
          activateRedisFallback(error?.message || "rate limit redis failed");
        } else {
          console.error(
            `Upstash rate limit fallback for ${prefix}:`,
            error?.message || error
          );
        }
      }
    }

    return {
      ...memoryCheck(normalizedIdentifier),
      storage: "memory",
    };
  };
}

export const loginIpLimiter = createRateLimit({
  prefix: "login-ip",
  windowMs: TEN_MINUTES_MS,
  max: 5,
});

export const registerIpLimiter = createRateLimit({
  prefix: "register-ip",
  windowMs: TEN_MINUTES_MS,
  max: 5,
});

export const refreshIpLimiter = createRateLimit({
  prefix: "refresh-ip",
  windowMs: TEN_MINUTES_MS,
  max: 30,
});

export const analysisRequestLimiter = createRateLimit({
  prefix: "analysis-request",
  windowMs: ONE_HOUR_MS,
  max: 5,
});

export const alertLimiter = createRateLimit({
  prefix: "alerts",
  windowMs: ONE_HOUR_MS,
  max: 20,
});

export const subscriptionRequestLimiter = createRateLimit({
  prefix: "subscription-request",
  windowMs: ONE_HOUR_MS,
  max: 10,
});

export const accountManagementLimiter = createRateLimit({
  prefix: "account-management",
  windowMs: ONE_HOUR_MS,
  max: 5,
});

export const adminReadLimiter = createRateLimit({
  prefix: "admin-read",
  windowMs: ONE_HOUR_MS,
  max: 240,
});

export const adminMutationLimiter = createRateLimit({
  prefix: "admin-mutation",
  windowMs: TEN_MINUTES_MS,
  max: 80,
});

export const marketPulseLimiter = createRateLimit({
  prefix: "market-pulse",
  windowMs: 60 * 1000,
  max: 180,
});

export const analysisReadLimiter = createRateLimit({
  prefix: "analysis-read",
  windowMs: TEN_MINUTES_MS,
  max: 60,
});

export const userReadLimiter = createRateLimit({
  prefix: "user-read",
  windowMs: 60 * 1000,
  max: 90,
});
