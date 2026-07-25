import { invalidateReadCache } from "./server-read-cache.js";
import {
  ADMIN_EVENT_TYPES,
  buildAdminEventIdempotencyKey,
  dispatchAdminEvent,
  mapAdminEventResultToLegacyRejectResponse,
} from "./admin-events.js";
import {
  SUBSCRIPTION_NON_REJECTABLE_STATUSES,
  validateSubscriptionRejectPayload,
} from "./admin-subscription-request-reject-shared.js";

const rejectInFlightRegistry = new Map();

export {
  SUBSCRIPTION_NON_REJECTABLE_STATUSES,
  assertAdminSubscriptionRejectAuthorized,
  canRejectSubscriptionRequest,
  validateSubscriptionRejectPayload,
} from "./admin-subscription-request-reject-shared.js";

function buildRejectionNotificationMessage(rejectionReason, rejectionNotes) {
  const messageParts = [];

  if (rejectionReason) {
    messageParts.push(`سبب الرفض: ${rejectionReason}`);
  }

  if (rejectionNotes) {
    messageParts.push(`ملاحظات إضافية: ${rejectionNotes}`);
  }

  return messageParts.join("\n\n") || "تم رفض طلب الاشتراك.";
}

function resolveRejectStatusError(status) {
  const normalized = String(status || "").trim();

  if (normalized === "مرفوض") {
    const error = new Error("تم رفض هذا الطلب مسبقاً");
    error.status = 409;
    return error;
  }

  if (SUBSCRIPTION_NON_REJECTABLE_STATUSES.has(normalized)) {
    const error = new Error("لا يمكن رفض هذا الطلب في حالته الحالية");
    error.status = 409;
    return error;
  }

  return null;
}

async function resolveUserIdByEmail(supabase, userEmail) {
  if (!userEmail) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", userEmail)
    .maybeSingle();

  if (error) {
    console.warn("rejectSubscriptionRequest user lookup warning:", error.message || error);
    return null;
  }

  return data?.id || null;
}

function acquireRejectLock(requestId) {
  if (rejectInFlightRegistry.has(requestId)) {
    return false;
  }

  rejectInFlightRegistry.set(requestId, Date.now());
  return true;
}

function releaseRejectLock(requestId) {
  rejectInFlightRegistry.delete(requestId);
}

export function __resetSubscriptionRejectLocksForTests() {
  rejectInFlightRegistry.clear();
}

