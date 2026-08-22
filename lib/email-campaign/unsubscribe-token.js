import crypto from "node:crypto";

const TOKEN_VERSION = 1;
const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24 * 365;

function getUnsubscribeSecret() {
  const secret =
    process.env.EMAIL_UNSUBSCRIBE_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    process.env.ACCOUNT_DATA_ENCRYPTION_KEY?.trim();

  if (!secret) {
    throw new Error("Missing unsubscribe signing secret");
  }

  return secret;
}

function base64UrlEncode(value) {
  return Buffer.from(value, "utf8")
    .toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(String(value || ""), "base64url").toString("utf8");
}

function signPayload(payloadB64) {
  return crypto.createHmac("sha256", getUnsubscribeSecret()).update(payloadB64).digest("base64url");
}

export function createEmailUnsubscribeToken(
  { userId, normalizedEmail, campaignId = null } = {},
  { ttlMs = DEFAULT_TTL_MS } = {}
) {
  const uid = String(userId || "").trim();
  const email = String(normalizedEmail || "").trim().toLowerCase();

  if (!uid || !email) {
    throw new Error("userId and normalizedEmail are required for unsubscribe token");
  }

  const payload = {
    v: TOKEN_VERSION,
    uid,
    email,
    cid: campaignId ? String(campaignId) : null,
    exp: Date.now() + ttlMs,
  };

  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const sig = signPayload(payloadB64);

  return `${payloadB64}.${sig}`;
}

export function verifyEmailUnsubscribeToken(token) {
  const raw = String(token || "").trim();
  const [payloadB64, sig] = raw.split(".");

  if (!payloadB64 || !sig) {
    return { valid: false, reason: "malformed-token" };
  }

  const expected = signPayload(payloadB64);
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);

  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return { valid: false, reason: "invalid-signature" };
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadB64));
  } catch {
    return { valid: false, reason: "invalid-payload" };
  }

  if (payload.v !== TOKEN_VERSION) {
    return { valid: false, reason: "unsupported-version" };
  }

  if (!payload.uid || !payload.email) {
    return { valid: false, reason: "missing-claims" };
  }

  if (Number(payload.exp || 0) < Date.now()) {
    return { valid: false, reason: "expired" };
  }

  return {
    valid: true,
    userId: payload.uid,
    normalizedEmail: String(payload.email).trim().toLowerCase(),
    campaignId: payload.cid || null,
  };
}

export function buildUnsubscribeUrl(token, siteUrl = process.env.NEXT_PUBLIC_SITE_URL) {
  const base = String(siteUrl || "https://www.hasanchartworld.com").replace(/\/$/, "");
  return `${base}/email/unsubscribe?token=${encodeURIComponent(token)}`;
}
