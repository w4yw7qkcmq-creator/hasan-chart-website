import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireAuthenticatedSession } from "./require-admin-session.js";
import { resolveIamContext, iamContextCan } from "./resolve-permissions.js";
import { isIamApiEnabled, isIamUiEnabled } from "./feature-flags.js";
import { permissionForAdminPage } from "./page-permissions.js";

function buildLoginRedirect(pathname) {
  const safePath = String(pathname || "/admin").split("?")[0];
  return `/login?returnUrl=${encodeURIComponent(safePath)}`;
}

function buildForbiddenRedirect(options = {}) {
  const params = new URLSearchParams();
  if (options.from) params.set("from", options.from);
  if (options.requestId) params.set("rid", options.requestId);
  const qs = params.toString();
  return qs ? `/forbidden?${qs}` : "/forbidden";
}

/**
 * Server-side admin page authorization.
 * Fail-closed when IAM_API is active; page permission enforced when IAM_UI is active.
 */
export async function requireIamPageAccess(pathname, options = {}) {
  const targetPath = String(pathname || options.pathname || "/admin");
  const auth = await requireAuthenticatedSession();

  if (!auth.ok) {
    if (options.redirect !== false) {
      redirect(buildLoginRedirect(targetPath));
    }
    return { ok: false, status: auth.status || 401, reason: "unauthenticated", error: auth.error };
  }

  let iam;
  try {
    iam = await resolveIamContext(auth.supabase, auth.user);
  } catch (err) {
    if (isIamApiEnabled()) {
      if (options.redirect !== false) {
        redirect(buildForbiddenRedirect({ from: "admin" }));
      }
      return {
        ok: false,
        status: 503,
        reason: "resolver_failed",
        error: err?.message || "IAM resolver failed",
      };
    }
    iam = { isAdmin: false, permissions: new Set(), roleIds: [] };
  }

  if (!iam.isAdmin) {
    if (options.redirect !== false) {
      redirect(buildForbiddenRedirect({ from: "admin" }));
    }
    return { ok: false, status: 403, reason: "not_admin", error: "غير مصرح لك بالدخول" };
  }

  const pagePermission = options.permission || permissionForAdminPage(targetPath);

  if (isIamApiEnabled() && isIamUiEnabled()) {
    if (!pagePermission) {
      if (options.redirect !== false) {
        redirect(buildForbiddenRedirect({ from: "admin" }));
      }
      return {
        ok: false,
        status: 403,
        reason: "unmapped_page",
        error: "مسار إداري غير معرّف في مصفوفة الصلاحيات",
      };
    }

    if (!iamContextCan(iam, pagePermission)) {
      if (options.redirect !== false) {
        redirect(buildForbiddenRedirect({ from: "admin" }));
      }
      return {
        ok: false,
        status: 403,
        reason: "missing_permission",
        permission: pagePermission,
        error: "لا تملك الصلاحية المطلوبة للوصول إلى هذا القسم",
      };
    }
  }

  return {
    ok: true,
    user: auth.user,
    supabase: auth.supabase,
    iam,
    permission: pagePermission,
  };
}

export async function requireIamPagePermission(permission, options = {}) {
  const headerStore = await headers();
  const pathname =
    options.pathname ||
    headerStore.get("x-pathname") ||
    headerStore.get("x-admin-pathname") ||
    "/admin";

  return requireIamPageAccess(pathname, {
    ...options,
    permission: permission || permissionForAdminPage(pathname),
  });
}
