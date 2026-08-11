import { ADMIN_SERVICE_TYPES } from "./admin-user-service-classifier.js";

export const ADMIN_SERVICE_LABELS = {
  vip: "VIP",
  vip_spot: "VIP Spot",
  vip_futures: "VIP Futures",
  vip_signals: "VIP Signals",
  [ADMIN_SERVICE_TYPES.VIP]: "VIP",
  [ADMIN_SERVICE_TYPES.VIP_SPOT]: "VIP Spot",
  [ADMIN_SERVICE_TYPES.VIP_FUTURES]: "VIP Futures",
  [ADMIN_SERVICE_TYPES.VIP_SIGNALS]: "VIP Signals",
  [ADMIN_SERVICE_TYPES.ACADEMY]: "الأكاديمية",
  [ADMIN_SERVICE_TYPES.ACCOUNT_MANAGEMENT]: "إدارة الحسابات",
  [ADMIN_SERVICE_TYPES.PRICE_ALERT]: "التنبيهات",
  account_management: "إدارة الحسابات",
  academy: "الأكاديمية",
  alerts: "التنبيهات",
  price_alert: "التنبيهات",
};

const ACCOUNT_ACTION_MESSAGES = {
  suspend_user: { success: "تم تعليق الحساب بنجاح", error: "تعذر تعليق الحساب" },
  unsuspend_user: { success: "تم رفع التعليق بنجاح", error: "تعذر رفع التعليق" },
  ban_user: { success: "تم حظر المستخدم بنجاح", error: "تعذر حظر المستخدم" },
  unban_user: { success: "تم إلغاء الحظر بنجاح", error: "تعذر إلغاء الحظر" },
  soft_delete_user: { success: "تم حذف الحساب بنجاح", error: "تعذر حذف الحساب" },
  restore_user: { success: "تم استعادة الحساب بنجاح", error: "تعذر استعادة الحساب" },
  force_logout: { success: "تم تسجيل الخروج الشامل بنجاح", error: "تعذر تسجيل الخروج الشامل" },
  password_reset_requested: {
    success: "تم إرسال رابط إعادة تعيين كلمة المرور",
    error: "تعذر إرسال رابط إعادة تعيين كلمة المرور",
  },
  extend_subscription: { success: "تم تمديد الاشتراك بنجاح", error: "تعذر تمديد الاشتراك" },
  send_user_notification: { success: "تم إرسال الإشعار بنجاح", error: "تعذر إرسال الإشعار" },
};

export function shouldBlockDuplicateAdminAction({ inFlight = false, actionLoading = "" } = {}) {
  return Boolean(inFlight || actionLoading);
}

export function isSuccessfulAdminActionResponse(response, result = {}) {
  if (!response || response.status === 401 || response.status === 403 || response.status === 503) {
    return false;
  }
  if (!response.ok) return false;
  if (result.success === false || result.ok === false) return false;
  if (
    typeof result.error === "string" &&
    result.error.trim() &&
    result.success !== true &&
    result.ok !== true
  ) {
    return false;
  }
  return true;
}

export function resolveAdminServiceLabel(serviceKey = "") {
  const normalized = String(serviceKey || "").trim().toLowerCase();
  return ADMIN_SERVICE_LABELS[normalized] || ADMIN_SERVICE_LABELS[serviceKey] || serviceKey || "الخدمة";
}

export function buildAdminActionKey({ action = "", userId = "", serviceKey = "", subscriptionId = "" } = {}) {
  return [action, userId, serviceKey, subscriptionId].filter(Boolean).join(":");
}

export function resolveAdminActionMessages({
  action = "",
  serviceKey = "",
  apiMessage = "",
} = {}) {
  const serviceLabel = resolveAdminServiceLabel(serviceKey);

  if (action === "activate_service") {
    return {
      success: apiMessage || `تم تفعيل ${serviceLabel} بنجاح`,
      error: `تعذر تفعيل ${serviceLabel}`,
    };
  }

  if (action === "deactivate_service") {
    return {
      success: apiMessage || `تم إيقاف ${serviceLabel} بنجاح`,
      error: `تعذر إيقاف ${serviceLabel}`,
    };
  }

  if (action === "update_user_classification") {
    return {
      success: apiMessage || "تم تحديث تصنيف الحساب",
      error: "تعذر تحديث تصنيف الحساب",
    };
  }

  const preset = ACCOUNT_ACTION_MESSAGES[action];
  if (preset) {
    return {
      success: apiMessage || preset.success,
      error: preset.error,
    };
  }

  return {
    success: apiMessage || "اكتمل الإجراء بنجاح",
    error: "تعذر تنفيذ العملية",
  };
}

export function resolveAdminActionToastOutcome({
  actionSucceeded,
  actionErrorMessage = "",
  successMessage = "",
} = {}) {
  if (actionSucceeded) {
    return {
      type: "success",
      title: "تم التنفيذ",
      body: successMessage || "اكتمل الإجراء بنجاح",
    };
  }

  return {
    type: "error",
    title: "فشل الإجراء",
    body: actionErrorMessage || "تعذر تنفيذ العملية",
  };
}

export async function runIsolatedPostActionRefresh(refreshTask) {
  try {
    await refreshTask();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error?.message || String(error),
    };
  }
}

export function createAdminActionInFlightRegistry() {
  const keys = new Set();

  return {
    has(actionKey) {
      return keys.has(actionKey);
    },
    add(actionKey) {
      keys.add(actionKey);
    },
    delete(actionKey) {
      keys.delete(actionKey);
    },
    clear() {
      keys.clear();
    },
  };
}

export async function runAdminUserActionFlow({
  actionKey = "",
  inFlightRegistry = null,
  execute,
  refresh = null,
  successMessage = "",
  errorMessage = "",
  onSuccess = null,
  onRefreshFailed = null,
} = {}) {
  if (!actionKey || !execute) {
    return { success: false, blocked: false, error: new Error("missing action flow inputs") };
  }

  if (inFlightRegistry?.has(actionKey)) {
    return { success: false, blocked: true, error: null, data: null, refreshFailed: false };
  }

  inFlightRegistry?.add(actionKey);

  let data = null;
  let error = null;
  let success = false;

  try {
    data = await execute();
    success = true;
  } catch (executeError) {
    error = executeError;
    success = false;
  } finally {
    inFlightRegistry?.delete(actionKey);
  }

  if (!success) {
    return {
      success: false,
      blocked: false,
      data: null,
      error,
      refreshFailed: false,
      errorMessage: errorMessage || error?.message || "تعذر تنفيذ العملية",
    };
  }

  onSuccess?.(data);

  let refreshFailed = false;
  if (typeof refresh === "function") {
    const refreshResult = await runIsolatedPostActionRefresh(refresh);
    refreshFailed = !refreshResult.ok;
    if (refreshFailed) {
      onRefreshFailed?.(refreshResult.message);
    }
  }

  return {
    success: true,
    blocked: false,
    data,
    error: null,
    refreshFailed,
    successMessage: successMessage || data?.message || "اكتمل الإجراء بنجاح",
  };
}
