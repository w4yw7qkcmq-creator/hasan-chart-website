import { emitLifecycleEventForAction } from "./account-lifecycle-events.js";
import { assertLifecycleMigrationReady } from "./account-lifecycle-migration.js";
import { pickBestSubscriptionRow, resolveUserServices } from "./user-service-resolver.js";

export const ACCOUNT_STATUSES = new Set(["active", "suspended", "banned", "deleted"]);

const PROFILE_LIFECYCLE_SELECT =
  "id,email,username,role,account_status,status_reason,status_updated_at,status_updated_by,suspended_at,banned_at,deleted_at,account_status_reason,account_status_changed_at,account_status_changed_by,created_at";

const STATUS_TRANSITIONS = {
  suspend: { action: "suspend_user", required: ["active"], next: "suspended" },
  unsuspend: { action: "unsuspend_user", required: ["suspended"], next: "active" },
  ban: { action: "ban_user", required: ["active", "suspended"], next: "banned" },
  unban: { action: "unban_user", required: ["banned"], next: "active" },
  softDelete: { action: "soft_delete_user", required: ["active", "suspended"], next: "deleted" },
  restore: { action: "restore_user", required: ["deleted", "suspended", "banned"], next: "active" },
};

const REASON_MAX_LENGTH = 500;

function buildResult({ success, action, userId, message, changedFields = {} }) {
  return {
    success: Boolean(success),
    action: String(action || ""),
    userId: String(userId || ""),
    message: String(message || ""),
    changedFields,
  };
}

function lifecycleError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function sanitizeLifecycleReason(reason) {
  return String(reason || "")
    .trim()
    .slice(0, REASON_MAX_LENGTH);
}

export function getProfileAccountStatus(profile) {
  const status = String(profile?.account_status || "").trim().toLowerCase();
  if (ACCOUNT_STATUSES.has(status)) {
    return status;
  }
  return "active";
}

export function resolveAccountStatusFromProfile(profile, authUser) {
  if (profile?.account_status) {
    return getProfileAccountStatus(profile);
  }
  if (!authUser) return "active";
  const bannedUntil = authUser.banned_until ? new Date(authUser.banned_until).getTime() : 0;
  if (bannedUntil > Date.now()) return "banned";
  return "active";
}

export function assertAdminCanActOnTarget(adminUser, targetUserId, targetProfile = null) {
  const adminId = String(adminUser?.id || "");
  const targetId = String(targetUserId || "");

  if (!adminId || !targetId) {
    throw lifecycleError("معرّف غير صالح", 400);
  }

  if (adminId === targetId) {
    throw lifecycleError("لا يمكنك تنفيذ هذا الإجراء على حسابك الشخصي", 403);
  }

  if (String(targetProfile?.role || "").trim() === "admin") {
    throw lifecycleError("لا يمكن تنفيذ إجراءات خطرة على حساب مدير", 403);
  }
}

async function fetchProfile(supabase, userId) {
  let result = await supabase
    .from("profiles")
    .select(PROFILE_LIFECYCLE_SELECT)
    .eq("id", userId)
    .maybeSingle();

  if (result.error && /column .* does not exist/i.test(result.error.message || "")) {
    result = await supabase
      .from("profiles")
      .select("id,email,username,role,created_at")
      .eq("id", userId)
      .maybeSingle();
  }

  if (result.error) throw result.error;
  if (!result.data) throw lifecycleError("المستخدم غير موجود", 404);

  return result.data;
}

async function updateProfileLifecycle(supabase, userId, patch) {
  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", userId)
    .select(PROFILE_LIFECYCLE_SELECT)
    .maybeSingle();

  if (error && /column .* does not exist/i.test(error.message || "")) {
    throw lifecycleError(
      "يتطلب نظام إدارة حالة الحساب تطبيق Migration المرحلة 3A",
      503
    );
  }

  if (error) throw error;
  return { data, skipped: false };
}

async function setAuthBan(supabase, userId, banned) {
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    ban_duration: banned ? "876000h" : "none",
  });
  if (error) throw error;
}

async function globalSignOut(supabase, userId) {
  try {
    await supabase.auth.admin.signOut(userId, "global");
  } catch (error) {
    console.warn("Global sign-out skipped:", error?.message || error);
  }
}

