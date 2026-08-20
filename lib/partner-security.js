const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;
const rateLimitStore = new Map();

export {
  filterValidUuids,
  isValidUuid,
  requireValidUuid,
} from "./id-validation.js";

export function clampLimit(value, { min = 1, max = 200, fallback = 50 } = {}) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

export function sanitizeText(value, maxLength = 500) {
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
}

export function sanitizeWalletAddress(value) {
  return String(value || "")
    .trim()
    .replace(/[^\w:/.-]/g, "")
    .slice(0, 128);
}

export function parseMoneyAmount(value, { max = 1_000_000 } = {}) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount <= 0 || amount > max) {
    return null;
  }

  return Math.round(amount * 100) / 100;
}

export async function enforcePartnerWithdrawRateLimits(request, userId) {
  const { getClientIp, partnerWithdrawIpLimiter, partnerWithdrawUserLimiter } =
    await import("./rate-limit.js");

  const ipResult = await partnerWithdrawIpLimiter(getClientIp(request));
  if (!ipResult.success) {
    return {
      allowed: false,
      storage: ipResult.storage || "unknown",
    };
  }

  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) {
    return { allowed: false, storage: "unknown" };
  }

  const userResult = await partnerWithdrawUserLimiter(normalizedUserId);
  if (!userResult.success) {
    return {
      allowed: false,
      storage: userResult.storage || "unknown",
    };
  }

  return { allowed: true, storage: userResult.storage || ipResult.storage || "unknown" };
}

export async function enforcePartnerReferralRateLimits(request, limiter) {
  const { getClientIp } = await import("./rate-limit.js");
  const ipResult = await limiter(getClientIp(request));

  if (!ipResult.success) {
    return {
      allowed: false,
      storage: ipResult.storage || "unknown",
    };
  }

  return { allowed: true, storage: ipResult.storage || "unknown" };
}

export function checkPartnerRateLimit(key, { max = RATE_LIMIT_MAX, windowMs = RATE_LIMIT_WINDOW_MS } = {}) {
  const normalizedKey = String(key || "anonymous");
  const now = Date.now();
  const bucket = rateLimitStore.get(normalizedKey) || { count: 0, resetAt: now + windowMs };

  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }

  bucket.count += 1;
  rateLimitStore.set(normalizedKey, bucket);

  if (bucket.count > max) {
    return { allowed: false, retryAfterMs: bucket.resetAt - now };
  }

  return { allowed: true, remaining: max - bucket.count };
}

export async function assertPartnerOwnership(supabase, partnerId, userId) {
  const normalizedPartnerId = requireValidUuid(partnerId, "partner_id");
  const normalizedUserId = String(userId || "").trim();

  const { data, error } = await supabase
    .from("partners")
    .select("id, user_id")
    .eq("id", normalizedPartnerId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data?.id || String(data.user_id) !== normalizedUserId) {
    const authError = new Error("FORBIDDEN");
    authError.code = "FORBIDDEN";
    throw authError;
  }

  return data;
}
