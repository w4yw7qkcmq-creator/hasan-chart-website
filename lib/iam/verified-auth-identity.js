import { extractTokenIssuedAt } from "./session-revocation.js";

/** Decode JWT payload for shadow parity only — not used as security verification. */
function decodeJwtPayloadForComparison(token) {
  try {
    const [, payloadPart] = String(token || "").split(".");
    if (!payloadPart) return {};
    return JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

/**
 * @typedef {Object} VerifiedAuthIdentity
 * @property {string} userId
 * @property {string|null} sessionId
 * @property {number} issuedAtMs
 * @property {number} expiresAtMs
 * @property {string|null} role
 * @property {'getUser'|'getClaims'} source
 * @property {string|null} issuer
 * @property {string|null} audience
 */

export function buildIdentityFromGetUser(user, token, source = "getUser") {
  const issuedAtMs = extractTokenIssuedAt(token);
  const payload = decodeJwtPayloadForComparison(token);
  return {
    userId: String(user?.id || "").trim(),
    sessionId: payload.session_id ? String(payload.session_id) : null,
    issuedAtMs,
    expiresAtMs: payload.exp ? Number(payload.exp) * 1000 : 0,
    role:
      String(user?.role || user?.app_metadata?.role || payload.role || "authenticated").trim() ||
      "authenticated",
    source,
    issuer: payload.iss ? String(payload.iss) : null,
    audience: payload.aud ? String(payload.aud) : null,
    email: user?.email || payload.email ? "present" : null,
  };
}

export function buildIdentityFromClaims(claimsPayload, token) {
  const claims = claimsPayload?.claims || claimsPayload || {};
  const header = claimsPayload?.header || {};

  const sub = String(claims.sub || "").trim();
  const sessionId = claims.session_id ? String(claims.session_id) : null;
  const iat = Number(claims.iat || 0);
  const exp = Number(claims.exp || 0);

  return {
    userId: sub,
    sessionId,
    issuedAtMs: iat ? iat * 1000 : extractTokenIssuedAt(token),
    expiresAtMs: exp ? exp * 1000 : 0,
    role: String(claims.role || "authenticated").trim() || "authenticated",
    source: "getClaims",
    issuer: claims.iss ? String(claims.iss) : null,
    audience: claims.aud ? String(claims.aud) : null,
    email: claims.email ? "present" : null,
    algorithm: header.alg ? String(header.alg) : null,
  };
}

export function buildMinimalUserFromIdentity(identity, emailHint = null) {
  return {
    id: identity.userId,
    email: emailHint || null,
    role: identity.role || "authenticated",
    app_metadata: {},
    user_metadata: {},
  };
}

const COMPARE_FIELDS = ["userId", "sessionId", "role", "issuer", "audience"];

export function compareAuthIdentities(getUserIdentity, claimsIdentity) {
  const mismatches = [];

  if (!getUserIdentity?.userId || !claimsIdentity?.userId) {
    mismatches.push("missing_sub");
    return { parity: false, mismatches };
  }

  for (const field of COMPARE_FIELDS) {
    const a = getUserIdentity[field];
    const b = claimsIdentity[field];
    if (field === "sessionId") {
      if (a && b && a !== b) mismatches.push("session_id");
      continue;
    }
    if (String(a || "") !== String(b || "")) {
      mismatches.push(field);
    }
  }

  if (claimsIdentity.expiresAtMs && Date.now() >= claimsIdentity.expiresAtMs) {
    mismatches.push("expired");
  }

  return { parity: mismatches.length === 0, mismatches };
}

export function decodeJwtHeaderMeta(token) {
  try {
    const [h] = String(token || "").split(".");
    if (!h) return null;
    const header = JSON.parse(Buffer.from(h, "base64url").toString("utf8"));
    return { alg: header.alg || null, kid: header.kid || null, typ: header.typ || null };
  } catch {
    return null;
  }
}
