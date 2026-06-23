import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const requests = new Map();

export const RATE_LIMIT_ERROR =
  "تم تجاوز عدد المحاولات المسموح. حاول لاحقاً.";

export const TEN_MINUTES_MS = 10 * 60 * 1000;
export const ONE_HOUR_MS = 60 * 60 * 1000;

let redisClient = null;
const upstashLimiters = new Map();

function isUpstashConfigured() {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  );
}

function getRedisClient() {
  if (!isUpstashConfigured()) {
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
  const cacheKey = `${prefix}:${windowMs}:${max}`;

  if (upstashLimiters.has(cacheKey)) {
    return upstashLimiters.get(cacheKey);
  }

  const redis = getRedisClient();

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
} = {}) {
  const memoryCheck = createMemoryRateLimit({ windowMs, max, prefix });
  const upstashLimiter = isUpstashConfigured()
    ? getUpstashLimiter({ prefix, windowMs, max })
    : null;

  return async function check(identifier) {
    const normalizedIdentifier = String(identifier || "unknown");

    if (upstashLimiter) {
      try {
        const result = await upstashLimiter.limit(normalizedIdentifier);

        return {
          success: result.success,
          remaining: result.remaining,
          resetTime: result.reset,
        };
      } catch (error) {
        console.error(
          `Upstash rate limit fallback for ${prefix}:`,
          error?.message || error
        );
      }
    }

    return memoryCheck(normalizedIdentifier);
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
