import { Ratelimit } from "@upstash/ratelimit";
import { legacyHashNetworkKey } from "./security/security-signal-hash.js";
import {
  activateRedisFallback,
  isRedisFailureError,
  shouldUseRedisForSecurity,
  isUpstashEnvConfigured,
} from "./redis-fallback.js";
import { getUpstashRedis } from "./upstash-redis.js";
import { recordRateLimitUsage } from "./redis-instrumentation.js";
import { withBoundedTimeout } from "./async-bounded.js";

const REDIS_RATE_LIMIT_TIMEOUT_MS = Number(process.env.RATE_LIMIT_REDIS_TIMEOUT_MS) || 8000;

const requests = new Map();

export const RATE_LIMIT_ERROR =
  "Too many requests, please try again later.";

export const TEN_MINUTES_MS = 10 * 60 * 1000;
export const ONE_HOUR_MS = 60 * 60 * 1000;

const upstashLimiters = new Map();

export { isUpstashEnvConfigured };

export function getRateLimitStorageMode() {
  return isUpstashEnvConfigured() ? "redis-security-lazy" : "memory";
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

function isPlausibleIp(value) {
  const ip = String(value || "").trim();
  if (!ip) return false;
  if (ip === "unknown") return false;
  return /^[\d.a-fA-F:]+$/.test(ip);
}

/**
 * Trusted client IP for Railway / reverse-proxy deployments.
 * Prefer x-real-ip (set by the edge) over x-forwarded-for leftmost (client-spoofable).
 * XFF chain: leftmost = original client when proxies append; used only as fallback.
 */
export function getClientIp(request) {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (isPlausibleIp(realIp)) {
    return realIp;
  }

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded
      .split(",")
      .map((part) => part.trim())
      .filter(isPlausibleIp);

    if (hops.length > 0) {
      return hops[0];
    }
  }

  return "unknown";
}

export function hashNetworkKey(clientIp) {
  try {
    return legacyHashNetworkKey(clientIp);
  } catch {
    return "unknown";
  }
}

export function createMemoryRateLimit({
  windowMs = 15 * 60 * 1000,
  max = 10,
  prefix = "default",
} = {}) {
  function getEntry(identifier) {
    const key = `${prefix}:${identifier}`;
    const now = Date.now();
    const current = requests.get(key);

    if (!current || now > current.resetTime) {
      return {
        key,
        count: 0,
        resetTime: now + windowMs,
      };
    }

    return { key, count: current.count, resetTime: current.resetTime };
  }

  function check(identifier, { consume = true } = {}) {
    const now = Date.now();
    const entry = getEntry(identifier);

    if (now > entry.resetTime) {
      entry.count = 0;
      entry.resetTime = now + windowMs;
    }

    const projectedCount = consume ? entry.count + 1 : entry.count;

    if (consume) {
      entry.count = projectedCount;
      requests.set(entry.key, {
        count: entry.count,
        resetTime: entry.resetTime,
      });
    }

    const blocked = consume
      ? projectedCount > max
      : entry.count >= max;

    const currentCount = consume ? projectedCount : entry.count;

    return {
      success: !blocked,
      remaining: Math.max(0, max - currentCount),
      count: currentCount,
      limit: max,
      resetTime: entry.resetTime,
    };
  }

  check.peek = (identifier) => check(identifier, { consume: false });
  check.reset = (identifier) => {
    requests.delete(`${prefix}:${identifier}`);
    return { success: true, storage: "memory" };
  };

  return check;
}

