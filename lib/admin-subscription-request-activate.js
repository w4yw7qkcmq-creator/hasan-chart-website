import { recordAdminAction } from "./admin-audit-log.js";
import { reconcileProfileSubscriptionFromRequests } from "./admin-subscription-profile-reconcile.js";
import { invalidateReadCache } from "./server-read-cache.js";
import {
  ADMIN_EVENT_TYPES,
  buildAdminEventIdempotencyKey,
  dispatchAdminEvent,
  mapAdminEventResultToLegacyActivateResponse,
} from "./admin-events.js";
import {
  addDays,
  getSubscriptionDurationDays,
  SUBSCRIPTION_ALREADY_ACTIVE_STATUSES,
  SUBSCRIPTION_NON_ACTIVATABLE_STATUSES,
  validateSubscriptionActivatePayload,
} from "./admin-subscription-request-activate-shared.js";

const activateInFlightRegistry = new Map();

const PROFILE_UPDATE_WARNING =
  "تم تفعيل الطلب، لكن تعذر تحديث صلاحية المستخدم";
const PARTNER_HOOK_WARNING =
  "تم تفعيل الاشتراك، لكن تعذر مزامنة مكافآت الشريك";

export {
  SUBSCRIPTION_ALREADY_ACTIVE_STATUSES,
  SUBSCRIPTION_NON_ACTIVATABLE_STATUSES,
  canActivateSubscriptionRequest,
  validateSubscriptionActivatePayload,
} from "./admin-subscription-request-activate-shared.js";

function getSubscriptionActivationDates(planName) {
  const startedAt = new Date().toISOString();
  const expiresAt = addDays(startedAt, getSubscriptionDurationDays(planName));
  return { startedAt, expiresAt };
}

function buildActivationNotificationMessage(planName, expiresAt) {
  return `تم تفعيل اشتراك ${planName || "الخاص بك"} حتى تاريخ ${new Date(expiresAt).toLocaleDateString("ar-SY-u-nu-latn")}.`;
}

function resolveActivateStatusError(status) {
  const normalized = String(status || "").trim();

  if (SUBSCRIPTION_ALREADY_ACTIVE_STATUSES.has(normalized)) {
    const error = new Error("تم تفعيل هذا الاشتراك مسبقاً");
    error.status = 409;
    return error;
  }

  if (SUBSCRIPTION_NON_ACTIVATABLE_STATUSES.has(normalized)) {
    const error = new Error("لا يمكن تفعيل هذا الطلب في حالته الحالية");
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
    console.warn("activateSubscriptionRequest user lookup warning:", error.message || error);
    return null;
  }

  return data?.id || null;
}

async function recordActivateCriticalAudit(supabase, adminUser, requestId, action, details) {
  try {
    await recordAdminAction(supabase, {
      adminId: adminUser?.id || null,
      adminEmail: adminUser?.email || null,
      action,
      targetTable: "subscription_requests",
      targetId: requestId,
      details: {
        severity: "critical",
        requestId,
        ...details,
      },
    });
  } catch (criticalAuditError) {
    console.error("SUBSCRIPTION_ACTIVATE_CRITICAL_AUDIT_FAILED", {
      requestId,
      action,
      error: criticalAuditError?.message || String(criticalAuditError),
    });
  }
}

function acquireActivateLock(requestId) {
  if (activateInFlightRegistry.has(requestId)) {
    return false;
  }

  activateInFlightRegistry.set(requestId, Date.now());
  return true;
}

function releaseActivateLock(requestId) {
  activateInFlightRegistry.delete(requestId);
}

export function __resetSubscriptionActivateLocksForTests() {
  activateInFlightRegistry.clear();
}

async function defaultOnPartnerActivated(supabase, payload) {
  const { onPartnerSubscriptionActivated } = await import("./partner-service-hooks.js");
  return onPartnerSubscriptionActivated(supabase, payload);
}

