import crypto from "crypto";
import { hashSessionToken } from "./security-events.js";

/** In-memory fallback when DB table not yet migrated (tests + pre-migration). */
const memoryRevokedHashes = new Set();
const memoryUserGlobalRevokeAfter = new Map();

function timingSafeEqual(a, b) {
  if (!a || !b) return false;
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function clearMemoryRevocations() {
  memoryRevokedHashes.clear();
  memoryUserGlobalRevokeAfter.clear();
}

export async function revokeSessionToken(supabase, params) {
  const sessionIdHash = hashSessionToken(params.token);
  const userId = params.userId || null;
  const reason = String(params.reason || "force_logout").trim();
  const actorId = params.actorId || null;
  const now = new Date().toISOString();

  memoryRevokedHashes.add(sessionIdHash);
  if (userId) {
    memoryUserGlobalRevokeAfter.set(userId, Date.now());
  }

  try {
    await supabase.from("iam_session_revocations").insert({
      session_id_hash: sessionIdHash,
      user_id: userId,
      reason,
      revoked_by: actorId,
      revoked_at: now,
    });
  } catch {
    // table may not exist pre-migration
  }

  return { ok: true, sessionIdHash, revokedAt: now };
}

export async function revokeAllUserSessions(supabase, params) {
  const userId = params.userId;
  const actorId = params.actorId || null;
  const reason = String(params.reason || "force_logout_all").trim();
  const now = Date.now();

  memoryUserGlobalRevokeAfter.set(userId, now);

  try {
    await supabase.from("iam_user_session_revocations").upsert(
      {
        user_id: userId,
        force_logout_after: new Date(now).toISOString(),
        revoked_by: actorId,
        reason,
        updated_at: new Date(now).toISOString(),
      },
      { onConflict: "user_id" }
    );
  } catch {
    // table may not exist
  }

  if (supabase?.auth?.admin?.signOut) {
    try {
      await supabase.auth.admin.signOut(userId, "global");
    } catch {
      // non-blocking if SDK unavailable in test mocks
    }
  }

  return { ok: true, userId, forceLogoutAfter: now };
}

export async function isSessionRevoked(supabase, params) {
  const token = params.token;
  const userId = params.userId || null;
  const sessionIdHash = hashSessionToken(token);

  if (memoryRevokedHashes.has(sessionIdHash)) {
    return { revoked: true, reason: "token_hash_revoked" };
  }

  if (userId && memoryUserGlobalRevokeAfter.has(userId)) {
    const cutoff = memoryUserGlobalRevokeAfter.get(userId);
    const tokenIssuedAt = params.tokenIssuedAt || 0;
    if (!tokenIssuedAt || tokenIssuedAt <= cutoff) {
      return { revoked: true, reason: "global_force_logout" };
    }
  }

  try {
    const { data: row } = await supabase
      .from("iam_session_revocations")
      .select("id, reason")
      .eq("session_id_hash", sessionIdHash)
      .maybeSingle();
    if (row) return { revoked: true, reason: row.reason || "revoked" };
  } catch {
    // ignore
  }

  if (userId) {
    try {
      const { data: globalRow } = await supabase
        .from("iam_user_session_revocations")
        .select("force_logout_after")
        .eq("user_id", userId)
        .maybeSingle();
      if (globalRow?.force_logout_after) {
        const cutoffMs = new Date(globalRow.force_logout_after).getTime();
        const tokenIssuedAt = params.tokenIssuedAt || 0;
        if (!tokenIssuedAt || tokenIssuedAt <= cutoffMs) {
          return { revoked: true, reason: "global_force_logout" };
        }
      }
    } catch {
      // ignore
    }
  }

  return { revoked: false };
}

export function extractTokenIssuedAt(token) {
  if (!token) return 0;
  try {
    const parts = String(token).split(".");
    if (parts.length < 2) return 0;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return payload.iat ? payload.iat * 1000 : 0;
  } catch {
    return 0;
  }
}

export { timingSafeEqual };