export async function rejectSubscriptionRequest(
  supabase,
  {
    adminUser,
    requestId,
    rejectionReason = "",
    rejectionNotes = "",
    dispatchAdminEventFn = dispatchAdminEvent,
    adminEventDeps = null,
  } = {}
) {
  const normalizedRequestId = String(requestId || "").trim();

  const { rejectionReason: normalizedReason, rejectionNotes: normalizedNotes } =
    validateSubscriptionRejectPayload({ rejectionReason, rejectionNotes });

  if (!acquireRejectLock(normalizedRequestId)) {
    const error = new Error("يتم معالجة هذا الطلب حالياً، يرجى الانتظار");
    error.status = 409;
    throw error;
  }

  try {
    const { data: existingRow, error: fetchError } = await supabase
      .from("subscription_requests")
      .select("id,user_email,username,plan_name,price,status,created_at")
      .eq("id", normalizedRequestId)
      .maybeSingle();

    if (fetchError) {
      throw new Error(fetchError.message || "تعذر قراءة طلب الاشتراك");
    }

    if (!existingRow?.id) {
      const error = new Error("طلب الاشتراك غير موجود");
      error.status = 404;
      throw error;
    }

    const previousStatus = String(existingRow.status || "").trim();
    const statusError = resolveRejectStatusError(previousStatus);
    if (statusError) {
      throw statusError;
    }

    const userEmail = String(existingRow.user_email || "").trim().toLowerCase();
    const planName = String(existingRow.plan_name || "").trim();
    const username = String(existingRow.username || "").trim();
    const price = String(existingRow.price || "").trim();
    const createdAt = existingRow.created_at || null;
    const userId = await resolveUserIdByEmail(supabase, userEmail);
    const rejectedAt = new Date().toISOString();

    const { data: updatedRow, error: updateError } = await supabase
      .from("subscription_requests")
      .update({ status: "مرفوض" })
      .eq("id", normalizedRequestId)
      .eq("status", previousStatus)
      .select("id,status")
      .maybeSingle();

    if (updateError) {
      throw new Error(updateError.message || "تعذر رفض طلب الاشتراك");
    }

    if (!updatedRow?.id) {
      const error = new Error("تعذر رفض الطلب لأن حالته تغيرت أثناء المعالجة");
      error.status = 409;
      throw error;
    }

    let notificationCreated = false;
    let notificationWarning = null;
    let emailQueued = false;
    let emailWarning = null;
    let auditLogged = false;
    let auditWarning = null;

    console.info("SUBSCRIPTION_REJECT_DB_UPDATED", {
      requestId: normalizedRequestId,
      previousStatus,
      newStatus: "مرفوض",
    });

    try {
      const eventResult = await dispatchAdminEventFn(
        {
          eventType: ADMIN_EVENT_TYPES.SUBSCRIPTION_REJECTED,
          actor: {
            id: adminUser?.id || null,
            email: adminUser?.email || null,
          },
          target: {
            type: "subscription_requests",
            id: normalizedRequestId,
            userId,
            userEmail,
          },
          context: {
            planName,
            username,
            price,
            createdAt,
            previousStatus,
            newStatus: "مرفوض",
            rejectionReason: normalizedReason,
            rejectionNotes: normalizedNotes || null,
            rejectedAt,
          },
          notification: {
            enabled: Boolean(userEmail),
            title: "تم رفض طلب الاشتراك",
            message: buildRejectionNotificationMessage(normalizedReason, normalizedNotes),
            url: "/subscriptions",
            notificationKey: "system",
            metadata: {
              requestId: normalizedRequestId,
              planName: planName || null,
              rejectionReason: normalizedReason || null,
              rejectionNotes: normalizedNotes || null,
            },
          },
          email: {
            enabled: Boolean(userEmail),
            template: "subscription_rejected",
            payload: {
              username,
              planName,
              price,
              createdAt,
              rejectionReason: normalizedReason,
              adminNotes: normalizedNotes,
            },
          },
          audit: {
            enabled: true,
            action: "reject-subscription-request",
            targetTable: "subscription_requests",
          },
          idempotencyKey: buildAdminEventIdempotencyKey(
            ADMIN_EVENT_TYPES.SUBSCRIPTION_REJECTED,
            normalizedRequestId
          ),
        },
        {
          supabase,
          ...(adminEventDeps || {}),
        }
      );

      const mapped = mapAdminEventResultToLegacyRejectResponse(eventResult);
      notificationCreated = mapped.notificationCreated;
      emailQueued = mapped.emailQueued;
      auditLogged = mapped.auditLogged;

      notificationWarning =
        mapped.warnings.find((item) => item.includes("إشعار للمستخدم")) || null;
      emailWarning =
        mapped.warnings.find((item) => item.includes("رسالة البريد")) || null;
      auditWarning =
        mapped.warnings.find((item) => item.includes("سجل الإدارة")) || null;
    } catch (dispatchError) {
      console.error("SUBSCRIPTION_REJECT_ADMIN_EVENT_FAILED", {
        requestId: normalizedRequestId,
        userEmail,
        error: dispatchError?.message || String(dispatchError),
      });
      notificationWarning = "تم رفض الطلب، لكن تعذر إنشاء إشعار للمستخدم.";
      emailWarning = "تم رفض الطلب، لكن تعذر إضافة رسالة البريد إلى قائمة الإرسال.";
      auditWarning = "تم رفض الطلب، لكن تعذر تسجيل العملية في سجل الإدارة.";
    }

    invalidateReadCache(
      `admin-dashboard:${String(adminUser?.email || "admin").toLowerCase()}:`
    );

    return {
      success: true,
      requestId: normalizedRequestId,
      status: "مرفوض",
      previousStatus,
      userEmail,
      userId,
      planName,
      price,
      createdAt,
      notificationCreated,
      notificationWarning,
      emailQueued,
      emailWarning,
      auditLogged,
      auditWarning,
      rejectionDetails: {
        rejectionReason: normalizedReason,
        adminNotes: normalizedNotes || null,
        rejectedAt,
        rejectedByEmail: adminUser?.email || null,
        notificationCreated,
        emailQueued,
        auditLogged,
      },
    };
  } finally {
    releaseRejectLock(normalizedRequestId);
  }
}