function getUpstashLimiter({ prefix, windowMs, max }) {
  if (!shouldUseRedisForSecurity()) {
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
    analytics: false,
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
  let upstashLimiter = null;

  async function check(identifier, { consume = true } = {}) {
    const normalizedIdentifier = String(identifier || "unknown");

    if (useRedis && shouldUseRedisForSecurity()) {
      if (!upstashLimiter) {
        upstashLimiter = getUpstashLimiter({ prefix, windowMs, max });
      }

      if (upstashLimiter) {
        try {
          const redisCall = consume
            ? upstashLimiter.limit(normalizedIdentifier)
            : upstashLimiter.getRemaining(normalizedIdentifier);
          const result = await withBoundedTimeout(redisCall, REDIS_RATE_LIMIT_TIMEOUT_MS, `rate-limit:${prefix}`);

          recordRateLimitUsage({
            prefix,
            identifier: normalizedIdentifier,
            source: "lib/rate-limit.js",
            function: consume ? "check" : "peek",
            success: consume ? result.success : result.remaining > 0,
          });

          const remaining = Math.max(0, Number(result.remaining ?? 0));
          const count = Math.max(0, max - remaining);

          return {
            success: consume ? result.success : result.remaining > 0,
            remaining,
            count,
            limit: max,
            resetTime: result.reset,
            storage: "redis",
          };
        } catch (error) {
          recordRateLimitUsage({
            prefix,
            identifier: normalizedIdentifier,
            source: "lib/rate-limit.js",
            function: consume ? "check" : "peek",
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
    }

    return {
      ...memoryCheck(normalizedIdentifier, { consume }),
      storage: "memory",
    };
  }

  check.peek = (identifier) => check(identifier, { consume: false });

  check.reset = async (identifier) => {
    const normalizedIdentifier = String(identifier || "unknown");

    if (useRedis && shouldUseRedisForSecurity()) {
      if (!upstashLimiter) {
        upstashLimiter = getUpstashLimiter({ prefix, windowMs, max });
      }

      if (upstashLimiter?.resetUsedTokens) {
        try {
          await upstashLimiter.resetUsedTokens(normalizedIdentifier);
          return { success: true, storage: "redis" };
        } catch (error) {
          if (isRedisFailureError(error)) {
            activateRedisFallback(error?.message || "rate limit reset failed");
          }
        }
      }
    }

    return memoryCheck.reset(normalizedIdentifier);
  };

  return check;
}

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

function readPositiveInt(name, fallback) {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

/** Layer 1 — request flood protection (all login POSTs, higher ceiling). */
export const loginFloodLimiter = createRateLimit({
  prefix: "login-flood",
  windowMs: readPositiveInt("LOGIN_FLOOD_WINDOW_MS", TEN_MINUTES_MS),
  max: readPositiveInt("LOGIN_FLOOD_MAX", 40),
  useRedis: true,
});

/** Layer 2 — failed credential attempts per account+network pair. */
export const LOGIN_FAILED_AUTH_PAIR_MAX = readPositiveInt("LOGIN_FAILED_MAX", 5);

export const loginFailedAuthLimiter = createRateLimit({
  prefix: "login-failed-auth",
  windowMs: readPositiveInt("LOGIN_FAILED_WINDOW_MS", FIFTEEN_MINUTES_MS),
  max: LOGIN_FAILED_AUTH_PAIR_MAX,
  useRedis: true,
});

/** Layer 2b — failed attempts per account across networks (distributed attack). */
export const loginAccountFailedLimiter = createRateLimit({
  prefix: "login-failed-account",
  windowMs: readPositiveInt("LOGIN_ACCOUNT_FAILED_WINDOW_MS", ONE_HOUR_MS),
  max: readPositiveInt("LOGIN_ACCOUNT_FAILED_MAX", 20),
  useRedis: true,
});

/** @deprecated Use loginFloodLimiter — kept for import compatibility. */
export const loginIpLimiter = loginFloodLimiter;

export const registerIpLimiter = createRateLimit({
  prefix: "register-ip",
  windowMs: TEN_MINUTES_MS,
  max: 5,
  useRedis: true,
});

export const resetPasswordIpLimiter = createRateLimit({
  prefix: "reset-password-ip",
  windowMs: TEN_MINUTES_MS,
  max: 5,
  useRedis: true,
});

/** In-memory limiters — per-process only. */
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

export const marketHistoryLimiter = createRateLimit({
  prefix: "market-history",
  windowMs: 60 * 1000,
  max: 120,
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

export const userMutationLimiter = createRateLimit({
  prefix: "user-mutation",
  windowMs: TEN_MINUTES_MS,
  max: 40,
});

export const pushSubscribeLimiter = createRateLimit({
  prefix: "push-subscribe",
  windowMs: TEN_MINUTES_MS,
  max: 15,
});

export const pushUnsubscribeIpLimiter = createRateLimit({
  prefix: "push-unsubscribe-ip",
  windowMs: TEN_MINUTES_MS,
  max: 30,
});

export const notificationDispatchLimiter = createRateLimit({
  prefix: "notification-dispatch",
  windowMs: ONE_HOUR_MS,
  max: 30,
});

export const bootstrapIpLimiter = createRateLimit({
  prefix: "iam-bootstrap-ip",
  windowMs: TEN_MINUTES_MS,
  max: 5,
  useRedis: true,
});

/** SEC-003 — partner financial mutations (distributed when Upstash configured). */
export const partnerWithdrawUserLimiter = createRateLimit({
  prefix: "partner-withdraw-user",
  windowMs: 60 * 1000,
  max: 10,
  useRedis: true,
});

export const partnerWithdrawIpLimiter = createRateLimit({
  prefix: "partner-withdraw-ip",
  windowMs: 60 * 1000,
  max: 20,
  useRedis: true,
});

/** SEC-008 — partner referral capture writes (analytics inflation protection). */
export const partnerCaptureRefIpLimiter = createRateLimit({
  prefix: "partner-capture-ref-ip",
  windowMs: 60 * 1000,
  max: 30,
  useRedis: true,
});

export const partnerTrackVisitIpLimiter = createRateLimit({
  prefix: "partner-track-visit-ip",
  windowMs: 60 * 1000,
  max: 30,
  useRedis: true,
});

/** SEC-009 — generous public news list anti-abuse ceiling (cached reads). */
export const publicNewsIpLimiter = createRateLimit({
  prefix: "public-news-ip",
  windowMs: 60 * 1000,
  max: 180,
  useRedis: true,
});

/** VIP signals — authenticated per-user read ceiling. */
export const vipSignalsUserLimiter = createRateLimit({
  prefix: "vip-signals-user",
  windowMs: TEN_MINUTES_MS,
  max: 60,
  useRedis: true,
});