export async function activateSubscriptionRequest(
  supabase,
  {
    adminUser,
    requestId,
    userEmail: payloadUserEmail = "",
    planName: payloadPlanName = "",
    dispatchAdminEventFn = dispatchAdminEvent,
    adminEventDeps = null,
    onPartnerActivated = defaultOnPartnerActivated,
  } = {}
) {
  const normalizedRequestId = String(requestId || "").trim();
  const { userEmail: normalizedPayloadEmail, planName: normalizedPayloadPlanName } =
    validateSubscriptionActivatePayload({
      userEmail: payloadUserEmail,
      planName: payloadPlanName,
    });

  if (!acquireActivateLock(normalizedRequestId)) {
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
    const statusError = resolveActivateStatusError(previousStatus);
    if (statusError) {
      throw statusError;
    }

    const userEmail =
      normalizedPayloadEmail ||
      String(existingRow.user_email || "").trim().toLowerCase();
    const planName =
      normalizedPayloadPlanName || String(existingRow.plan_name || "").trim();
    const username = String(existingRow.username || "").trim();
    const price = String(existingRow.price || "").trim();
    const createdAt = existingRow.created_at || null;
    const userId = await resolveUserIdByEmail(supabase, userEmail);
    const activationDates = getSubscriptionActivationDates(planName);
    const activatedAt = activationDates.startedAt;

    const { data: updatedRow, error: updateError } = await supabase
      .from("subscription_requests")
      .update({
        status: "مفعل",
        started_at: activationDates.startedAt,
        expires_at: activationDates.expiresAt,
        expired_notice_sent: false,
      })
      .eq("id", normalizedRequestId)
      .eq("status", previousStatus)
      .select("id,status,started_at,expires_at")
      .maybeSingle();

    if (updateError) {
      throw new Error(updateError.message || "تعذر تفعيل طلب الاشتراك");
    }

    if (!updatedRow?.id) {
      const error = new Error("تعذر تفعيل الطلب لأن حالته تغيرت أثناء المعالجة");
      error.status = 409;
      throw error;
    }

    let profileUpdated = false;
    let profileWarning = null;
    let partnerHookCompleted = null;
    let partnerHookWarning = null;

    if (userEmail) {
      try {
        await reconcileProfileSubscriptionFromRequests(supabase, userEmail);
        profileUpdated = true;
      } catch (reconcileError) {
        profileWarning = PROFILE_UPDATE_WARNING;
        console.error("SUBSCRIPTION_ACTIVATE_PROFILE_RECONCILE_FAILED", {
          requestId: normalizedRequestId,
          userEmail,
          error: reconcileError?.message || String(reconcileError),
        });
        await recordActivateCriticalAudit(
          supabase,
          adminUser,
          normalizedRequestId,
          "activate-subscription-profile-reconcile-failed",
          {
            userId,
            userEmail,
            planName,
            error: reconcileError?.message || String(reconcileError),
          }
        );
      }

      try {
        await onPartnerActivated(supabase, {
          subscriptionRequestId: normalizedRequestId,
        });
        partnerHookCompleted = true;
      } catch (partnerError) {
        partnerHookCompleted = false;
        partnerHookWarning = PARTNER_HOOK_WARNING;
        console.error("SUBSCRIPTION_ACTIVATE_PARTNER_HOOK_FAILED", {
          requestId: normalizedRequestId,
          userEmail,
          error: partnerError?.message || String(partnerError),
        });
        await recordActivateCriticalAudit(supabase, adminUser, normalizedRequestId, "activate-subscription-partner-hook-failed", {
          userId,
          userEmail,
          planName,
          error: partnerError?.message || String(partnerError),
        });
      }
    }

    let notificationCreated = false;
    let notificationWarning = null;
    let emailQueued = false;
    let emailWarning = null;
    let auditLogged = false;
    let auditWarning = null;
    let eventType = ADMIN_EVENT_TYPES.SUBSCRIPTION_ACTIVATED;
    let duplicate = false;

    console.info("SUBSCRIPTION_ACTIVATE_DB_UPDATED", {
      requestId: normalizedRequestId,
      previousStatus,
      newStatus: "مفعل",
      profileUpdated,
      partnerHookCompleted,
    });

    try {
      const eventResult = await dispatchAdminEventFn(
        {
          eventType: ADMIN_EVENT_TYPES.SUBSCRIPTION_ACTIVATED,
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
            newStatus: "مفعل",
            startedAt: activationDates.startedAt,
            expiresAt: activationDates.expiresAt,
            activatedAt,
            profileUpdated,
            partnerHookCompleted,
          },
          notification: {
            enabled: Boolean(userEmail),
            title: "تم تفعيل اشتراكك بنجاح 🎉",
            message: buildActivationNotificationMessage(planName, activationDates.expiresAt),
            url: "/subscriptions",
            notificationKey: "system",
            metadata: {
              requestId: normalizedRequestId,
              planName: planName || null,
              expiresAt: activationDates.expiresAt,
              notification_key: "system",
            },
          },
          email: {
            enabled: Boolean(userEmail),
            template: "subscription_activated",
            payload: {
              planName,
              expiresAt: activationDates.expiresAt,
            },
          },
          audit: {
            enabled: true,
            action: "update-subscription-request",
            targetTable: "subscription_requests",
          },
          idempotencyKey: buildAdminEventIdempotencyKey(
            ADMIN_EVENT_TYPES.SUBSCRIPTION_ACTIVATED,
            normalizedRequestId
          ),
        },
        {
          supabase,
          ...(adminEventDeps || {}),
        }
      );

      const mapped = mapAdminEventResultToLegacyActivateResponse(eventResult);
      notificationCreated = mapped.notificationCreated;
      emailQueued = mapped.emailQueued;
      auditLogged = mapped.auditLogged;
      eventType = mapped.eventType || eventType;
      duplicate = Boolean(eventResult?.duplicate);

      notificationWarning =
        mapped.warnings.find((item) => item.includes("إشعار للمستخدم")) || null;
      emailWarning =
        mapped.warnings.find((item) => item.includes("رسالة البريد")) || null;
      auditWarning =
        mapped.warnings.find((item) => item.includes("سجل الإدارة")) || null;
    } catch (dispatchError) {
      console.error("SUBSCRIPTION_ACTIVATE_ADMIN_EVENT_FAILED", {
        requestId: normalizedRequestId,
        userEmail,
        error: dispatchError?.message || String(dispatchError),
      });
      notificationWarning = "تم تفعيل الاشتراك، لكن تعذر إنشاء إشعار للمستخدم.";
      emailWarning = "تم تفعيل الاشتراك، لكن تعذر إضافة رسالة البريد إلى قائمة الإرسال.";
      auditWarning = "تم تفعيل الاشتراك، لكن تعذر تسجيل العملية في سجل الإدارة.";
    }

    invalidateReadCache(
      `admin-dashboard:${String(adminUser?.email || "admin").toLowerCase()}:`
    );

    const warnings = [
      profileWarning,
      partnerHookWarning,
      notificationWarning,
      emailWarning,
      auditWarning,
    ].filter(Boolean);

    return {
      success: true,
      requestId: normalizedRequestId,
      status: "مفعل",
      previousStatus,
      userEmail,
      userId,
      planName,
      price,
      createdAt,
      startedAt: activationDates.startedAt,
      expiresAt: activationDates.expiresAt,
      profileUpdated,
      partnerHookCompleted,
      notificationCreated,
      notificationWarning,
      emailQueued,
      emailWarning,
      auditLogged,
      auditWarning,
      eventType,
      duplicate,
      warnings,
    };
  } finally {
    releaseActivateLock(normalizedRequestId);
  }
}
