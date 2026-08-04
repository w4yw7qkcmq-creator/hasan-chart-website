import { hashSessionToken } from "./security-events.js";
import { revokeAllUserSessions, revokeSessionToken } from "./session-revocation.js";
import { recordSecurityEvent } from "./security-events.js";

export async function startAdminSessionLog(supabase, params) {
  const sessionIdHash = hashSessionToken(params.token);
  const row = {
    user_id: params.userId,
    session_id_hash: sessionIdHash,
    ip_address: params.ipAddress || null,
    user_agent: params.userAgent || null,
    is_admin_session: Boolean(params.isAdminSession),
    role_ids: params.roleIds || [],
    organization_id: params.organizationId || null,
    metadata: params.metadata || {},
  };

  try {
    const { data, error } = await supabase
      .from("iam_session_logs")
      .insert(row)
      .select("id")
      .maybeSingle();
    if (error && !/relation .* does not exist/i.test(error.message || "")) {
      console.warn("iam_session_logs start warning:", error.message);
    }
    return { ok: true, sessionLogId: data?.id || null, sessionIdHash };
  } catch (err) {
    console.warn("iam_session_logs start skipped:", err?.message || err);
    return { ok: false };
  }
}

export async function endAdminSessionLog(supabase, params) {
  const sessionIdHash = hashSessionToken(params.token);
  try {
    await supabase
      .from("iam_session_logs")
      .update({
        ended_at: new Date().toISOString(),
        end_reason: params.reason || "logout",
      })
      .eq("user_id", params.userId)
      .eq("session_id_hash", sessionIdHash)
      .is("ended_at", null);
  } catch {
    // non-blocking
  }
}

export async function touchAdminSessionActivity(supabase, params) {
  const sessionIdHash = hashSessionToken(params.token);
  try {
    await supabase
      .from("iam_session_logs")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("user_id", params.userId)
      .eq("session_id_hash", sessionIdHash)
      .is("ended_at", null);
  } catch {
    // non-blocking
  }
}

export async function forceLogoutSession(supabase, params) {
  const { userId, sessionLogId, actorId, reason, token } = params;

  await recordSecurityEvent(supabase, {
    eventType: "iam.session.force_logout",
    severity: "warning",
    userId,
    details: { sessionLogId, actorId, reason },
    request: params.request,
  });

  if (sessionLogId) {
    try {
      await supabase
        .from("iam_session_logs")
        .update({
          ended_at: new Date().toISOString(),
          end_reason: reason || "force_logout",
          forced_by: actorId || null,
        })
        .eq("id", sessionLogId)
        .eq("user_id", userId);
    } catch {
      // non-blocking
    }
  }

  if (token) {
    await revokeSessionToken(supabase, {
      token,
      userId,
      actorId,
      reason: reason || "force_logout",
    });
  }

  const global = await revokeAllUserSessions(supabase, {
    userId,
    actorId,
    reason: reason || "force_logout",
  });

  return { ok: global.ok, error: global.error };
}

export async function listAdminSessions(supabase, options = {}) {
  const limit = Math.min(Number(options.limit) || 50, 200);
  let query = supabase
    .from("iam_session_logs")
    .select("id, user_id, session_id_hash, started_at, ended_at, end_reason, is_admin_session, last_activity_at")
    .order("started_at", { ascending: false })
    .limit(limit);

  if (options.userId) query = query.eq("user_id", options.userId);
  if (options.activeOnly) query = query.is("ended_at", null);

  const { data, error } = await query;
  if (error) {
    if (/relation .* does not exist/i.test(error.message || "")) {
      return { sessions: [], tableMissing: true };
    }
    throw error;
  }
  return { sessions: data || [], tableMissing: false };
}

export async function closeExpiredSessions(supabase, options = {}) {
  const maxAgeMs = Number(options.maxAgeMs) || 24 * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();

  try {
    await supabase
      .from("iam_session_logs")
      .update({ ended_at: new Date().toISOString(), end_reason: "expired" })
      .is("ended_at", null)
      .lt("last_activity_at", cutoff);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
