const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;
const rateLimitStore = new Map();

export function isValidUuid(value) {
  return UUID_PATTERN.test(String(value || "").trim());
}

export function requireValidUuid(value, label = "id") {
  const normalized = String(value || "").trim();

  if (!isValidUuid(normalized)) {
    const error = new Error(`INVALID_${label.toUpperCase()}`);
    error.code = "INVALID_UUID";
    throw error;
  }

  return normalized;
}

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

export function parseMoneyAmount(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return Math.round(amount * 100) / 100;
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
