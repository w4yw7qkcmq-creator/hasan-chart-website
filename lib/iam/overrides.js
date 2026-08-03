import { IAM_DEFAULT_ORGANIZATION_ID, PERMISSION_EFFECT } from "./constants.js";
import { invalidateUserPermissions } from "./cache.js";
import { recordSecurityEvent } from "./security-events.js";
import { normalizeEmail } from "../admin-emails.js";
import { iamContextCan } from "./resolve-permissions.js";

const ESCALATION_PERMISSIONS = new Set([
  "iam.manage",
  "iam.assignments.grant",
  "iam.roles.manage",
  "super_admin",
]);

async function findUserByEmail(supabase, email) {
  const normalized = normalizeEmail(email);
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email")
    .eq("email", normalized)
    .maybeSingle();
  if (profile?.id) return profile;

  const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const user = list?.users?.find((u) => normalizeEmail(u.email) === normalized);
  return user ? { id: user.id, email: user.email } : null;
}

function isEscalationPermission(permissionId) {
  return ESCALATION_PERMISSIONS.has(String(permissionId || "").trim());
}

export async function listUserOverrides(supabase, userId, organizationId = IAM_DEFAULT_ORGANIZATION_ID) {
  const { data, error } = await supabase
    .from("iam_user_permission_overrides")
    .select("id, user_id, permission_id, effect, reason, granted_at, granted_by, organization_id")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .or(`organization_id.eq.${organizationId},organization_id.is.null`);

  if (error) {
    if (/relation .* does not exist/i.test(error.message || "")) {
      return { ok: true, overrides: [], tableMissing: true };
    }
    throw error;
  }

  return { ok: true, overrides: data || [] };
}

export async function grantPermissionOverride(supabase, params) {
  const {
    actorId,
    actorIam,
    targetUserId,
    targetEmail,
    permissionId,
    effect = PERMISSION_EFFECT.DENY,
    reason,
    organizationId = IAM_DEFAULT_ORGANIZATION_ID,
    request,
  } = params;

  let userId = targetUserId;
  if (!userId && targetEmail) {
    const found = await findUserByEmail(supabase, targetEmail);
    if (!found) return { ok: false, status: 404, error: "المستخدم غير موجود" };
    userId = found.id;
  }

  if (!userId || !permissionId) {
    return { ok: false, status: 400, error: "userId و permissionId مطلوبان" };
  }

  const trimmedReason = String(reason || "").trim();
  if (!trimmedReason) {
    return { ok: false, status: 400, error: "السبب مطلوب" };
  }

  if (userId === actorId && effect === PERMISSION_EFFECT.ALLOW && isEscalationPermission(permissionId)) {
    await recordSecurityEvent(supabase, {
      eventType: "iam.override_self_escalation_attempt",
      severity: "critical",
      userId: actorId,
      details: { permissionId, effect },
      request,
    });
    return { ok: false, status: 403, error: "لا يمكنك رفع صلاحياتك عبر استثناء فردي" };
  }

  if (effect === PERMISSION_EFFECT.ALLOW && isEscalationPermission(permissionId) && !actorIam?.isSuperAdmin) {
    await recordSecurityEvent(supabase, {
      eventType: "iam.override_escalation_attempt",
      severity: "critical",
      userId: actorId,
      details: { targetUserId: userId, permissionId },
      request,
    });
    return { ok: false, status: 403, error: "فقط super_admin يمكنه منح هذا الاستثناء" };
  }

  const normalizedEffect = String(effect).toLowerCase() === PERMISSION_EFFECT.ALLOW
    ? PERMISSION_EFFECT.ALLOW
    : PERMISSION_EFFECT.DENY;

  const { data: existing } = await supabase
    .from("iam_user_permission_overrides")
    .select("id, effect")
    .eq("user_id", userId)
    .eq("permission_id", permissionId)
    .is("revoked_at", null)
    .maybeSingle();

  if (existing) {
    return { ok: false, status: 409, error: "يوجد استثناء نشط لهذه الصلاحية" };
  }

  const now = new Date().toISOString();
  const { data: inserted, error } = await supabase
    .from("iam_user_permission_overrides")
    .insert({
      user_id: userId,
      permission_id: permissionId,
      effect: normalizedEffect,
      organization_id: organizationId,
      reason: trimmedReason,
      granted_by: actorId,
      granted_at: now,
    })
    .select("id, user_id, permission_id, effect, reason, granted_at")
    .single();

  if (error) {
    return { ok: false, status: 500, error: error.message || "تعذر إنشاء الاستثناء" };
  }

  invalidateUserPermissions(userId, organizationId);

  return { ok: true, override: inserted };
}

export async function revokePermissionOverride(supabase, params) {
  const {
    actorId,
    overrideId,
    userId,
    permissionId,
    reason,
    organizationId = IAM_DEFAULT_ORGANIZATION_ID,
  } = params;

  const trimmedReason = String(reason || "").trim();
  if (!trimmedReason) {
    return { ok: false, status: 400, error: "السبب مطلوب" };
  }

  let query = supabase
    .from("iam_user_permission_overrides")
    .select("id, user_id, permission_id, effect")
    .is("revoked_at", null);

  if (overrideId) {
    query = query.eq("id", overrideId);
  } else if (userId && permissionId) {
    query = query.eq("user_id", userId).eq("permission_id", permissionId);
  } else {
    return { ok: false, status: 400, error: "overrideId أو userId+permissionId مطلوبان" };
  }

  const { data: row, error: fetchError } = await query.maybeSingle();
  if (fetchError) {
    return { ok: false, status: 500, error: fetchError.message };
  }
  if (!row) {
    return { ok: false, status: 404, error: "الاستثناء غير موجود" };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("iam_user_permission_overrides")
    .update({
      revoked_at: now,
      revoked_by: actorId,
    })
    .eq("id", row.id);

  if (error) {
    return { ok: false, status: 500, error: error.message || "تعذر إلغاء الاستثناء" };
  }

  invalidateUserPermissions(row.user_id, organizationId);

  return { ok: true, revoked: { ...row, revoked_at: now, revoke_reason: trimmedReason } };
}

export function canManageOverrides(actorIam) {
  return iamContextCan(actorIam, "iam.manage");
}
