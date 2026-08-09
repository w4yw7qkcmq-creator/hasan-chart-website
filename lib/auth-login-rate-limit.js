import { createHash } from "crypto";
import {
  getClientIp,
  hashNetworkKey,
  loginAccountFailedLimiter,
  loginFailedAuthLimiter,
  loginFloodLimiter,
} from "./rate-limit.js";
import { logStructured } from "./structured-logger.js";

export const AUTH_RATE_LIMITED_CODE = "AUTH_RATE_LIMITED";
export const AUTH_LOGIN_RATE_LIMIT_MESSAGE_AR =
  "تم إجراء عدة محاولات تسجيل دخول خلال وقت قصير. حاول مجددًا بعد قليل.";

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
    return { limited: false };
  }

  const pairKey = buildLoginFailedAuthKey(clientIp, normalizedEmail);
  const accountKey = hashLoginAccountKey(normalizedEmail);

  const [pairResult, accountResult] = await Promise.all([
    loginFailedAuthLimiter.peek(pairKey),
    loginAccountFailedLimiter.peek(accountKey),
  ]);

  if (!pairResult.success) {
    logLoginRateLimited({
      layer: "failed_auth_pair",
      email: normalizedEmail,
      clientIp,
      resetTime: pairResult.resetTime,
      storage: pairResult.storage,
    });

    return {
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
      limited: true,
      layer: "failed_auth_account",
      ...buildAuthRateLimitPayload({
        layer: "failed_auth_account",
        resetTime: accountResult.resetTime,
      }),
    };
  }

  return { limited: false };
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
  await loginFailedAuthLimiter.reset(pairKey);
}