function buildStatusPatch(nextStatus, adminUser, reason) {
  const now = new Date().toISOString();
  const safeReason = sanitizeLifecycleReason(reason) || null;
  return {
    account_status: nextStatus,
    status_reason: safeReason,
    status_updated_at: now,
    status_updated_by: adminUser?.id || null,
    account_status_reason: safeReason,
    account_status_changed_at: now,
    account_status_changed_by: adminUser?.id || null,
    suspended_at: nextStatus === "suspended" ? now : null,
    banned_at: nextStatus === "banned" ? now : null,
    deleted_at: nextStatus === "deleted" ? now : null,
  };
}

export async function beforeLifecycleAction(context) {
  await assertLifecycleMigrationReady(context.supabase);

  const beforeProfile =
    context.beforeProfile || (await fetchProfile(context.supabase, context.targetUserId));

  assertAdminCanActOnTarget(context.adminUser, context.targetUserId, beforeProfile);

  const previousState = getProfileAccountStatus(beforeProfile);

  if (context.requiredStatuses?.length && !context.requiredStatuses.includes(previousState)) {
    throw lifecycleError(
      `لا يمكن تنفيذ ${context.action} على حساب بحالة ${previousState}`,
      409
    );
  }

  if (context.action === "suspend_user" && !sanitizeLifecycleReason(context.reason)) {
    throw lifecycleError("سبب التعليق مطلوب", 400);
  }

  return { beforeProfile, previousState };
}

export async function afterLifecycleAction(context) {
  await emitLifecycleEventForAction(context.action, {
    supabase: context.supabase,
    adminUser: context.adminUser,
    targetUserId: context.targetUserId,
    previousState: context.previousState,
    nextState: context.nextState,
    reason: sanitizeLifecycleReason(context.reason),
    service: context.service || null,
    targetTable: context.targetTable || "profiles",
    entityId: context.entityId || context.targetUserId,
    metadata: context.metadata || {},
  });

  return buildResult({
    success: true,
    action: context.action,
    userId: context.targetUserId,
    message: context.message || "تم تنفيذ الإجراء",
    changedFields: context.changedFields || {},
  });
}

async function applyStatusTransition(
  supabase,
  { targetUserId, adminUser, reason, transitionKey, signOut = true }
) {
  const transition = STATUS_TRANSITIONS[transitionKey];
  if (!transition) throw lifecycleError("انتقال حالة غير مدعوم", 400);

  const { beforeProfile, previousState } = await beforeLifecycleAction({
    supabase,
    targetUserId,
    adminUser,
    reason,
    action: transition.action,
    requiredStatuses: transition.required,
  });

  const patch = buildStatusPatch(transition.next, adminUser, reason);
  const { data: afterProfile } = await updateProfileLifecycle(supabase, targetUserId, patch);

  if (transition.next === "banned" || transition.next === "deleted") {
    await setAuthBan(supabase, targetUserId, true);
  } else if (previousState === "banned" || previousState === "deleted") {
    await setAuthBan(supabase, targetUserId, false);
  }

  if (signOut && transition.next !== "active") {
    await globalSignOut(supabase, targetUserId);
  }

  return afterLifecycleAction({
    supabase,
    adminUser,
    targetUserId,
    action: transition.action,
    previousState,
    nextState: transition.next,
    reason,
    message: "تم تحديث حالة الحساب",
    changedFields: {
      account_status: transition.next,
      before_status: previousState,
      status_reason: sanitizeLifecycleReason(reason),
      afterProfile,
    },
  });
}

export async function suspendUser(supabase, { targetUserId, adminUser, reason = "" }) {
  return applyStatusTransition(supabase, {
    targetUserId,
    adminUser,
    reason,
    transitionKey: "suspend",
  });
}

export async function unsuspendUser(supabase, { targetUserId, adminUser, reason = "" }) {
  return applyStatusTransition(supabase, {
    targetUserId,
    adminUser,
    reason,
    transitionKey: "unsuspend",
    signOut: false,
  });
}

export async function banUser(supabase, { targetUserId, adminUser, reason = "" }) {
  return applyStatusTransition(supabase, {
    targetUserId,
    adminUser,
    reason,
    transitionKey: "ban",
  });
}

