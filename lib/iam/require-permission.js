import { permissionForLifecycleAction } from "./action-permissions.js";
import { isIamApiEnabled } from "./feature-flags.js";
import { requireAdminSession } from "./require-admin-session.js";
import { iamContextCan } from "./resolve-permissions.js";
import { recordSecurityEvent } from "./security-events.js";
import { recordDeniedAudit } from "./audit.js";
import { verifyServiceIdentity } from "./service-identities.js";
import {
  guardAdminApiRateLimit,
  adminRateLimitDeniedResult,
  shouldApplyAdminRateLimit,
} from "../admin-rate-limit.js";
import {
  hasActiveIamAssignment,
  assignmentRequiredResponse,
  resolverUnavailableResponse,
} from "./assignment-enforcement.js";
import {
  getRequestIamStore,
  logRequestIamTimings,
  rateLimitCacheKey,
  memoizeRequestPromise,
} from "./request-context.js";

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

async function applyAdminRateLimitOnce(request, session) {
  if (!request || !shouldApplyAdminRateLimit(request)) {
    return { success: true };
  }

  const store = await getRequestIamStore();
  const kind = classifyRequestKind(request);
  const key = rateLimitCacheKey(request, kind);

  return memoizeRequestPromise(store, store.rateLimitPromises, key, async () => {
    const startedAt = Date.now();
    const rateResult = await guardAdminApiRateLimit(request, session);
    store.timings.rateLimitMs = (store.timings.rateLimitMs || 0) + (Date.now() - startedAt);
    return rateResult;
  });
}

function classifyRequestKind(request) {
  const method = String(request?.method || "GET").toUpperCase();
  return method === "GET" || method === "HEAD" ? "read" : "write";
}

async function checkPermissionOnSession(session, perm, options = {}) {
  if (!isIamApiEnabled()) {
    return { ok: true, session, permission: perm };
  }

  if (session.iam?.resolverError || session.iam?.tableMissing) {
    return { ok: false, result: resolverUnavailableResponse(session.iam) };
  }

  if (!hasActiveIamAssignment(session.iam)) {
    return { ok: false, result: assignmentRequiredResponse(session.iam) };
  }

  if (session.iam?.source === "legacy_blocked" || session.iam?.source === "legacy") {
    return { ok: false, result: assignmentRequiredResponse(session.iam) };
  }

  if (!iamContextCan(session.iam, perm)) {
    await logDenied(session, perm, options);
    return {
      ok: false,
      result: forbiddenResult("ليس لديك صلاحية لتنفيذ هذا الإجراء", session.iam),
    };
  }

  return { ok: true, session, permission: perm };
}

async function finalizeAuthorizedSession(session, perm, options) {
  if (!isIamApiEnabled()) {
    if (options.request) {
      const rateResult = await applyAdminRateLimitOnce(options.request, session);
      if (!rateResult.success) {
        console.info("ADMIN_RATE_LIMIT_READ", {
          kind: rateResult.kind,
          layer: rateResult.layer,
          scope: rateResult.scope,
        });
        return adminRateLimitDeniedResult(rateResult);
      }
    }
    return { ...session, permission: perm };
  }

  if (options.request) {
    const rateResult = await applyAdminRateLimitOnce(options.request, session);
    if (!rateResult.success) {
      console.info("ADMIN_RATE_LIMIT_READ", {
        kind: rateResult.kind,
        layer: rateResult.layer,
        scope: rateResult.scope,
      });
      return adminRateLimitDeniedResult(rateResult);
    }
  }

  return { ...session, permission: perm };
}

async function evaluatePermissionOnSession(session, perm, options) {
  const checked = await checkPermissionOnSession(session, perm, options);
  if (!checked.ok) return checked.result;
  return finalizeAuthorizedSession(session, perm, options);
}

async function resolveHumanAdminSession(options = {}) {
  if (options.request) {
    const serviceCheck = await verifyServiceIdentity(options.request, options.__servicePerm || "");
    if (serviceCheck.ok) {
      return serviceCheck;
    }
  }

  return requireAdminSession(options);
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

  const result = await evaluatePermissionOnSession(session, perm, options);
  if (options.request) {
    const store = await getRequestIamStore();
    logRequestIamTimings(store, { route: new URL(options.request.url).pathname, permission: perm });
  }
  return result;
}

export async function requireAnyPermission(permissions, options = {}) {
  const list = (permissions || []).map((p) => String(p || "").trim()).filter(Boolean);
  if (!list.length) {
    return forbiddenResult("صلاحية غير محددة");
  }

  const session = await resolveHumanAdminSession(options);
  if (!session.ok) {
    return session;
  }

  if (session.actorType === "service") {
    return session;
  }

  for (const perm of list) {
    const checked = await checkPermissionOnSession(session, perm, {
      ...options,
      __skipDenyLog: true,
    });
    if (checked.ok) {
      const result = await finalizeAuthorizedSession(session, perm, options);
      if (options.request) {
        const store = await getRequestIamStore();
        logRequestIamTimings(store, {
          route: new URL(options.request.url).pathname,
          permission: perm,
          mode: "any",
        });
      }
      return { ...result, permission: perm };
    }
    if (checked.result?.code === "PERMISSION_DENIED") {
      continue;
    }
    return checked.result;
  }

  await logDenied(session, list.join(","), options);
  return forbiddenResult("ليس لديك صلاحية لتنفيذ هذا الإجراء", session.iam);
}

export async function requireAllPermissions(permissions, options = {}) {
  const list = (permissions || []).map((p) => String(p || "").trim()).filter(Boolean);
  if (!list.length) {
    return forbiddenResult("صلاحية غير محددة");
  }

  const session = await resolveHumanAdminSession(options);
  if (!session.ok) {
    return session;
  }

  if (session.actorType === "service") {
    return session;
  }

  for (const perm of list) {
    const checked = await checkPermissionOnSession(session, perm, {
      ...options,
      __skipDenyLog: true,
    });
    if (!checked.ok) {
      await logDenied(session, list.join("+"), options);
      return checked.result;
    }
  }

  const finalResult = await finalizeAuthorizedSession(session, list[list.length - 1], options);

  if (options.request) {
    const store = await getRequestIamStore();
    logRequestIamTimings(store, {
      route: new URL(options.request.url).pathname,
      permissions: list,
      mode: "all",
    });
  }

  return { ...finalResult, permissions: list };
}

export { permissionForLifecycleAction };

export async function requirePermissionForAction(action, options = {}) {
  return requirePermission(permissionForLifecycleAction(action), options);
}
