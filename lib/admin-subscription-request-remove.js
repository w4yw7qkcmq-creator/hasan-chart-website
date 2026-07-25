import { recordAdminAction } from "./admin-audit-log.js";
import { invalidateReadCache } from "./server-read-cache.js";
import {
  ADMIN_EVENT_TYPES,
  buildAdminEventIdempotencyKey,
  dispatchAdminEvent,
  mapAdminEventResultToLegacyRemoveResponse,
} from "./admin-events.js";
import {
  SUBSCRIPTION_ACTIVE_STATUSES,
  validateSubscriptionRemovePayload,
} from "./admin-subscription-request-remove-shared.js";

const removeInFlightRegistry = new Map();

export {
  SUBSCRIPTION_ACTIVE_STATUSES,
  canRemoveSubscriptionRequest,
  validateSubscriptionRemovePayload,
} from "./admin-subscription-request-remove-shared.js";

function buildRemovalNotificationMessage(removalNotes) {
  const trimmedNotes = String(removalNotes || "").trim();
  if (trimmedNotes) {
    return `تم إنهاء اشتراكك من قبل الإدارة.\n\nملاحظات: ${trimmedNotes}`;
  }
  return "تم إنهاء اشتراكك من قبل الإدارة. لم يعد بإمكانك الوصول إلى الخدمة المرتبطة.";
}

function resolveRemoveStatusError(status, adminDisabled) {
  const normalized = String(status || "").trim();

  if (adminDisabled || normalized === "منتهي" || normalized === "موقوف") {
    const error = new Error("تم إزالة هذا الاشتراك مسبقاً");
    error.status = 409;
    return error;
  }

  if (!SUBSCRIPTION_ACTIVE_STATUSES.has(normalized)) {
    const error = new Error("لا يمكن إزالة هذا الاشتراك في حالته الحالية");
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
    console.warn("removeSubscriptionRequest user lookup warning:", error.message || error);
    return null;
  }

  return data?.id || null;
}

function acquireRemoveLock(requestId) {
  if (removeInFlightRegistry.has(requestId)) {
    return false;
  }

  removeInFlightRegistry.set(requestId, Date.now());
  return true;
}

function releaseRemoveLock(requestId) {
  removeInFlightRegistry.delete(requestId);
}

export function __resetSubscriptionRemoveLocksForTests() {
  removeInFlightRegistry.clear();
}

