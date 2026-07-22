import { recordAdminAction } from "./admin-audit-log.js";
import { dispatchUnifiedSiteAlerts } from "./site-notification-dispatch.js";
import { dispatchSubscriptionRejectedEmail } from "./subscription-rejected-dispatch.js";
import { invalidateReadCache } from "./server-read-cache.js";
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
    dispatchAlerts = dispatchUnifiedSiteAlerts,
    dispatchRejectedEmail = dispatchSubscriptionRejectedEmail,
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
      .select("id,user_email,username,plan_name,price,status,created_at,payment_proof")
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
    const paymentProof = existingRow.payment_proof || null;
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

    if (userEmail) {
      try {
        const alertResult = await dispatchAlerts(supabase, {
          preset: "system",
          userEmail,
          userId,
          title: "تم رفض طلب الاشتراك",
          message: buildRejectionNotificationMessage(normalizedReason, normalizedNotes),
          url: "/subscriptions",
          metadata: {
            requestId: normalizedRequestId,
            planName: planName || null,
            rejectionReason: normalizedReason || null,
            rejectionNotes: normalizedNotes || null,
            notification_key: "system",
          },
        });

        notificationCreated = Boolean(alertResult?.notificationCreated);

        if (!notificationCreated) {
          notificationWarning = "تم رفض الطلب، لكن تعذر إنشاء إشعار للمستخدم.";
        }
      } catch (notificationError) {
        console.error("SUBSCRIPTION_REJECT_NOTIFICATION_FAILED", {
          requestId: normalizedRequestId,
          userEmail,
          error: notificationError?.message || String(notificationError),
        });
        notificationWarning = "تم رفض الطلب، لكن تعذر إنشاء إشعار للمستخدم.";
      }

      try {
        const emailResult = await dispatchRejectedEmail({
          subscriptionRequestId: normalizedRequestId,
          recipientEmail: userEmail,
          username,
          planName,
          price,
          createdAt,
          rejectionReason: normalizedReason,
          adminNotes: normalizedNotes,
        });

        emailQueued = Boolean(emailResult?.emailQueued);

        if (!emailQueued) {
          emailWarning = "تم رفض الطلب، لكن تعذر إضافة رسالة البريد إلى قائمة الإرسال.";
        }
      } catch (emailError) {
        console.error("SUBSCRIPTION_REJECT_EMAIL_QUEUE_FAILED", {
          requestId: normalizedRequestId,
          userEmail,
          error: emailError?.message || String(emailError),
        });
        emailWarning = "تم رفض الطلب، لكن تعذر إضافة رسالة البريد إلى قائمة الإرسال.";
      }
    }

    await recordAdminAction(supabase, {
      adminId: adminUser?.id || null,
      adminEmail: adminUser?.email || null,
      action: "reject-subscription-request",
      targetTable: "subscription_requests",
      targetId: normalizedRequestId,
      details: {
        requestId: normalizedRequestId,
        adminId: adminUser?.id || null,
        adminEmail: adminUser?.email || null,
        userId,
        userEmail,
        previousStatus,
        newStatus: "مرفوض",
        rejectionReason: normalizedReason,
        adminNotes: normalizedNotes || null,
        rejectionNotes: normalizedNotes || null,
        timestamp: rejectedAt,
        notificationCreated,
        emailQueued,
        planName,
        price,
        createdAt,
      },
    });

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
      paymentProof,
      notificationCreated,
      notificationWarning,
      emailQueued,
      emailWarning,
      rejectionDetails: {
        rejectionReason: normalizedReason,
        adminNotes: normalizedNotes || null,
        rejectedAt,
        rejectedByEmail: adminUser?.email || null,
        notificationCreated,
        emailQueued,
      },
    };
  } finally {
    releaseRejectLock(normalizedRequestId);
  }
}
