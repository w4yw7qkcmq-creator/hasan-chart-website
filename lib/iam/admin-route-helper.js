import { IAM_PERMISSIONS } from "./constants.js";
import { requirePermission } from "./require-permission.js";

/**
 * Standard JSON error response for failed admin auth.
 */
export function iamAuthErrorResponse(check) {
  return Response.json(
    { success: false, error: check.error || "غير مصرح" },
    { status: check.status || 403 }
  );
}

/**
 * Wrap admin route handlers with permission check.
 * Returns { ok, check } or { ok: false, response }.
 */
export async function adminRouteAuth(permission, request) {
  const perm = permission || IAM_PERMISSIONS.DASHBOARD_READ;
  const check = await requirePermission(perm, { request });
  if (!check.ok) {
    return { ok: false, response: iamAuthErrorResponse(check), check };
  }
  return { ok: true, check };
}

/** Map verifyAdminSession shape for backward compatibility. */
export function toLegacyAdminCheck(iamCheck) {
  if (!iamCheck?.ok) return iamCheck;
  return {
    ok: true,
    user: iamCheck.user,
    supabase: iamCheck.supabase,
    iam: iamCheck.iam,
  };
}
