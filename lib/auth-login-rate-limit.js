import { createHash } from "crypto";
import {
  getClientIp,
  hashNetworkKey,
  loginAccountFailedLimiter,
  loginFailedAuthLimiter,
  LOGIN_FAILED_AUTH_PAIR_MAX,
  loginFloodLimiter,
} from "./rate-limit.js";
import { logStructured } from "./structured-logger.js";

export const AUTH_RATE_LIMITED_CODE = "AUTH_RATE_LIMITED";
export const AUTH_LOGIN_RATE_LIMIT_MESSAGE_AR =
  "تم إجراء عدة محاولات تسجيل دخول خلال وقت قصير. حاول مجددًا بعد قليل.";

/** After this many recorded failed credential attempts, the next login request requires Turnstile. */
export const LOGIN_FAILED_AUTH_CHALLENGE_COUNT = 3;

/**
 * Failed-auth pair limiter semantics (Redis-backed, shared across instances):
 * - limit: max failed credential attempts allowed in the window (default 5)
 * - count: recorded failures already consumed in the window
 * - remaining: max(0, limit - count) attempts left before hard block
 * - limited: count >= limit (hard failed-auth ceiling reached)
 */
export function normalizeFailedAuthLimiterPeek(result, limit) {
  const normalizedLimit = Math.max(1, Number(limit) || LOGIN_FAILED_AUTH_PAIR_MAX);
  const remaining = Math.max(0, Number(result?.remaining ?? normalizedLimit));
  const count =
    typeof result?.count === "number"
      ? Math.max(0, result.count)
      : Math.max(0, normalizedLimit - remaining);

  return {
    count,
    limit: normalizedLimit,
    remaining: Math.max(0, normalizedLimit - count),
    limited: Boolean(result && result.success === false),
    resetTime: result?.resetTime ?? null,
    storage: result?.storage ?? null,
  };
}

function getRateLimitPepper() {
  return (
    process.env.AUTH_RATE_LIMIT_PEPPER?.trim() ||
    "hasan-chart-auth-rate-limit-v1"
  );
}

export function normalizeLoginEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function hashLoginAccountKey(email) {
  const normalized = normalizeLoginEmail(email);
  if (!normalized) {
    return "unknown-account";
  }

  return createHash("sha256")
    .update(`${getRateLimitPepper()}:${normalized}`)
    .digest("hex")
    .slice(0, 32);
}

export function buildLoginFailedAuthKey(clientIp, email) {
  return `${hashLoginAccountKey(email)}:${String(clientIp || "unknown")}`;
}

function computeRetryAfterSeconds(resetTime) {
  if (!resetTime) {
    return 60;
  }

  const resetMs =
    typeof resetTime === "number"
      ? resetTime
      : new Date(resetTime).getTime();

  if (!Number.isFinite(resetMs)) {
    return 60;
  }

  return Math.max(1, Math.ceil((resetMs - Date.now()) / 1000));
}

export function buildAuthRateLimitPayload({ layer, resetTime }) {
  const retryAfterSeconds = computeRetryAfterSeconds(resetTime);

  return {
    status: 429,
    body: {
      success: false,
      code: AUTH_RATE_LIMITED_CODE,
      error: AUTH_LOGIN_RATE_LIMIT_MESSAGE_AR,
      retryAfterSeconds,
      layer,
    },
    headers: {
      "Retry-After": String(retryAfterSeconds),
    },
  };
}

function logLoginRateLimited({ layer, email, clientIp, resetTime, storage }) {
  logStructured("warn", "AUTH_LOGIN_RATE_LIMITED", {
    layer,
    accountKeyHash: email ? hashLoginAccountKey(email) : null,
    networkKeyHash: hashNetworkKey(clientIp),
    retryAfterSeconds: computeRetryAfterSeconds(resetTime),
    storage: storage || null,
  });
}

