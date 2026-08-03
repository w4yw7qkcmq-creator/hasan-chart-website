import { createClient } from "@supabase/supabase-js";
import { isIamApiEnabled, isIamUiEnabled } from "./feature-flags.js";
import { permissionForAdminPage } from "./page-permissions.js";
import { resolveIamContext, iamContextCan } from "./resolve-permissions.js";
import { isSessionRevoked, extractTokenIssuedAt } from "./session-revocation.js";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.STAGING_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Edge-safe admin page access check for middleware.
 * @returns {{ action: 'allow'|'redirect_login'|'forbidden', status?: number, reason?: string }}
 */
export async function checkAdminPageAccess(request, pathname) {
  const token = request.cookies.get("hc_access_token")?.value;
  if (!token) {
    return { action: "redirect_login", status: 401, reason: "unauthenticated" };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { action: "allow", reason: "supabase_unconfigured" };
  }

  const revocation = await isSessionRevoked(supabase, {
    token,
    tokenIssuedAt: extractTokenIssuedAt(token),
  });
  if (revocation.revoked) {
    return { action: "redirect_login", status: 401, reason: "session_revoked" };
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return { action: "redirect_login", status: 401, reason: "invalid_session" };
  }

  let iam;
  try {
    iam = await resolveIamContext(supabase, user);
  } catch {
    if (isIamApiEnabled()) {
      return { action: "forbidden", status: 503, reason: "resolver_failed" };
    }
    return { action: "forbidden", status: 403, reason: "not_admin" };
  }

  if (!iam.isAdmin) {
    return { action: "forbidden", status: 403, reason: "not_admin" };
  }

  if (isIamApiEnabled() && isIamUiEnabled()) {
    const permission = permissionForAdminPage(pathname);
    if (!permission) {
      return { action: "forbidden", status: 403, reason: "unmapped_page" };
    }
    if (!iamContextCan(iam, permission)) {
      return { action: "forbidden", status: 403, reason: "missing_permission", permission };
    }
  }

  return { action: "allow", userId: user.id };
}