export async function unbanUser(supabase, { targetUserId, adminUser, reason = "" }) {
  return applyStatusTransition(supabase, {
    targetUserId,
    adminUser,
    reason,
    transitionKey: "unban",
    signOut: false,
  });
}

export async function softDeleteUser(supabase, { targetUserId, adminUser, reason = "" }) {
  return applyStatusTransition(supabase, {
    targetUserId,
    adminUser,
    reason,
    transitionKey: "softDelete",
  });
}

export async function restoreUser(supabase, { targetUserId, adminUser, reason = "" }) {
  return applyStatusTransition(supabase, {
    targetUserId,
    adminUser,
    reason,
    transitionKey: "restore",
    signOut: false,
  });
}

export async function forceSignOutUser(supabase, { targetUserId, adminUser }) {
  const { beforeProfile } = await beforeLifecycleAction({
    supabase,
    targetUserId,
    adminUser,
    action: "force_logout",
  });

  await globalSignOut(supabase, targetUserId);

  return afterLifecycleAction({
    supabase,
    adminUser,
    targetUserId,
    action: "force_logout",
    previousState: getProfileAccountStatus(beforeProfile),
    nextState: getProfileAccountStatus(beforeProfile),
    targetTable: "auth",
    message: "تم إنهاء جميع الجلسات",
    changedFields: {},
  });
}

export async function requestPasswordReset(supabase, { targetUserId, adminUser, email = "" }) {
  const profile = await fetchProfile(supabase, targetUserId);
  await beforeLifecycleAction({
    supabase,
    targetUserId,
    adminUser,
    action: "password_reset_requested",
    beforeProfile: profile,
  });

  const normalizedEmail = String(email || profile.email || "")
    .trim()
    .toLowerCase();

  if (!normalizedEmail) throw lifecycleError("البريد الإلكتروني مطلوب", 400);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "http://localhost:3000";
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "recovery",
    email: normalizedEmail,
    options: {
      redirectTo: `${siteUrl.replace(/\/$/, "")}/login`,
    },
  });

  if (error) throw error;

  return afterLifecycleAction({
    supabase,
    adminUser,
    targetUserId,
    action: "password_reset_requested",
    previousState: getProfileAccountStatus(profile),
    nextState: getProfileAccountStatus(profile),
    targetTable: "auth",
    message: "تم إنشاء رابط إعادة تعيين كلمة المرور",
    metadata: { linkGenerated: Boolean(data?.properties?.action_link) },
    changedFields: { linkGenerated: Boolean(data?.properties?.action_link) },
  });
}

const SERVICE_KEY_MAP = {
  vip: "vip",
  academy: "academy",
  account_management: "accountManagement",
  accountManagement: "accountManagement",
  alerts: "priceAlerts",
  price_alerts: "priceAlerts",
  priceAlerts: "priceAlerts",
};

async function mutateManagedService(supabase, { targetUserId, adminUser, serviceKey, enable, reason = "" }) {
  await beforeLifecycleAction({
    supabase,
    targetUserId,
    adminUser,
    reason,
    action: enable ? "activate_service" : "deactivate_service",
  });

  const services = await resolveUserServices(supabase, targetUserId);
  const mappedKey = SERVICE_KEY_MAP[serviceKey];
  const service = mappedKey ? services[mappedKey] : null;

  if (!service) throw lifecycleError("خدمة غير معروفة", 400);
  if (!service.manageable) throw lifecycleError("الخدمة غير مهيأة للإدارة بعد", 400);
  if (!service.recordId) throw lifecycleError("لا يوجد سجل لهذه الخدمة", 404);

  const profile = await fetchProfile(supabase, targetUserId);
  const email = String(profile.email || "").trim().toLowerCase();
  const actionName = enable ? "activate_service" : "deactivate_service";

  if (serviceKey === "vip" || serviceKey === "academy") {
    const { activateSubscription, suspendSubscription } = await import("./admin-user-subscriptions.js");
    if (enable) {
      await activateSubscription(supabase, {
        subscriptionId: service.recordId,
        userEmail: email,
        adminUser,
        source: "admin",
        skipAudit: true,
      });
    } else {
      await suspendSubscription(supabase, {
        subscriptionId: service.recordId,
        userEmail: email,
        adminUser,
        reason,
        skipAudit: true,
      });
    }
  } else if (
    serviceKey === "account_management" ||
    serviceKey === "accountManagement"
  ) {
    const nextStatus = enable ? "نشط" : "موقوف";
    const { error } = await supabase
      .from("account_management_requests")
      .update({ status: nextStatus })
      .eq("id", service.recordId);
    if (error) throw error;
  } else {
    const nextStatus = enable ? "active" : "cancelled";
    const { error } = await supabase
      .from("price_alerts")
      .update({ status: nextStatus })
      .eq("id", service.recordId);
    if (error) throw error;
  }

  return afterLifecycleAction({
    supabase,
    adminUser,
    targetUserId,
    action: actionName,
    previousState: service.active ? "active" : "inactive",
    nextState: enable ? "active" : "inactive",
    reason,
    service: serviceKey,
    targetTable: service.source,
    entityId: service.recordId,
    message: enable ? "تم تفعيل الخدمة" : "تم إيقاف الخدمة",
    changedFields: { serviceKey, recordId: service.recordId, enabled: enable },
  });
}

