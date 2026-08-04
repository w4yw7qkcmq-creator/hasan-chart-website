import { cookies } from "next/headers";
import { getSupabaseAdmin } from "../auth-session.js";
import { resolveIamContext } from "./resolve-permissions.js";
import { IAM_DEFAULT_ORGANIZATION_ID } from "./constants.js";
import { isSessionRevoked, extractTokenIssuedAt } from "./session-revocation.js";
import { touchAdminSessionActivity } from "./session-log.js";

/**
 * Authentication-only: validates session cookie → Supabase user.
 * Does NOT check admin status.
 */
export async function requireAuthenticatedSession() {
  const supabase = getSupabaseAdmin();
  const cookieStore = await cookies();
  const token = cookieStore.get("hc_access_token")?.value;

  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "يجب تسجيل الدخول أولاً",
    };
  }

  const revocation = await isSessionRevoked(supabase, {
    token,
    tokenIssuedAt: extractTokenIssuedAt(token),
  });

  if (revocation.revoked) {
    return {
      ok: false,
      status: 401,
      error: "تم إنهاء الجلسة",
      revoked: true,
      revokeReason: revocation.reason,
    };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return {
      ok: false,
      status: 401,
      error: "جلسة غير صالحة",
    };
  }

  const userRevocation = await isSessionRevoked(supabase, {
    token,
    userId: user.id,
    tokenIssuedAt: extractTokenIssuedAt(token),
  });

  if (userRevocation.revoked) {
    return {
      ok: false,
      status: 401,
      error: "تم إنهاء الجلسة",
      revoked: true,
      revokeReason: userRevocation.reason,
    };
  }

  return { ok: true, user, supabase, token };
}

/**
 * Admin session: authenticated user + IAM context resolved (includes dual-read legacy).
 */
export async function requireAdminSession(options = {}) {
  const auth = await requireAuthenticatedSession();
  if (!auth.ok) return auth;

  const organizationId = options.organizationId || IAM_DEFAULT_ORGANIZATION_ID;
  let iam;
  try {
    iam = await resolveIamContext(auth.supabase, auth.user, { organizationId });
  } catch (err) {
    iam = {
      isAdmin: false,
      resolverError: err?.message || "resolver_failed",
      permissions: new Set(),
      roleIds: [],
    };
  }

  if (!iam.isAdmin) {
    return {
      ok: false,
      status: 403,
      error: "غير مصرح لك بالدخول",
      user: auth.user,
      supabase: auth.supabase,
      iam,
    };
  }

  if (options.touchSession !== false && auth.token) {
    await touchAdminSessionActivity(auth.supabase, {
      token: auth.token,
      userId: auth.user.id,
    });
  }

  return {
    ok: true,
    user: auth.user,
    supabase: auth.supabase,
    token: auth.token,
    iam,
    actorType: "user",
  };
}