export async function removeSubscriptionRequest(
  supabase,
  {
    adminUser,
    requestId,
    removalNotes = "",
    dispatchAdminEventFn = dispatchAdminEvent,
    adminEventDeps = null,
    reconcileProfile = null,
  } = {}
) {
  const normalizedRequestId = String(requestId || "").trim();
  const { removalNotes: normalizedNotes } = validateSubscriptionRemovePayload({ removalNotes });

  if (!acquireRemoveLock(normalizedRequestId)) {
    const error = new Error("يتم معالجة هذا الطلب حالياً، يرجى الانتظار");
    error.status = 409;
    throw error;
  }

  try {
    const { data: existingRow, error: fetchError } = await supabase
      .from("subscription_requests")
      .select(
        "id,user_email,username,plan_name,price,status,created_at,started_at,expires_at,admin_disabled,payment_proof"
      )
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
    const statusError = resolveRemoveStatusError(previousStatus, Boolean(existingRow.admin_disabled));
    if (statusError) {
      throw statusError;
    }

    const userEmail = String(existingRow.user_email || "").trim().toLowerCase();
    const planName = String(existingRow.plan_name || "").trim();
    const username = String(existingRow.username || "").trim();
    const price = String(existingRow.price || "").trim();
    const createdAt = existingRow.created_at || null;
    const userId = await resolveUserIdByEmail(supabase, userEmail);
    const endedAt = new Date().toISOString();

    const nextExpiresAt =
      existingRow.expires_at && new Date(existingRow.expires_at).getTime() <= Date.now()
        ? existingRow.expires_at
        : endedAt;

    const patch = {
      status: "منتهي",
      admin_disabled: true,
      admin_disabled_at: endedAt,
      admin_disabled_by: adminUser?.id || null,
      admin_disabled_reason: normalizedNotes || "إزالة من الإدارة",
      expires_at: nextExpiresAt,
    };

    const { data: updatedRow, error: updateError } = await supabase
      .from("subscription_requests")
      .update(patch)
      .eq("id", normalizedRequestId)
      .eq("status", previousStatus)
      .select("id,status,admin_disabled,expires_at")
      .maybeSingle();

    if (updateError) {
      throw new Error(updateError.message || "تعذر إزالة الاشتراك");
    }

    if (!updatedRow?.id) {
      const error = new Error("تعذر إزالة الاشتراك لأن حالته تغيرت أثناء المعالجة");
      error.status = 409;
      throw error;
    }

    let profileReconciled = false;
    let profileReconcileWarning = null;
    let hasOtherActiveSameService = false;
    let otherActiveSameServiceIds = [];
    let serviceRemovedFromProfile = false;

    if (userEmail) {
      try {
        const reconcileResult =
          typeof reconcileProfile === "function"
            ? await reconcileProfile(supabase, {
                userEmail,
                removedRequestId: normalizedRequestId,
                removedRow: existingRow,
              })
            : await (
                await import("./admin-subscription-profile-reconcile.js")
              ).reconcileProfileAfterSubscriptionRemoval(supabase, {
                userEmail,
                removedRequestId: normalizedRequestId,
                removedRow: existingRow,
              });

        profileReconciled = reconcileResult?.profileReconciled === true;
        hasOtherActiveSameService = Boolean(reconcileResult?.hasOtherActiveSameService);
        otherActiveSameServiceIds = Array.isArray(reconcileResult?.otherActiveSameServiceIds)
          ? reconcileResult.otherActiveSameServiceIds
          : [];
        serviceRemovedFromProfile = Boolean(reconcileResult?.serviceRemovedFromProfile);
      } catch (reconcileError) {
        profileReconcileWarning =
          "تم إزالة الاشتراك، لكن تعذر تحديث ملف المستخدم (profile).";

        console.error("SUBSCRIPTION_REMOVE_PROFILE_RECONCILE_FAILED", {
          requestId: normalizedRequestId,
          userEmail,
          error: reconcileError?.message || String(reconcileError),
        });

        try {
          await recordAdminAction(supabase, {
            adminId: adminUser?.id || null,
            adminEmail: adminUser?.email || null,
            action: "remove-subscription-profile-reconcile-failed",
            targetTable: "subscription_requests",
            targetId: normalizedRequestId,
            details: {
              severity: "critical",
              requestId: normalizedRequestId,
              userId,
              userEmail,
              planName,
              timestamp: endedAt,
              error: reconcileError?.message || String(reconcileError),
            },
          });
        } catch (criticalAuditError) {
          console.error("SUBSCRIPTION_REMOVE_CRITICAL_AUDIT_FAILED", {
            requestId: normalizedRequestId,
            error: criticalAuditError?.message || String(criticalAuditError),
          });
        }
      }
    }

    let notificationCreated = false;
    let adminNotificationCreated = false;
    let notificationWarning = null;
    let emailQueued = false;
    let emailWarning = null;
    let auditLogged = false;
    let auditWarning = null;
    let eventType = ADMIN_EVENT_TYPES.SUBSCRIPTION_ENDED;

    console.info("SUBSCRIPTION_REMOVE_DB_UPDATED", {
      requestId: normalizedRequestId,
      previousStatus,
      newStatus: "منتهي",
    });

    if (userEmail) {
      try {
        const eventResult = await dispatchAdminEventFn(
          {
            eventType: ADMIN_EVENT_TYPES.SUBSCRIPTION_ENDED,
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
              expiresAt: nextExpiresAt,
              previousStatus,
              newStatus: "منتهي",
              endedAt,
              removalNotes: normalizedNotes || null,
              profileReconciled,
              hasOtherActiveSameService,
              otherActiveSameServiceIds,
              serviceRemovedFromProfile,
            },
            notification: {
              enabled: true,
              title: "تم إنهاء اشتراكك",
              message: buildRemovalNotificationMessage(normalizedNotes),
              url: "/subscriptions",
              notificationKey: "system",
              metadata: {
                requestId: normalizedRequestId,
                planName: planName || null,
                removalNotes: normalizedNotes || null,
              },
            },
            adminNotification: {
              enabled: true,
              title: "تم إنهاء اشتراك المستخدم",
              message: `${planName || "اشتراك"} — ${userEmail}`,
              url: "/admin",
            },
            email: {
              enabled: true,
              template: "subscription_ended",
              payload: {
                username,
                planName,
                price,
                endedAt,
                removalNotes: normalizedNotes,
              },
            },
            audit: {
              enabled: true,
              action: "remove-subscription-request",
              targetTable: "subscription_requests",
            },
            idempotencyKey: buildAdminEventIdempotencyKey(
              ADMIN_EVENT_TYPES.SUBSCRIPTION_ENDED,
              normalizedRequestId
            ),
          },
          {
            supabase,
            ...(adminEventDeps || {}),
          }
        );

        const mapped = mapAdminEventResultToLegacyRemoveResponse(eventResult);
        notificationCreated = mapped.notificationCreated;
        adminNotificationCreated = mapped.adminNotificationCreated;
        emailQueued = mapped.emailQueued;
        auditLogged = mapped.auditLogged;
        eventType = mapped.eventType || eventType;

        notificationWarning =
          mapped.warnings.find((item) => item.includes("إشعار للمستخدم")) || null;
        emailWarning =
          mapped.warnings.find((item) => item.includes("رسالة البريد")) || null;
        auditWarning =
          mapped.warnings.find((item) => item.includes("سجل الإدارة")) || null;
      } catch (dispatchError) {
        console.error("SUBSCRIPTION_REMOVE_ADMIN_EVENT_FAILED", {
          requestId: normalizedRequestId,
          userEmail,
          error: dispatchError?.message || String(dispatchError),
        });
        notificationWarning = "تم إزالة الاشتراك، لكن تعذر إنشاء إشعار للمستخدم.";
        emailWarning = "تم إزالة الاشتراك، لكن تعذر إضافة رسالة البريد إلى قائمة الإرسال.";
        auditWarning = "تم إزالة الاشتراك، لكن تعذر تسجيل العملية في سجل الإدارة.";
      }
    }

    if (hasOtherActiveSameService) {
      try {
        await recordAdminAction(supabase, {
          adminId: adminUser?.id || null,
          adminEmail: adminUser?.email || null,
          action: "remove-subscription-service-retained",
          targetTable: "subscription_requests",
          targetId: normalizedRequestId,
          details: {
            requestId: normalizedRequestId,
            userId,
            userEmail,
            planName,
            removedServiceType: existingRow?.category || existingRow?.plan_name || null,
            otherActiveSameServiceIds,
            timestamp: endedAt,
            message:
              "تم إنهاء الطلب الحالي مع الإبقاء على الخدمة في profile بسبب اشتراك نشط آخر لنفس الخدمة.",
          },
        });
      } catch (retainedAuditError) {
        console.error("SUBSCRIPTION_REMOVE_RETAINED_AUDIT_FAILED", {
          requestId: normalizedRequestId,
          error: retainedAuditError?.message || String(retainedAuditError),
        });
      }
    }

    const warnings = [
      notificationWarning,
      emailWarning,
      auditWarning,
      profileReconcileWarning,
    ].filter(Boolean);

    invalidateReadCache(`admin-dashboard:${String(adminUser?.email || "admin").toLowerCase()}:`);

    return {
      success: true,
      requestId: normalizedRequestId,
      status: "منتهي",
      previousStatus,
      userEmail,
      userId,
      planName,
      price,
      createdAt,
      endedAt,
      profileReconciled,
      hasOtherActiveSameService,
      otherActiveSameServiceIds,
      serviceRemovedFromProfile,
      notificationCreated,
      adminNotificationCreated,
      notificationWarning,
      emailQueued,
      emailWarning,
      auditLogged,
      auditWarning,
      profileReconcileWarning,
      eventType,
      warnings,
      removalDetails: {
        removalNotes: normalizedNotes || null,
        endedAt,
        endedByEmail: adminUser?.email || null,
        notificationCreated,
        adminNotificationCreated,
        emailQueued,
        auditLogged,
        profileReconciled,
        hasOtherActiveSameService,
        otherActiveSameServiceIds,
        serviceRemovedFromProfile,
        eventType,
      },
    };
  } finally {
    releaseRemoveLock(normalizedRequestId);
  }
}