export async function activateService(supabase, ctx) {
  return mutateManagedService(supabase, { ...ctx, enable: true });
}

export async function deactivateService(supabase, ctx) {
  return mutateManagedService(supabase, { ...ctx, enable: false });
}

export async function extendSubscription(
  supabase,
  { targetUserId, adminUser, subscriptionId = null, durationDays = null, expiresAt = null, reason = "" }
) {
  await beforeLifecycleAction({
    supabase,
    targetUserId,
    adminUser,
    reason,
    action: "extend_subscription",
  });

  const profile = await fetchProfile(supabase, targetUserId);
  const email = String(profile.email || "").trim().toLowerCase();
  let resolvedSubscriptionId = subscriptionId;

  if (!resolvedSubscriptionId) {
    const { data: rows, error } = await supabase
      .from("subscription_requests")
      .select("id,plan_name,category,status,started_at,expires_at,created_at,admin_disabled")
      .eq("user_email", email)
      .order("created_at", { ascending: false })
      .limit(40);

    if (error) throw error;
    const match = pickBestSubscriptionRow(rows || [], "vip") || (rows || [])[0];
    if (!match) throw lifecycleError("لا يوجد اشتراك لتمديده", 404);
    resolvedSubscriptionId = match.id;
  }

  if (expiresAt) {
    const parsed = new Date(expiresAt);
    if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
      throw lifecycleError("تاريخ الانتهاء يجب أن يكون في المستقبل", 400);
    }
  }

  const { extendSubscription: extendSubscriptionRecord } = await import("./admin-user-subscriptions.js");

  const afterRow = await extendSubscriptionRecord(supabase, {
    subscriptionId: resolvedSubscriptionId,
    userEmail: email,
    adminUser,
    days: durationDays,
    expiresAt,
    skipAudit: false,
    targetUserId,
  });

  return afterLifecycleAction({
    supabase,
    adminUser,
    targetUserId,
    action: "extend_subscription",
    previousState: "subscription",
    nextState: "extended",
    reason,
    targetTable: "subscription_requests",
    entityId: resolvedSubscriptionId,
    metadata: { durationDays, expiresAt: afterRow?.expires_at || expiresAt || null },
    message: "تم تمديد الاشتراك",
    changedFields: {
      subscriptionId: resolvedSubscriptionId,
      durationDays,
      expiresAt: afterRow?.expires_at || expiresAt || null,
    },
  });
}

export async function suspendUserAccount(supabase, ctx) {
  return suspendUser(supabase, ctx);
}
export async function unsuspendUserAccount(supabase, ctx) {
  return unsuspendUser(supabase, ctx);
}
export async function banUserAccount(supabase, ctx) {
  return banUser(supabase, ctx);
}
export async function unbanUserAccount(supabase, ctx) {
  return unbanUser(supabase, ctx);
}
export async function softDeleteUserAccount(supabase, ctx) {
  return softDeleteUser(supabase, ctx);
}
export async function restoreUserAccount(supabase, ctx) {
  return restoreUser(supabase, ctx);
}
export async function forceLogoutUser(supabase, targetUserId) {
  await globalSignOut(supabase, targetUserId);
  return { ok: true };
}

export { buildResult as buildLifecycleResult };
