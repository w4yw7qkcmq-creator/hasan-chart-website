import {
  applyTimestampIdCursor,
  buildSessionPaginationResult,
  IAM_LIST_LIMITS,
  mapSessionListRow,
} from "./list-api-helpers.js";
import { IAM_SESSION_DETAIL_COLUMNS, IAM_SESSION_LIST_COLUMNS } from "./list-columns.js";
import { maskIp } from "./ui-utils.js";
import { revokeAllUserSessions, revokeSessionToken } from "./session-revocation.js";
import { recordSecurityEvent, hashSessionToken } from "./security-events.js";

const DEFAULT_TOUCH_STALE_SECONDS = 45;

function readTouchStaleSeconds() {
  const raw = Number(process.env.IAM_SESSION_TOUCH_STALE_SECONDS);
  if (Number.isFinite(raw) && raw >= 15 && raw <= 300) return Math.round(raw);
  return DEFAULT_TOUCH_STALE_SECONDS;
}

async function legacyTouchAdminSessionActivity(supabase, params) {
  const sessionIdHash = hashSessionToken(params.token);
  await supabase
    .from("iam_session_logs")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("user_id", params.userId)
    .eq("session_id_hash", sessionIdHash)
    .is("ended_at", null);
  return { touched: true, throttled: false, found: true, path: "legacy_update" };
}

/**
 * Throttled session activity touch — DB conditional UPDATE via RPC when available.
 * Non-blocking on failure; does not affect authorization.
 */
export async function touchAdminSessionActivity(supabase, params) {
  const sessionIdHash = hashSessionToken(params.token);
  const staleSeconds = params.staleSeconds ?? readTouchStaleSeconds();
  const startedAt = Date.now();

  try {
    const { data, error } = await supabase.rpc("touch_admin_session_activity_if_stale", {
      p_user_id: params.userId,
      p_session_id_hash: sessionIdHash,
      p_stale_seconds: staleSeconds,
    });

    if (error) {
      if (/function .* does not exist/i.test(error.message || "")) {
        const legacy = await legacyTouchAdminSessionActivity(supabase, params);
        return { ...legacy, touchMs: Date.now() - startedAt };
      }
      console.warn("iam_session touch warning:", error.message);
      return { touched: false, throttled: false, found: false, error: error.message, touchMs: Date.now() - startedAt };
    }

    return {
      touched: Boolean(data?.touched),
      throttled: Boolean(data?.throttled),
      found: Boolean(data?.found),
      path: "rpc",
      touchMs: Date.now() - startedAt,
    };
  } catch (err) {
    console.warn("iam_session touch skipped:", err?.message || err);
    return {
      touched: false,
      throttled: false,
      found: false,
      error: err?.message || "touch_failed",
      touchMs: Date.now() - startedAt,
    };
  }
}

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
  const limits = IAM_LIST_LIMITS.sessions;
  const limit = Math.min(Number(options.limit) || limits.defaultLimit, limits.maxLimit);
  const fetchLimit = limit + 1;

  if (options.id) {
    const columns = options.includeMetadata ? IAM_SESSION_DETAIL_COLUMNS : IAM_SESSION_LIST_COLUMNS;
    const { data, error } = await supabase
      .from("iam_session_logs")
      .select(columns)
      .eq("id", options.id)
      .limit(1);

    if (error) {
      if (/relation .* does not exist/i.test(error.message || "")) {
        return { session: null, tableMissing: true };
      }
      throw error;
    }

    return { session: data?.[0] || null, tableMissing: false };
  }

  const columns = IAM_SESSION_LIST_COLUMNS;
  let query = supabase
    .from("iam_session_logs")
    .select(columns, options.includeTotal ? { count: "exact" } : undefined)
    .order("last_activity_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false });

  if (options.userId) query = query.eq("user_id", options.userId);
  if (options.activeOnly) query = query.is("ended_at", null);

  query = applyTimestampIdCursor(query, options.cursor, "last_activity_at");
  query = query.limit(fetchLimit);

  const { data, error, count } = await query;
  if (error) {
    if (/relation .* does not exist/i.test(error.message || "")) {
      return {
        items: [],
        sessions: [],
        pagination: { limit, hasMore: false, nextCursor: null },
        tableMissing: true,
      };
    }
    throw error;
  }

  const { items, pagination } = buildSessionPaginationResult(data || [], limit);
  const mapped = items.map(mapSessionListRow);

  if (options.includeTotal && typeof count === "number") {
    pagination.total = count;
  }

  return {
    items: mapped,
    sessions: mapped,
    pagination,
    tableMissing: false,
  };
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
