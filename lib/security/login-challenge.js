import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const CHALLENGE_TTL_MS = Number(process.env.LOGIN_CHALLENGE_TTL_MS) || 5 * 60 * 1000;
const store = globalThis.__loginChallengeStore || new Map();
globalThis.__loginChallengeStore = store;

function getChallengeSecret() {
  return (
    process.env.SECURITY_SIGNAL_HMAC_SECRET?.trim() ||
    process.env.AUTH_RATE_LIMIT_PEPPER?.trim() ||
    "hasan-chart-login-challenge-v1"
  );
}

function signPayload(payload) {
  return createHmac("sha256", getChallengeSecret()).update(payload).digest("hex").slice(0, 32);
}

export function createLoginChallenge({ email, clientIp, deviceHash = null }) {
  const challengeId = randomBytes(16).toString("hex");
  const expiresAt = Date.now() + CHALLENGE_TTL_MS;
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const payload = `${challengeId}:${normalizedEmail}:${clientIp}:${deviceHash || "none"}:${expiresAt}`;
  const signature = signPayload(payload);

  store.set(challengeId, {
    email: normalizedEmail,
    clientIp,
    deviceHash,
    expiresAt,
    signature,
    used: false,
  });

  return { challengeId, expiresAt };
}

export function verifyLoginChallenge({
  challengeId,
  email,
  clientIp,
  deviceHash = null,
  consume = true,
}) {
  const entry = store.get(String(challengeId || ""));
  if (!entry) return { ok: false, reason: "challenge_not_found" };
  if (entry.used) return { ok: false, reason: "challenge_replay" };
  if (Date.now() > entry.expiresAt) {
    store.delete(challengeId);
    return { ok: false, reason: "challenge_expired" };
  }

  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (entry.email !== normalizedEmail) return { ok: false, reason: "challenge_email_mismatch" };
  if (entry.clientIp !== clientIp) return { ok: false, reason: "challenge_ip_mismatch" };
  if (entry.deviceHash && deviceHash && entry.deviceHash !== deviceHash) {
    return { ok: false, reason: "challenge_device_mismatch" };
  }

  const payload = `${challengeId}:${entry.email}:${entry.clientIp}:${entry.deviceHash || "none"}:${entry.expiresAt}`;
  const expected = signPayload(payload);
  const left = Buffer.from(String(entry.signature || ""), "utf8");
  const right = Buffer.from(expected, "utf8");
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return { ok: false, reason: "challenge_signature_invalid" };
  }

  if (consume) {
    entry.used = true;
    store.set(challengeId, entry);
  }
  return { ok: true };
}

export function consumeLoginChallenge(challengeId) {
  const entry = store.get(String(challengeId || ""));
  if (!entry || entry.used) return false;
  entry.used = true;
  store.set(challengeId, entry);
  return true;
}

export function purgeExpiredLoginChallenges() {
  const now = Date.now();
  for (const [id, entry] of store.entries()) {
    if (entry.expiresAt <= now) store.delete(id);
  }
}
