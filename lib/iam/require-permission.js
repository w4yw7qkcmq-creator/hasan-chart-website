import { isIamApiEnabled } from "./feature-flags.js";
import { requireAdminSession } from "./require-admin-session.js";
import { iamContextCan } from "./resolve-permissions.js";
import { recordSecurityEvent } from "./security-events.js";
import { recordDeniedAudit } from "./audit.js";
import { verifyServiceIdentity } from "./service-identities.js";
import {
  hasActiveIamAssignment,
  assignmentRequiredResponse,
  resolverUnavailableResponse,
} from "./assignment-enforcement.js";

function forbiddenResult(error = "ليس لديك صلاحية لتنفيذ هذا الإجراء", iam = null) {
  return { ok: false, status: 403, error, code: "PERMISSION_DENIED", iam };
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
      hasActiveAssignment: Boolean(session.iam?.hasActiveAssignment),
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
 * IAM_API=false: legacy admin session gate (dual-read compatible).
 * IAM_API=true: active IAM assignment + permission required (fail-closed).
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

  if (session.iam?.resolverError || session.iam?.tableMissing) {
    return resolverUnavailableResponse(session.iam);
  }

  if (!hasActiveIamAssignment(session.iam)) {
    return assignmentRequiredResponse(session.iam);
  }

  if (session.iam?.source === "legacy_blocked" || session.iam?.source === "legacy") {
    return assignmentRequiredResponse(session.iam);
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
