import crypto from "crypto";

const PEPPER = () => String(process.env.IAM_SERVICE_SECRET_PEPPER || "iam-service-pepper-dev-only").trim();

function timingSafeEqual(provided, expected) {
  if (!provided || !expected) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * HMAC-SHA256 hash for service account secrets.
 * Never store or log plaintext secrets.
 */
export function hashServiceSecret(secret, accountId = "") {
  return crypto
    .createHmac("sha256", PEPPER())
    .update(`${String(accountId || "").trim()}:`)
    .update(String(secret || ""))
    .digest("hex");
}

export function verifyServiceSecret(secret, storedHash, accountId = "") {
  if (!storedHash || !secret) return false;
  const computed = hashServiceSecret(secret, accountId);
  return timingSafeEqual(computed, storedHash);
}

export function generateServiceSecret(byteLength = 32) {
  return crypto.randomBytes(byteLength).toString("base64url");
}

export async function rotateServiceSecret(supabase, params) {
  const accountId = String(params.accountId || "").trim();
  const actorId = params.actorId || null;
  if (!accountId) return { ok: false, status: 400, error: "accountId required" };

  const plaintext = generateServiceSecret();
  const secretHash = hashServiceSecret(plaintext, accountId);
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("iam_service_accounts")
    .update({
      secret_hash: secretHash,
      enabled: true,
      rotated_at: now,
      updated_at: now,
    })
    .eq("id", accountId)
    .select("id, label, enabled, rotated_at")
    .maybeSingle();

  if (error) {
    return { ok: false, status: 500, error: error.message };
  }

  return {
    ok: true,
    account: data,
    secretPlaintextOnce: plaintext,
    actorId,
    rotatedAt: now,
  };
}

export async function revokeServiceAccount(supabase, params) {
  const accountId = String(params.accountId || "").trim();
  const actorId = params.actorId || null;
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("iam_service_accounts")
    .update({
      enabled: false,
      revoked_at: now,
      secret_hash: null,
      updated_at: now,
    })
    .eq("id", accountId);

  if (error) {
    return { ok: false, status: 500, error: error.message };
  }

  return { ok: true, accountId, revokedAt: now, actorId };
}

export async function recordServiceAccountUse(supabase, params) {
  const accountId = String(params.accountId || "").trim();
  const ip = params.ipAddress || null;
  const now = new Date().toISOString();

  try {
    await supabase
      .from("iam_service_accounts")
      .update({ last_used_at: now, last_used_ip: ip, updated_at: now })
      .eq("id", accountId);
  } catch {
    // non-blocking
  }

  return { ok: true };
}

export function isPlaceholderHash(hash) {
  if (!hash) return true;
  const normalized = String(hash).trim().toLowerCase();
  return /^0+$/.test(normalized) || normalized === "unconfigured";
}

export function isServiceAccountConfigured(account) {
  if (!account) return false;
  if (account.enabled === false) return false;
  if (account.revoked_at) return false;
  if (!account.secret_hash || isPlaceholderHash(account.secret_hash)) return false;
  return true;
}
