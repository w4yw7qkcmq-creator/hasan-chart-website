import { getSupabaseAdmin } from "../auth-session.js";
import { verifyCronSecret } from "../admin-auth.js";
import { requireAdminPermission } from "../admin-auth.js";
import { verifyServiceIdentity } from "./service-identities.js";
import { isIamApiEnabled } from "./feature-flags.js";
import { recordSecurityEvent } from "./security-events.js";

/**
 * Machine-first auth: Cron / Service Identity only.
 * Does NOT accept human admin sessions.
 */
export async function requireMachineAuth(request, permission) {
  const perm = String(permission || "").trim();

  const serviceCheck = await verifyServiceIdentity(request, perm);
  if (serviceCheck.ok) {
    return { ...serviceCheck, authMode: "service" };
  }

  const cronCheck = verifyCronSecret(request);
  if (cronCheck.ok) {
    if (isIamApiEnabled()) {
      const retryService = await verifyServiceIdentity(request, perm);
      if (retryService.ok) {
        return { ...retryService, authMode: "cron_service" };
      }
      await recordSecurityEvent(null, {
        eventType: "iam.machine_auth.cron_rejected",
        severity: "warning",
        details: { permission: perm, reason: "service_account_not_configured" },
        request,
      });
      return {
        ok: false,
        status: 403,
        error: "Cron secret valid but service account not configured for IAM enforcement",
      };
    }

    return {
      ok: true,
      authMode: "cron_legacy",
      actorType: "service",
      serviceAccountId: "cron",
      permission: perm,
      supabase: getSupabaseAdmin(),
    };
  }

  if (cronCheck.status === 503) {
    return cronCheck;
  }

  return { ok: false, status: 401, error: "Unauthorized machine request" };
}

/**
 * Human admin OR machine auth — never grants admin full access via cron path.
 */
export async function requireMachineOrAdminPermission(request, permission) {
  const perm = String(permission || "").trim();
  if (!perm) {
    return { ok: false, status: 403, error: "صلاحية غير محددة" };
  }

  const hasMachineAttempt = Boolean(
    request.headers.get("authorization") ||
      request.headers.get("x-cron-secret") ||
      request.headers.get("x-service-account-id") ||
      request.headers.get("x-iam-service-id")
  );

  const machine = await requireMachineAuth(request, perm);
  if (machine.ok) {
    return machine;
  }

  if (hasMachineAttempt) {
    return machine;
  }

  return requireAdminPermission(perm, { request });
}
