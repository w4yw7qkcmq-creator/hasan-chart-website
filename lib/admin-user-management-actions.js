import {
  assertAdminCanActOnTarget,
  banUserAccount,
  forceLogoutUser,
  logAccountAction,
  requestPasswordReset,
  restoreUserAccount,
  softDeleteUserAccount,
  suspendUserAccount,
  unbanUserAccount,
  unsuspendUserAccount,
} from "./account-lifecycle.js";
import { writeAdminAuditLog } from "./admin-audit-log.js";
import { createUserNotification } from "./create-user-notification.js";
import {
  activateSubscription,
  cancelSubscription,
  changeSubscriptionPlan,
  extendSubscription,
  reactivateSubscription,
  reconcileProfileSubscription,
  suspendSubscription,
} from "./admin-user-subscriptions.js";

export const ADMIN_USER_ACTIONS = new Set([
  "suspend_user",
  "unsuspend_user",
  "ban_user",
  "unban_user",
  "soft_delete_user",
  "restore_user",
  "force_logout",
  "password_reset_requested",
  "activate_service",
  "deactivate_service",
  "activate_subscription",
  "deactivate_subscription",
  "reactivate_subscription",
  "extend_subscription",
  "change_plan",
  "cancel_subscription",
  "send_user_notification",
  "retry_email",
]);

const inFlightActions = new Map();

function actionKey(userId, action, entityId) {
  return `${userId}:${action}:${entityId || ""}`;
}

function acquireActionLock(key) {
  if (inFlightActions.has(key)) {
    const error = new Error("الإجراء قيد التنفيذ بالفعل");
    error.status = 409;
    throw error;
  }
  inFlightActions.set(key, Date.now());
}

function releaseActionLock(key) {
  inFlightActions.delete(key);
}

async function getTargetContext(supabase, userId) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id,email,username,role")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!profile) {
    const err = new Error("المستخدم غير موجود");
    err.status = 404;
    throw err;
  }

  return { profile, email: String(profile.email || "").trim().toLowerCase() };
}

async function mutateService(supabase, { serviceKey, userId, email, enable, adminUser, reason = "" }) {
  if (serviceKey === "vip" || serviceKey === "academy") {
    const { data: rows, error } = await supabase
      .from("subscription_requests")
      .select("id,plan_name,category,status")
      .eq("user_email", email)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) throw error;

    const match = (rows || []).find((row) => {
      const combined = `${row.plan_name || ""} ${row.category || ""}`.toLowerCase();
      if (serviceKey === "vip") {
        return combined.includes("vip") || combined.includes("spot") || combined.includes("future");
      }
      return combined.includes("academy") || combined.includes("أكاديم");
    });

    if (!match) {
      const err = new Error("لا يوجد اشتراك مطابق لهذه الخدمة");
      err.status = 404;
      throw err;
    }

    if (enable) {
      return activateSubscription(supabase, {
        subscriptionId: match.id,
        userEmail: email,
        adminUser,
        source: "admin",
      });
    }

    return suspendSubscription(supabase, {
      subscriptionId: match.id,
      userEmail: email,
      adminUser,
      reason,
    });
  }

  if (serviceKey === "account_management") {
    const { data: row, error } = await supabase
      .from("account_management_requests")
      .select("id,status")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!row) {
      const err = new Error("لا يوجد طلب إدارة حساب لهذا المستخدم");
      err.status = 404;
      throw err;
    }

    const nextStatus = enable ? "نشط" : "موقوف";
    const { data: after, error: updateError } = await supabase
      .from("account_management_requests")
      .update({ status: nextStatus })
      .eq("id", row.id)
      .select("id,status,created_at")
      .maybeSingle();

    if (updateError) throw updateError;

    await writeAdminAuditLog(supabase, {
      adminUserId: adminUser?.id,
      adminEmail: adminUser?.email,
      targetUserId: userId,
      action: enable ? "activate_service" : "deactivate_service",
      entityType: "account_management_requests",
      entityId: row.id,
      beforeData: row,
      afterData: after,
      metadata: { serviceKey, reason },
    });

    return after;
  }

  if (serviceKey === "alerts") {
    const { data: rows, error } = await supabase
      .from("price_alerts")
      .select("id,status")
      .eq("user_email", email)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;
    if (!(rows || []).length) {
      const err = new Error("لا توجد تنبيهات لهذا المستخدم");
      err.status = 404;
      throw err;
    }

    const nextStatus = enable ? "active" : "cancelled";
    const ids = rows.map((row) => row.id);

    const { error: updateError } = await supabase
      .from("price_alerts")
      .update({ status: nextStatus })
      .in("id", ids);

    if (updateError) throw updateError;

    await writeAdminAuditLog(supabase, {
      adminUserId: adminUser?.id,
      adminEmail: adminUser?.email,
      targetUserId: userId,
      action: enable ? "activate_service" : "deactivate_service",
      entityType: "price_alerts",
      entityId: ids[0],
      metadata: { serviceKey, affected: ids.length, reason },
    });

    return { affected: ids.length, status: nextStatus };
  }

  const err = new Error("الخدمة غير مهيأة للإدارة بعد");
  err.status = 400;
  throw err;
}

