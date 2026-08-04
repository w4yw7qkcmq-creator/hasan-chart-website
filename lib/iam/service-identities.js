import { isIamApiEnabled, isIamDbEnabled, getIamFeatureFlags, validateIamFlagCombination } from "./feature-flags.js";
import { computeEffectivePermissions } from "./resolve-permissions.js";
import { getSupabaseAdmin } from "../auth-session.js";
import { verifyCronSecret } from "../admin-auth.js";
import { IAM_SERVICE_ACCOUNTS } from "./constants.js";
import {
  hashServiceSecret,
  verifyServiceSecret,
  isServiceAccountConfigured,
  recordServiceAccountUse,
} from "./service-accounts.js";

/**
 * Verify service account via x-service-account-id + x-service-account-secret headers,
 * or legacy CRON_SECRET mapped to cron service account (dual-mode).
 */
export async function verifyServiceIdentity(request, requiredPermission) {
  const supabase = getSupabaseAdmin();
  const serviceAccountId =
    request.headers.get("x-service-account-id")?.trim() ||
    request.headers.get("x-iam-service-id")?.trim() ||
    "";

  const providedSecret =
    request.headers.get("x-service-account-secret")?.trim() ||
    request.headers.get("x-iam-service-secret")?.trim() ||
    "";

  if (serviceAccountId && providedSecret) {
    return resolveServiceAccountAccess(
      supabase,
      serviceAccountId,
      requiredPermission,
      providedSecret,
      { via: "service_headers", request }
    );
  }

  const cronCheck = verifyCronSecret(request);
  if (cronCheck.ok) {
    if (!isIamApiEnabled()) {
      return resolveLegacyCronAccess(supabase, requiredPermission);
    }

    return resolveServiceAccountAccess(
      supabase,
      IAM_SERVICE_ACCOUNTS.CRON,
      requiredPermission,
      request.headers.get("x-cron-secret")?.trim() ||
        request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
        "",
      { via: "cron_secret", request, cronMapped: true }
    );
  }

  return { ok: false };
}

async function resolveLegacyCronAccess(supabase, requiredPermission) {
  const perm = String(requiredPermission || "").trim();
  return {
    ok: true,
    actorType: "service",
    serviceAccountId: IAM_SERVICE_ACCOUNTS.CRON,
    supabase,
    iam: {
      isAdmin: false,
      isSuperAdmin: false,
      permissions: new Set(perm ? [perm] : []),
      roleIds: [`service:${IAM_SERVICE_ACCOUNTS.CRON}`],
      source: "legacy_cron",
    },
    via: "cron_secret",
    permission: perm,
  };
}

async function resolveServiceAccountAccess(
  supabase,
  serviceAccountId,
  requiredPermission,
  providedSecret,
  meta = {}
) {
  const perm = String(requiredPermission || "").trim();

  try {
    const { data: account, error } = await supabase
      .from("iam_service_accounts")
      .select("id, label, secret_hash, enabled, revoked_at, organization_id")
      .eq("id", serviceAccountId)
      .maybeSingle();

    if (error || !account) {
      if (meta.cronMapped && !isIamApiEnabled()) {
        return resolveLegacyCronAccess(supabase, perm);
      }
      return { ok: false, status: 401, error: "Service account not found" };
    }

    if (!isServiceAccountConfigured(account)) {
      if (meta.cronMapped && !isIamApiEnabled()) {
        return resolveLegacyCronAccess(supabase, perm);
      }
      return {
        ok: false,
        status: 403,
        error: "Service account not configured",
      };
    }

    if (!verifyServiceSecret(providedSecret, account.secret_hash, serviceAccountId)) {
      return { ok: false, status: 401, error: "Invalid service account secret" };
    }

    const access = await loadServicePermissions(supabase, serviceAccountId, perm);
    if (!access.ok) return access;

    const ip =
      meta.request?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      meta.request?.headers?.get("x-real-ip") ||
      null;

    await recordServiceAccountUse(supabase, {
      accountId: serviceAccountId,
      ipAddress: ip,
    });

    return {
      ok: true,
      actorType: "service",
      serviceAccountId,
      supabase,
      iam: {
        isAdmin: false,
        isSuperAdmin: false,
        permissions: access.effective,
        roleIds: [`service:${serviceAccountId}`],
        source: "service",
      },
      via: meta.via,
      permission: perm,
    };
  } catch {
    if (meta.cronMapped && !isIamApiEnabled()) {
      return resolveLegacyCronAccess(supabase, perm);
    }
    return { ok: false, status: 503, error: "Service identity check failed" };
  }
}

async function loadServicePermissions(supabase, serviceAccountId, requiredPermission) {
  const { data: perms } = await supabase
    .from("iam_service_account_permissions")
    .select("permission_id, effect")
    .eq("service_account_id", serviceAccountId);

  const allow = new Set();
  const deny = new Set();
  for (const row of perms || []) {
    const effect = String(row.effect || "allow").toLowerCase();
    if (effect === "deny") deny.add(row.permission_id);
    else allow.add(row.permission_id);
  }

  const effective = computeEffectivePermissions(allow, deny);
  const perm = String(requiredPermission || "").trim();

  if (perm && !effective.has(perm)) {
    return { ok: false, status: 403, error: "Service account lacks permission" };
  }

  return { ok: true, effective };
}

export { hashServiceSecret as hashServiceAccountSecret };
