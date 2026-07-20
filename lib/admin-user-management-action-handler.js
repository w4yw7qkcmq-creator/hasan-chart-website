import {
  activateService,
  banUser,
  deactivateService,
  extendSubscription,
  forceSignOutUser,
  requestPasswordReset,
  restoreUser,
  sanitizeLifecycleReason,
  softDeleteUser,
  suspendUser,
  unbanUser,
  unsuspendUser,
} from "./account-lifecycle.js";
import { assertLifecycleMigrationReady } from "./account-lifecycle-migration.js";
import { requirePermissionForAction } from "./admin-permissions.js";

export const ALLOWED_ADMIN_USER_ACTIONS = new Set([
  "suspend_user",
  "unsuspend_user",
  "ban_user",
  "unban_user",
  "soft_delete_user",
  "restore_user",
  "force_logout",
  "force_sign_out",
  "password_reset_requested",
  "password_reset",
  "activate_service",
  "deactivate_service",
  "extend_subscription",
]);

const ACTION_ALIASES = {
  force_sign_out: "force_logout",
  password_reset: "password_reset_requested",
};

const EXTEND_PRESETS = {
  "7d": 7,
  "1m": 30,
  "3m": 90,
  "1y": 365,
};

const VALID_SERVICES = new Set([
  "vip",
  "academy",
  "account_management",
  "accountManagement",
  "alerts",
  "price_alerts",
  "priceAlerts",
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function throwStatus(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}

export function isValidUserId(value) {
  return UUID_RE.test(String(value || "").trim());
}

function normalizeActionInput(body = {}) {
  const payload = body.payload && typeof body.payload === "object" ? body.payload : {};
  const action = String(body.action || "").trim();
  const service = String(body.service || body.serviceKey || payload.serviceKey || payload.service || "").trim();
  const reason = sanitizeLifecycleReason(body.reason || payload.reason || "");
  const preset = String(payload.preset || body.preset || "").trim();
  const durationDaysRaw = body.durationDays ?? payload.days ?? EXTEND_PRESETS[preset] ?? null;
  const durationDays = durationDaysRaw != null ? Number(durationDaysRaw) : null;
  const expiresAt = body.expiresAt || payload.expiresAt || null;
  const subscriptionId = body.subscriptionId || payload.subscriptionId || null;

  return {
    action: ACTION_ALIASES[action] || action,
    service,
    reason,
    durationDays,
    expiresAt,
    subscriptionId,
  };
}

function validateActionInput(input) {
  if (!ALLOWED_ADMIN_USER_ACTIONS.has(input.action)) {
    throwStatus("إجراء غير مدعوم", 400);
  }

  if (input.action === "suspend_user" && !input.reason) {
    throwStatus("سبب التعليق مطلوب", 400);
  }

  if ((input.action === "activate_service" || input.action === "deactivate_service") && !input.service) {
    throwStatus("حقل service مطلوب", 400);
  }

  if (
    (input.action === "activate_service" || input.action === "deactivate_service") &&
    !VALID_SERVICES.has(input.service)
  ) {
    throwStatus("خدمة غير مدعومة", 400);
  }

  if (input.action === "extend_subscription") {
    if (input.durationDays == null && !input.expiresAt) {
      throwStatus("durationDays أو expiresAt مطلوب", 400);
    }
    if (input.durationDays != null && (!Number.isFinite(input.durationDays) || input.durationDays <= 0)) {
      throwStatus("durationDays غير صالح", 400);
    }
    if (input.expiresAt) {
      const parsed = new Date(input.expiresAt);
      if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
        throwStatus("تاريخ الانتهاء يجب أن يكون في المستقبل", 400);
      }
    }
  }

  if (input.subscriptionId && !isValidUserId(input.subscriptionId)) {
    throwStatus("معرّف الاشتراك غير صالح", 400);
  }
}

export async function handleAdminUserManagementAction(
  supabase,
  adminUser,
  adminProfile,
  targetUserId,
  body = {}
) {
  const normalizedUserId = String(targetUserId || "").trim();
  if (!isValidUserId(normalizedUserId)) {
    throwStatus("معرّف المستخدم غير صالح", 400);
  }

  const input = normalizeActionInput(body);
  validateActionInput(input);
  requirePermissionForAction(adminProfile, input.action);
  await assertLifecycleMigrationReady(supabase);

  const ctx = {
    targetUserId: normalizedUserId,
    adminUser,
    reason: input.reason,
  };

  switch (input.action) {
    case "suspend_user":
      return suspendUser(supabase, ctx);
    case "unsuspend_user":
      return unsuspendUser(supabase, ctx);
    case "ban_user":
      return banUser(supabase, ctx);
    case "unban_user":
      return unbanUser(supabase, ctx);
    case "soft_delete_user":
      return softDeleteUser(supabase, ctx);
    case "restore_user":
      return restoreUser(supabase, ctx);
    case "force_logout":
      return forceSignOutUser(supabase, ctx);
    case "password_reset_requested": {
      const { data: targetProfile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", normalizedUserId)
        .maybeSingle();
      return requestPasswordReset(supabase, {
        ...ctx,
        email: targetProfile?.email || "",
      });
    }
    case "activate_service":
      return activateService(supabase, { ...ctx, serviceKey: input.service });
    case "deactivate_service":
      return deactivateService(supabase, { ...ctx, serviceKey: input.service });
    case "extend_subscription":
      return extendSubscription(supabase, {
        ...ctx,
        subscriptionId: input.subscriptionId,
        durationDays: input.durationDays,
        expiresAt: input.expiresAt,
      });
    default:
      throwStatus("إجراء غير مدعوم", 400);
  }
}

export function validateDangerousActionConfirmation(action, targetEmail, confirmEmail) {
  const dangerous = new Set(["ban_user", "soft_delete_user"]);
  if (!dangerous.has(action)) return true;
  return (
    String(confirmEmail || "").trim().toLowerCase() ===
    String(targetEmail || "").trim().toLowerCase()
  );
}

export function isSelfTargetAction(adminUserId, targetUserId, action) {
  if (String(adminUserId || "") !== String(targetUserId || "")) return false;
  return new Set([
    "suspend_user",
    "ban_user",
    "soft_delete_user",
    "force_logout",
    "force_sign_out",
  ]).has(String(action || "").trim());
}