export async function executeAdminUserAction(supabase, adminUser, userId, action, payload = {}) {
  const normalizedAction = String(action || "").trim();
  if (!ADMIN_USER_ACTIONS.has(normalizedAction)) {
    const error = new Error("إجراء غير مدعوم");
    error.status = 400;
    throw error;
  }

  const lockKey = actionKey(userId, normalizedAction, payload.subscriptionId || payload.serviceKey || "");
  acquireActionLock(lockKey);

  try {
    const { profile, email } = await getTargetContext(supabase, userId);
    const ctx = {
      targetUserId: userId,
      adminUser,
      reason: String(payload.reason || "").trim(),
    };

    switch (normalizedAction) {
      case "suspend_user": {
        const result = await suspendUserAccount(supabase, ctx);
        await logAccountAction(supabase, adminUser, userId, "suspend_user", result);
        return { success: true, action: normalizedAction, accountStatus: "suspended" };
      }
      case "unsuspend_user": {
        const result = await unsuspendUserAccount(supabase, ctx);
        await logAccountAction(supabase, adminUser, userId, "unsuspend_user", result);
        return { success: true, action: normalizedAction, accountStatus: "active" };
      }
      case "ban_user": {
        const result = await banUserAccount(supabase, ctx);
        await logAccountAction(supabase, adminUser, userId, "ban_user", result);
        return { success: true, action: normalizedAction, accountStatus: "banned" };
      }
      case "unban_user": {
        const result = await unbanUserAccount(supabase, ctx);
        await logAccountAction(supabase, adminUser, userId, "unban_user", result);
        return { success: true, action: normalizedAction, accountStatus: "active" };
      }
      case "soft_delete_user": {
        const result = await softDeleteUserAccount(supabase, ctx);
        await logAccountAction(supabase, adminUser, userId, "soft_delete_user", result);
        return { success: true, action: normalizedAction, accountStatus: "deleted" };
      }
      case "restore_user": {
        const result = await restoreUserAccount(supabase, ctx);
        await logAccountAction(supabase, adminUser, userId, "restore_user", result);
        return { success: true, action: normalizedAction, accountStatus: "active" };
      }
      case "force_logout": {
        assertAdminCanActOnTarget(adminUser, userId, profile);
        await forceLogoutUser(supabase, userId);
        await writeAdminAuditLog(supabase, {
          adminUserId: adminUser?.id,
          adminEmail: adminUser?.email,
          targetUserId: userId,
          action: "force_logout",
          entityType: "auth",
          entityId: userId,
        });
        return { success: true, action: normalizedAction };
      }
      case "password_reset_requested": {
        assertAdminCanActOnTarget(adminUser, userId, profile);
        const reset = await requestPasswordReset(supabase, {
          targetUserId: userId,
          adminUser,
          email,
        });
        await writeAdminAuditLog(supabase, {
          adminUserId: adminUser?.id,
          adminEmail: adminUser?.email,
          targetUserId: userId,
          action: "password_reset_requested",
          entityType: "auth",
          entityId: userId,
          metadata: { linkGenerated: reset.changedFields?.linkGenerated },
        });
        return { success: true, action: normalizedAction, linkGenerated: reset.changedFields?.linkGenerated };
      }
      case "activate_service":
      case "deactivate_service": {
        assertAdminCanActOnTarget(adminUser, userId, profile);
        await mutateService(supabase, {
          serviceKey: payload.serviceKey,
          userId,
          email,
          enable: normalizedAction === "activate_service",
          adminUser,
          reason: payload.reason,
        });
        await reconcileProfileSubscription(supabase, email);
        return { success: true, action: normalizedAction, serviceKey: payload.serviceKey };
      }
      case "activate_subscription": {
        assertAdminCanActOnTarget(adminUser, userId, profile);
        await activateSubscription(supabase, {
          subscriptionId: payload.subscriptionId,
          userEmail: email,
          adminUser,
          source: "admin",
        });
        return { success: true, action: normalizedAction };
      }
      case "deactivate_subscription": {
        assertAdminCanActOnTarget(adminUser, userId, profile);
        await suspendSubscription(supabase, {
          subscriptionId: payload.subscriptionId,
          userEmail: email,
          adminUser,
          reason: payload.reason,
        });
        return { success: true, action: normalizedAction };
      }
      case "reactivate_subscription": {
        assertAdminCanActOnTarget(adminUser, userId, profile);
        await reactivateSubscription(supabase, {
          subscriptionId: payload.subscriptionId,
          userEmail: email,
          adminUser,
        });
        return { success: true, action: normalizedAction };
      }
      case "cancel_subscription": {
        assertAdminCanActOnTarget(adminUser, userId, profile);
        await cancelSubscription(supabase, {
          subscriptionId: payload.subscriptionId,
          userEmail: email,
          adminUser,
        });
        return { success: true, action: normalizedAction };
      }
      case "extend_subscription": {
        assertAdminCanActOnTarget(adminUser, userId, profile);
        const daysMap = { "7d": 7, "1m": 30, "3m": 90, "1y": 365 };
        const days = payload.days || daysMap[payload.preset] || null;
        await extendSubscription(supabase, {
          subscriptionId: payload.subscriptionId,
          userEmail: email,
          adminUser,
          days,
          expiresAt: payload.expiresAt || null,
        });
        return { success: true, action: normalizedAction };
      }
      case "change_plan": {
        assertAdminCanActOnTarget(adminUser, userId, profile);
        await changeSubscriptionPlan(supabase, {
          subscriptionId: payload.subscriptionId,
          userEmail: email,
          adminUser,
          planName: payload.planName,
          category: payload.category,
        });
        return { success: true, action: normalizedAction };
      }
      case "send_user_notification": {
        assertAdminCanActOnTarget(adminUser, userId, profile);
        const result = await createUserNotification(supabase, {
          userEmail: email,
          title: payload.title,
          message: payload.message,
          type: payload.type || "system",
          url: payload.url || null,
          notificationKey: "system",
          skipDeliveryGate: true,
        });

        if (result.error) throw result.error;

        await writeAdminAuditLog(supabase, {
          adminUserId: adminUser?.id,
          adminEmail: adminUser?.email,
          targetUserId: userId,
          action: "send_user_notification",
          entityType: "notifications",
          entityId: result.data?.id || null,
          metadata: { title: payload.title, type: payload.type || "system" },
        });

        return { success: true, action: normalizedAction, notificationId: result.data?.id || null };
      }
      case "retry_email": {
        const err = new Error("إعادة محاولة البريد غير متاحة بعد — Placeholder");
        err.status = 501;
        throw err;
      }
      default: {
        const error = new Error("إجراء غير مدعوم");
        error.status = 400;
        throw error;
      }
    }
  } finally {
    releaseActionLock(lockKey);
  }
}

export function validateDangerousActionConfirmation(action, targetEmail, confirmEmail) {
  const dangerous = new Set(["ban_user", "soft_delete_user"]);
  if (!dangerous.has(action)) return true;
  return String(confirmEmail || "").trim().toLowerCase() === String(targetEmail || "").trim().toLowerCase();
}