export function logLoginSuccess({ email, clientIp }) {
  logStructured("info", "AUTH_LOGIN_SUCCESS", {
    accountKeyHash: hashLoginAccountKey(email),
    networkKeyHash: hashNetworkKey(clientIp),
  });
}

export function logLoginFailure({ email, clientIp, reason = "invalid_credentials" }) {
  logStructured("warn", "AUTH_LOGIN_FAILURE", {
    accountKeyHash: hashLoginAccountKey(email),
    networkKeyHash: hashNetworkKey(clientIp),
    reason,
  });
}

export async function enforceLoginFloodLimit(request) {
  const clientIp = getClientIp(request);
  const result = await loginFloodLimiter(clientIp);

  if (!result.success) {
    logLoginRateLimited({
      layer: "flood",
      clientIp,
      resetTime: result.resetTime,
      storage: result.storage,
    });

    return {
      limited: true,
      clientIp,
      ...buildAuthRateLimitPayload({ layer: "flood", resetTime: result.resetTime }),
    };
  }

  return { limited: false, clientIp };
}

export async function peekLoginFailedAuthLimits({ clientIp, email }) {
  const normalizedEmail = normalizeLoginEmail(email);
  if (!normalizedEmail) {
    return {
      count: 0,
      limit: LOGIN_FAILED_AUTH_PAIR_MAX,
      remaining: LOGIN_FAILED_AUTH_PAIR_MAX,
      limited: false,
    };
  }

  const pairKey = buildLoginFailedAuthKey(clientIp, normalizedEmail);
  const accountKey = hashLoginAccountKey(normalizedEmail);

  const [pairResult, accountResult] = await Promise.all([
    loginFailedAuthLimiter.peek(pairKey),
    loginAccountFailedLimiter.peek(accountKey),
  ]);

  const pairState = normalizeFailedAuthLimiterPeek(pairResult, LOGIN_FAILED_AUTH_PAIR_MAX);

  if (!pairResult.success) {
    logLoginRateLimited({
      layer: "failed_auth_pair",
      email: normalizedEmail,
      clientIp,
      resetTime: pairResult.resetTime,
      storage: pairResult.storage,
    });

    return {
      ...pairState,
      limited: true,
      layer: "failed_auth_pair",
      ...buildAuthRateLimitPayload({
        layer: "failed_auth_pair",
        resetTime: pairResult.resetTime,
      }),
    };
  }

  if (!accountResult.success) {
    logLoginRateLimited({
      layer: "failed_auth_account",
      email: normalizedEmail,
      clientIp,
      resetTime: accountResult.resetTime,
      storage: accountResult.storage,
    });

    return {
      ...pairState,
      limited: true,
      layer: "failed_auth_account",
      ...buildAuthRateLimitPayload({
        layer: "failed_auth_account",
        resetTime: accountResult.resetTime,
      }),
    };
  }

  return {
    ...pairState,
    limited: false,
  };
}

export async function recordLoginFailedAuthAttempt({ clientIp, email }) {
  const normalizedEmail = normalizeLoginEmail(email);
  if (!normalizedEmail) {
    return;
  }

  const pairKey = buildLoginFailedAuthKey(clientIp, normalizedEmail);
  const accountKey = hashLoginAccountKey(normalizedEmail);

  await Promise.all([
    loginFailedAuthLimiter(pairKey),
    loginAccountFailedLimiter(accountKey),
  ]);

  logLoginFailure({ email: normalizedEmail, clientIp });
}

export async function resetLoginFailedAuthCounters({ clientIp, email }) {
  const normalizedEmail = normalizeLoginEmail(email);
  if (!normalizedEmail) {
    return;
  }

  const pairKey = buildLoginFailedAuthKey(clientIp, normalizedEmail);
  const accountKey = hashLoginAccountKey(normalizedEmail);

  await Promise.all([
    loginFailedAuthLimiter.reset(pairKey),
    loginAccountFailedLimiter.reset(accountKey),
  ]);
}
