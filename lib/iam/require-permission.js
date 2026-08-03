import { isIamApiEnabled, isIamDbEnabled } from "./feature-flags.js";
import { requireAdminSession } from "./require-admin-session.js";
import { iamContextCan } from "./resolve-permissions.js";
import { recordSecurityEvent } from "./security-events.js";
import { recordDeniedAudit } from "./audit.js";
import { verifyServiceIdentity } from "./service-identities.js";

function forbiddenResult(error = "ليس لديك صلاحية لتنفيذ هذا الإجراء", iam = null) {
  return { ok: false, status: 403, error, iam };
}

function resolverUnavailableResult() {
  return {
    ok: false,
    status: 503,
    error: "IAM permission resolver unavailable",
  };
}

async function logDenied(session, permission, options) {
  if (options.__skipDenyLog) return;

  await recordSecurityEvent(session.supabase, {
    eventType: "iam.permission_denied",
    severity: "warning",
    userId: session.user?.id,
    details: {
      permission,
      roleIds: session.iam?.roleIds || [],
      source: session.iam?.source,
    },
    request: options.request,
  });

  await recordDeniedAudit(session.supabase, {
    actorId: session.user?.id,
    actorEmail: session.user?.email,
    permission,
    metadata: {
      roleIds: session.iam?.roleIds || [],
      source: session.iam?.source,
    },
    request: options.request,
  });
}

/**
 * Primary authorization entry for admin API routes.
 * Dual mode: when IAM_API off, falls back to legacy admin session only.
 * When IAM_API on: fail-closed if DB resolver unavailable.
 */
export async function requirePermission(permission, options = {}) {
  const perm = String(permission || "").trim();
  if (!perm) {
    return forbiddenResult("صلاحية غير محددة");
  }

  if (options.request) {
    const serviceCheck = await verifyServiceIdentity(options.request, perm);
    if (serviceCheck.ok) {
      return serviceCheck;
    }
  }

  const session = await requireAdminSession(options);
  if (!session.ok) {
    return session;
  }

  if (!isIamApiEnabled()) {
    return { ...session, permission: perm };
  }

  if (session.iam?.resolverError) {
    return resolverUnavailableResult();
  }

  if (isIamApiEnabled() && isIamDbEnabled() && session.iam?.source === "legacy" && !session.iam?.tableMissing) {
    // IAM enabled but user only has legacy — still evaluate legacy permissions via iam context
  }

  if (!iamContextCan(session.iam, perm)) {
    await logDenied(session, perm, options);
    return forbiddenResult("ليس لديك صلاحية لتنفيذ هذا الإجراء", session.iam);
  }

  return { ...session, permission: perm };
}

export async function requireAnyPermission(permissions, options = {}) {
  const list = (permissions || []).map((p) => String(p || "").trim()).filter(Boolean);
  if (!list.length) {
    return forbiddenResult("صلاحية غير محددة");
  }

  for (const perm of list) {
    const result = await requirePermission(perm, { ...options, __skipDenyLog: true });
    if (result.ok) return result;
  }

  const session = await requireAdminSession(options);
  if (session.ok) {
    await logDenied(session, list.join(","), options);
  }

  return forbiddenResult("ليس لديك صلاحية لتنفيذ هذا الإجراء", session.iam);
}

import { permissionForLifecycleAction } from "./action-permissions.js";

export { permissionForLifecycleAction };

export async function requirePermissionForAction(action, options = {}) {
  return requirePermission(permissionForLifecycleAction(action), options);
}
