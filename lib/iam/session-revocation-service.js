import { createClient } from "@supabase/supabase-js";
import { REVOCATION_REASONS, reasonForAccountStatus } from "./revocation-reasons.js";
import { revokeSessionToken, revokeAllUserSessions } from "./session-revocation.js";
import { endAdminSessionLog } from "./session-log.js";
import { recordSecurityEvent } from "./security-events.js";
import { endAllActiveSessionLogsForUser } from "./session-log-lifecycle.js";

function readAuthEnv() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  };
}

/**
 * Best-effort Supabase local sign-out for current session only (not global).
 */
async function trySupabaseLocalSignOut(accessToken, refreshToken) {
  const { url, anonKey } = readAuthEnv();
  if (!url || !anonKey || !accessToken || !refreshToken) {
    return { ok: false, skipped: true };
  }

  try {
    const client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: sessionError } = await client.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (sessionError) {
      return { ok: false, error: sessionError.message };
    }
    const { error: signOutError } = await client.auth.signOut({ scope: "local" });
    if (signOutError) {
      return { ok: false, error: signOutError.message };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || "signout_failed" };
  }
}

/**
 * Revoke the current session only (normal logout).
 * IAM per-session revocation is authoritative; Supabase local sign-out is best-effort.
 */
export async function revokeCurrentSession(supabase, params) {
  const token = params.token;
  const userId = params.userId;
  const reason = params.reason || REVOCATION_REASONS.USER_LOGOUT;
  const result = {
    ok: true,
    iamRevoked: false,
    supabaseSignOut: null,
    sessionLogEnded: false,
  };

  if (!token) {
    return { ...result, ok: true, skipped: true };
  }

  const iam = await revokeSessionToken(supabase, {
    token,
    userId,
    actorId: userId,
    reason,
  });
  result.iamRevoked = Boolean(iam.ok);

  result.supabaseSignOut = await trySupabaseLocalSignOut(token, params.refreshToken);

  if (params.endSessionLog !== false && userId) {
    await endAdminSessionLog(supabase, {
      userId,
      token,
      reason,
    });
    result.sessionLogEnded = true;
  }

  await recordSecurityEvent(supabase, {
    eventType: "iam.session.logout",
    severity: "info",
    userId,
    details: {
      reason,
      iamRevoked: result.iamRevoked,
      supabaseSignOutOk: Boolean(result.supabaseSignOut?.ok),
      scope: "current_session",
    },
    request: params.request,
  });

  return result;
}

/**
 * Global user access revocation — force logout, ban, delete, suspend block paths.
 */
export async function revokeAllUserAccess(supabase, params) {
  const userId = String(params.userId || "").trim();
  const actorId = params.actorId || null;
  const reason = params.reason || REVOCATION_REASONS.ADMIN_FORCE_LOGOUT;

  if (!userId) {
    return { ok: false, error: "missing_user_id" };
  }

  const global = await revokeAllUserSessions(supabase, {
    userId,
    actorId,
    reason,
  });

  if (params.token) {
    await revokeSessionToken(supabase, {
      token: params.token,
      userId,
      actorId,
      reason,
    });
  }

  await endAllActiveSessionLogsForUser(supabase, {
    userId,
    reason,
    forcedBy: actorId,
  });

  await recordSecurityEvent(supabase, {
    eventType: "iam.session.global_revoke",
    severity: "warning",
    userId,
    details: {
      reason,
      actorId,
      scope: "all_sessions",
      forceLogoutAfter: global.forceLogoutAfter || null,
    },
    request: params.request,
  });

  return { ok: Boolean(global.ok), forceLogoutAfter: global.forceLogoutAfter, reason };
}

export async function revokeAccessForAccountStatus(supabase, params) {
  const status = String(params.accountStatus || "").trim().toLowerCase();
  return revokeAllUserAccess(supabase, {
    userId: params.userId,
    actorId: params.actorId,
    reason: params.reason || reasonForAccountStatus(status),
    request: params.request,
  });
}

export { REVOCATION_REASONS };
