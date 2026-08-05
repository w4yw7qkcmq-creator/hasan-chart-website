import { getSupabaseAdmin } from "../auth-session.js";
import { verifyCronSecret, requireAdminPermission } from "../admin-auth.js";
import { verifyServiceIdentity } from "./service-identities.js";
import { isIamApiEnabled } from "./feature-flags.js";
import { recordSecurityEvent } from "./security-events.js";
import {
  getMachineAuthMetricsSnapshot,
  recordCrossServiceRejected,
  recordLegacyAuthAttempt,
  recordLegacyAuthRejected,
  recordMachineAuthSuccess,
  recordMissingMachineHeaders,
} from "./machine-auth-metrics.js";

function hasMachineHeaders(request) {
  return Boolean(
    request.headers.get("x-service-account-id")?.trim() ||
      request.headers.get("x-iam-service-id")?.trim() ||
      request.headers.get("x-service-account-secret")?.trim() ||
      request.headers.get("x-iam-service-secret")?.trim()
  );
}

function hasLegacyCronAttempt(request) {
  return Boolean(
    request.headers.get("authorization")?.trim() || request.headers.get("x-cron-secret")?.trim()
  );
}

/**
 * Machine-first auth: Cron / Service Identity only.
 * Does NOT accept human admin sessions.
 */
export async function requireMachineAuth(request, permission) {
  const perm = String(permission || "").trim();
  const iamApiEnabled = isIamApiEnabled();

  const serviceCheck = await verifyServiceIdentity(request, perm);
  if (serviceCheck.ok) {
    recordMachineAuthSuccess(serviceCheck.serviceAccountId);
    return { ...serviceCheck, authMode: "service" };
  }

  if (hasMachineHeaders(request)) {
    if (serviceCheck.status === 403) {
      recordCrossServiceRejected();
    }
    return {
      ok: false,
      status: serviceCheck.status || 401,
      error: serviceCheck.error || "Unauthorized machine request",
    };
  }

  if (iamApiEnabled) {
    if (hasLegacyCronAttempt(request)) {
      recordLegacyAuthAttempt();
      recordLegacyAuthRejected();
      await recordSecurityEvent(null, {
        eventType: "iam.machine_auth.legacy_rejected",
        severity: "warning",
        details: { permission: perm, reason: "legacy_cron_denied_when_iam_api_enabled" },
        request,
      });
    } else {
      recordMissingMachineHeaders();
    }

    return { ok: false, status: 403, error: "Service account headers required when IAM_API is enabled" };
  }

  const cronCheck = verifyCronSecret(request);
  if (cronCheck.ok) {
    recordLegacyAuthAttempt();
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

  if (hasLegacyCronAttempt(request)) {
    recordLegacyAuthRejected();
  } else {
    recordMissingMachineHeaders();
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

  const hasMachineAttempt = hasMachineHeaders(request) || hasLegacyCronAttempt(request);
  const machine = await requireMachineAuth(request, perm);
  if (machine.ok) {
    return machine;
  }

  if (hasMachineAttempt) {
    return machine;
  }

  return requireAdminPermission(perm, { request });
}

export { getMachineAuthMetricsSnapshot };
