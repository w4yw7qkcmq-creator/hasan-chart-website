import { recordAdminAction, redactObject } from "./admin-audit-log.js";
import {
  dispatchAdminSiteNotification,
  dispatchUnifiedSiteAlerts,
} from "./site-notification-dispatch.js";
import { dispatchSubscriptionActivatedEmail } from "./subscription-activated-dispatch.js";
import { dispatchSubscriptionEndedEmail } from "./subscription-ended-dispatch.js";
import { dispatchSubscriptionRejectedEmail } from "./subscription-rejected-dispatch.js";

export const ADMIN_EVENT_TYPES = {
  SUBSCRIPTION_ENDED: "subscription.ended",
  SUBSCRIPTION_REJECTED: "subscription.rejected",
  SUBSCRIPTION_ACTIVATED: "subscription.activated",
  SUBSCRIPTION_EXTENDED: "subscription.extended",
  USER_SUSPENDED: "user.suspended",
  USER_BANNED: "user.banned",
  USER_RESTORED: "user.restored",
};

const IMPLEMENTED_EVENT_TYPES = new Set([
  ADMIN_EVENT_TYPES.SUBSCRIPTION_ENDED,
  ADMIN_EVENT_TYPES.SUBSCRIPTION_REJECTED,
  ADMIN_EVENT_TYPES.SUBSCRIPTION_ACTIVATED,
  ADMIN_EVENT_TYPES.SUBSCRIPTION_EXTENDED,
]);

export const SUBSCRIPTION_ADMIN_EVENT_TYPES = [
  ADMIN_EVENT_TYPES.SUBSCRIPTION_ENDED,
  ADMIN_EVENT_TYPES.SUBSCRIPTION_REJECTED,
  ADMIN_EVENT_TYPES.SUBSCRIPTION_ACTIVATED,
  ADMIN_EVENT_TYPES.SUBSCRIPTION_EXTENDED,
];

const ADMIN_EVENT_SENSITIVE_KEYS = new Set([
  "payment_proof",
  "paymentProof",
  "proof",
  "base64",
  "html",
  "password",
  "api_key",
  "apiKey",
  "secret_key",
  "secretKey",
  "token",
  "access_token",
  "refresh_token",
  "authorization",
  "trading_password",
  "api_key_encrypted",
  "secret_key_encrypted",
  "trading_password_encrypted",
]);

const processedIdempotencyKeys = new Map();

export function __resetAdminEventDispatchForTests() {
  processedIdempotencyKeys.clear();
}

export function buildAdminEventIdempotencyKey(eventType, targetId, scope = null) {
  const normalizedType = String(eventType || "").trim();
  const normalizedId = String(targetId || "").trim();

  if (!normalizedType || !normalizedId) {
    return "";
  }

  if (scope) {
    const normalizedScope = String(scope || "").trim();
    if (normalizedType === ADMIN_EVENT_TYPES.SUBSCRIPTION_ENDED) {
      return `subscription_ended:${normalizedScope}:${normalizedId}`;
    }
    if (normalizedType === ADMIN_EVENT_TYPES.SUBSCRIPTION_REJECTED) {
      return `subscription_rejected:${normalizedScope}:${normalizedId}`;
    }
    if (normalizedType === ADMIN_EVENT_TYPES.SUBSCRIPTION_ACTIVATED) {
      return `subscription_activated:${normalizedScope}:${normalizedId}`;
    }
    if (normalizedType === ADMIN_EVENT_TYPES.SUBSCRIPTION_EXTENDED) {
      return `subscription_extended:${normalizedScope}:${normalizedId}`;
    }
    return `${normalizedType.replace(/\./g, "_")}:${normalizedScope}:${normalizedId}`;
  }

  if (normalizedType === ADMIN_EVENT_TYPES.SUBSCRIPTION_ENDED) {
    return `subscription_ended:${normalizedId}`;
  }

  if (normalizedType === ADMIN_EVENT_TYPES.SUBSCRIPTION_REJECTED) {
    return `subscription_rejected:${normalizedId}`;
  }

  if (normalizedType === ADMIN_EVENT_TYPES.SUBSCRIPTION_ACTIVATED) {
    return `subscription_activated:${normalizedId}`;
  }

  if (normalizedType === ADMIN_EVENT_TYPES.SUBSCRIPTION_EXTENDED) {
    return `subscription_extended:${normalizedId}`;
  }

  return `${normalizedType.replace(/\./g, "_")}:${normalizedId}`;
}

export function buildAdminEventChannelIdempotencyKey(eventType, targetId, channel) {
  return buildAdminEventIdempotencyKey(eventType, targetId, channel);
}

export function sanitizeAdminEventDetails(details = {}) {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return {};
  }

  const output = {};

  for (const [key, value] of Object.entries(details)) {
    const normalizedKey = String(key || "").trim();
    const lowerKey = normalizedKey.toLowerCase();

    if (
      ADMIN_EVENT_SENSITIVE_KEYS.has(normalizedKey) ||
      ADMIN_EVENT_SENSITIVE_KEYS.has(lowerKey) ||
      lowerKey.includes("password") ||
      lowerKey.includes("token") ||
      lowerKey.includes("secret") ||
      lowerKey.includes("apikey") ||
      lowerKey.includes("base64")
    ) {
      continue;
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
      output[normalizedKey] = sanitizeAdminEventDetails(value);
      continue;
    }

    if (Array.isArray(value)) {
      output[normalizedKey] = value.map((item) =>
        item && typeof item === "object" ? sanitizeAdminEventDetails(item) : item
      );
      continue;
    }

    output[normalizedKey] = value;
  }

  return redactObject(output);
}

function logAdminEvent(eventName, payload = {}) {
  console.info(eventName, sanitizeAdminEventDetails(payload));
}

function createEmptyDispatchResult(eventType) {
  return {
    success: true,
    duplicate: false,
    eventType,
    auditLogged: false,
    userNotificationCreated: false,
    adminNotificationCreated: false,
    emailQueued: false,
    warnings: [],
  };
}

function appendWarning(result, warning) {
  const message = String(warning || "").trim();
  if (!message) return;
  if (!result.warnings.includes(message)) {
    result.warnings.push(message);
  }
}

async function runChannel({
  result,
  channel,
  enabled,
  warningMessage,
  execute,
}) {
  if (!enabled) {
    logAdminEvent(`ADMIN_EVENT_${channel.toUpperCase()}_RESULT`, {
      channel,
      success: false,
      skipped: true,
      warningCode: "disabled",
    });
    return;
  }

  const startedAt = Date.now();

  try {
    const channelResult = await execute();
    const success = Boolean(channelResult?.success ?? channelResult?.ok ?? channelResult?.created);

    if (channel === "audit") {
      result.auditLogged = success;
      if (!success) appendWarning(result, warningMessage);
    } else if (channel === "user_notification") {
      result.userNotificationCreated = Boolean(
        channelResult?.userNotificationCreated ?? channelResult?.notificationCreated ?? channelResult?.created
      );
      if (!result.userNotificationCreated) appendWarning(result, warningMessage);
    } else if (channel === "admin_notification") {
      result.adminNotificationCreated = Boolean(
        channelResult?.adminNotificationCreated ?? channelResult?.created
      );
      if (!result.adminNotificationCreated) appendWarning(result, warningMessage);
    } else if (channel === "email") {
      result.emailQueued = Boolean(channelResult?.emailQueued ?? channelResult?.queued);
      if (!result.emailQueued) appendWarning(result, warningMessage);
    }

    logAdminEvent(`ADMIN_EVENT_${channel.toUpperCase()}_RESULT`, {
      channel,
      success,
      durationMs: Date.now() - startedAt,
      warningCode: success ? null : "channel-failed",
    });
  } catch (error) {
    logAdminEvent(`ADMIN_EVENT_${channel.toUpperCase()}_RESULT`, {
      channel,
      success: false,
      durationMs: Date.now() - startedAt,
      warningCode: "channel-exception",
      error: error?.message || String(error),
    });
    appendWarning(result, warningMessage);
  }
}

async function defaultCreateAuditLog(supabase, payload) {
  const auditResult = await recordAdminAction(supabase, {
    adminId: payload.adminId,
    adminEmail: payload.adminEmail,
    action: payload.action,
    targetTable: payload.targetTable,
    targetId: payload.targetId,
    details: sanitizeAdminEventDetails(payload.details),
  });

  return {
    success: auditResult?.ok === true,
    ok: auditResult?.ok === true,
  };
}

async function defaultCreateUserNotification(supabase, payload) {
  const alertResult = await dispatchUnifiedSiteAlerts(supabase, payload);
  return {
    success: Boolean(alertResult?.notificationCreated),
    notificationCreated: Boolean(alertResult?.notificationCreated),
    userNotificationCreated: Boolean(alertResult?.notificationCreated),
  };
}

async function defaultCreateAdminNotification(supabase, payload) {
  const adminResult = await dispatchAdminSiteNotification(supabase, payload);
  const created = Boolean(adminResult?.data?.id);
  return {
    success: created,
    created,
    adminNotificationCreated: created,
  };
}

async function defaultQueueEndedEmail(payload, emailDeps = {}) {
  const emailResult = await dispatchSubscriptionEndedEmail(payload, emailDeps);
  return {
    success: Boolean(emailResult?.emailQueued),
    emailQueued: Boolean(emailResult?.emailQueued),
    duplicate: Boolean(emailResult?.duplicate),
  };
}

async function defaultQueueRejectedEmail(payload, emailDeps = {}) {
  const emailResult = await dispatchSubscriptionRejectedEmail(payload, emailDeps);
  return {
    success: Boolean(emailResult?.emailQueued),
    emailQueued: Boolean(emailResult?.emailQueued),
    duplicate: Boolean(emailResult?.duplicate),
  };
}

async function defaultQueueActivatedEmail(payload, emailDeps = {}) {
  const emailResult = await dispatchSubscriptionActivatedEmail(payload, emailDeps);
  const queued = Boolean(emailResult?.sent || emailResult?.queued);
  return {
    success: queued,
    emailQueued: queued,
    duplicate: Boolean(emailResult?.duplicate),
  };
}

async function dispatchSubscriptionEndedEvent(event, deps, result) {
  const supabase = deps.supabase;
  const actor = event.actor || {};
  const target = event.target || {};
  const context = event.context || {};
  const notification = event.notification || {};
  const adminNotification = event.adminNotification || {};
  const email = event.email || {};
  const audit = event.audit || {};

  const requestId = String(target.id || "").trim();
  const userEmail = String(target.userEmail || "").trim().toLowerCase();
  const userId = target.userId || null;

  await runChannel({
    result,
    channel: "user_notification",
    enabled: notification.enabled !== false && Boolean(userEmail),
    warningMessage: "تم إنهاء الاشتراك، لكن تعذر إنشاء إشعار للمستخدم.",
    execute: () =>
      (deps.createUserNotification || defaultCreateUserNotification)(supabase, {
        preset: notification.preset || "system",
        userEmail,
        userId,
        title: notification.title || "تم إنهاء اشتراكك",
        message: notification.message || notification.body || "",
        url: notification.url || "/subscriptions",
        notificationKey: notification.notificationKey || "system",
        metadata: sanitizeAdminEventDetails({
          ...(notification.metadata || {}),
          requestId,
          planName: context.planName || null,
          notification_key: notification.notificationKey || "system",
          idempotencyKey: buildAdminEventChannelIdempotencyKey(
            ADMIN_EVENT_TYPES.SUBSCRIPTION_ENDED,
            requestId,
            "user"
          ),
        }),
      }),
  });

  await runChannel({
    result,
    channel: "admin_notification",
    enabled: adminNotification.enabled !== false,
    warningMessage: "تم إنهاء الاشتراك، لكن تعذر إنشاء إشعار الإدارة.",
    execute: () =>
      (deps.createAdminNotification || defaultCreateAdminNotification)(supabase, {
        preset: adminNotification.preset || "admin",
        title: adminNotification.title || "تم إنهاء اشتراك المستخدم",
        message: adminNotification.message || adminNotification.body || "",
        url: adminNotification.url || "/admin",
        notificationKey: adminNotification.notificationKey || "subscription_ended_admin",
        metadata: sanitizeAdminEventDetails({
          ...(adminNotification.metadata || {}),
          requestId,
          userEmail: userEmail || null,
          planName: context.planName || null,
          idempotencyKey: buildAdminEventChannelIdempotencyKey(
            ADMIN_EVENT_TYPES.SUBSCRIPTION_ENDED,
            requestId,
            "admin"
          ),
        }),
      }),
  });

  await runChannel({
    result,
    channel: "email",
    enabled: email.enabled !== false && Boolean(userEmail),
    warningMessage: "تم إنهاء الاشتراك، لكن تعذر إضافة رسالة البريد إلى قائمة الإرسال.",
    execute: () =>
      (deps.queueEmail || defaultQueueEndedEmail)(
        {
          subscriptionRequestId: requestId,
          recipientEmail: userEmail,
          username: email.payload?.username || context.username || "",
          planName: context.planName || email.payload?.planName || "",
          price: context.price || email.payload?.price || "",
          endedAt: context.endedAt || email.payload?.endedAt || null,
          removalNotes: context.removalNotes || email.payload?.removalNotes || "",
        },
        deps.emailDeps || {}
      ),
  });

  await runChannel({
    result,
    channel: "audit",
    enabled: audit.enabled !== false,
    warningMessage: "تم إنهاء الاشتراك، لكن تعذر تسجيل العملية في سجل الإدارة.",
    execute: () =>
      (deps.createAuditLog || defaultCreateAuditLog)(supabase, {
        adminId: actor.id || null,
        adminEmail: actor.email || null,
        action: audit.action || "remove-subscription-request",
        targetTable: audit.targetTable || target.type || "subscription_requests",
        targetId: requestId,
        details: sanitizeAdminEventDetails({
          ...(audit.details || {}),
          requestId,
          adminId: actor.id || null,
          adminEmail: actor.email || null,
          userId,
          userEmail,
          previousStatus: context.previousStatus || null,
          newStatus: context.newStatus || "منتهي",
          removalNotes: context.removalNotes || null,
          timestamp: context.endedAt || context.timestamp || new Date().toISOString(),
          notificationCreated: result.userNotificationCreated,
          emailQueued: result.emailQueued,
          adminNotificationCreated: result.adminNotificationCreated,
          planName: context.planName || null,
          price: context.price || null,
          createdAt: context.createdAt || null,
          expiresAt: context.expiresAt || null,
          profileReconciled: context.profileReconciled === true,
          hasOtherActiveSameService: context.hasOtherActiveSameService === true,
          otherActiveSameServiceIds: Array.isArray(context.otherActiveSameServiceIds)
            ? context.otherActiveSameServiceIds
            : [],
          serviceRemovedFromProfile: context.serviceRemovedFromProfile === true,
          eventType: ADMIN_EVENT_TYPES.SUBSCRIPTION_ENDED,
        }),
      }),
  });
}

async function dispatchSubscriptionRejectedEvent(event, deps, result) {
  const supabase = deps.supabase;
  const actor = event.actor || {};
  const target = event.target || {};
  const context = event.context || {};
  const notification = event.notification || {};
  const email = event.email || {};
  const audit = event.audit || {};

  const requestId = String(target.id || "").trim();
  const userEmail = String(target.userEmail || "").trim().toLowerCase();
  const userId = target.userId || null;

  await runChannel({
    result,
    channel: "user_notification",
    enabled: notification.enabled !== false && Boolean(userEmail),
    warningMessage: "تم رفض الطلب، لكن تعذر إنشاء إشعار للمستخدم.",
    execute: () =>
      (deps.createUserNotification || defaultCreateUserNotification)(supabase, {
        preset: notification.preset || "system",
        userEmail,
        userId,
        title: notification.title || "تم رفض طلب الاشتراك",
        message: notification.message || notification.body || "",
        url: notification.url || "/subscriptions",
        notificationKey: notification.notificationKey || "system",
        metadata: sanitizeAdminEventDetails({
          ...(notification.metadata || {}),
          requestId,
          planName: context.planName || null,
          rejectionReason: context.rejectionReason || null,
          rejectionNotes: context.rejectionNotes || null,
          notification_key: notification.notificationKey || "system",
          idempotencyKey: buildAdminEventChannelIdempotencyKey(
            ADMIN_EVENT_TYPES.SUBSCRIPTION_REJECTED,
            requestId,
            "user"
          ),
        }),
      }),
  });

  await runChannel({
    result,
    channel: "email",
    enabled: email.enabled !== false && Boolean(userEmail),
    warningMessage: "تم رفض الطلب، لكن تعذر إضافة رسالة البريد إلى قائمة الإرسال.",
    execute: () =>
      (deps.queueEmail || defaultQueueRejectedEmail)(
        {
          subscriptionRequestId: requestId,
          recipientEmail: userEmail,
          username: email.payload?.username || context.username || "",
          planName: context.planName || email.payload?.planName || "",
          price: context.price || email.payload?.price || "",
          createdAt: context.createdAt || email.payload?.createdAt || null,
          rejectionReason: context.rejectionReason || email.payload?.rejectionReason || "",
          adminNotes: context.rejectionNotes || email.payload?.adminNotes || "",
        },
        deps.emailDeps || {}
      ),
  });

  await runChannel({
    result,
    channel: "audit",
    enabled: audit.enabled !== false,
    warningMessage: "تم رفض الطلب، لكن تعذر تسجيل العملية في سجل الإدارة.",
    execute: () =>
      (deps.createAuditLog || defaultCreateAuditLog)(supabase, {
        adminId: actor.id || null,
        adminEmail: actor.email || null,
        action: audit.action || "reject-subscription-request",
        targetTable: audit.targetTable || target.type || "subscription_requests",
        targetId: requestId,
        details: sanitizeAdminEventDetails({
          ...(audit.details || {}),
          requestId,
          adminId: actor.id || null,
          adminEmail: actor.email || null,
          userId,
          userEmail,
          previousStatus: context.previousStatus || null,
          newStatus: context.newStatus || "مرفوض",
          rejectionReason: context.rejectionReason || null,
          adminNotes: context.rejectionNotes || null,
          rejectionNotes: context.rejectionNotes || null,
          timestamp: context.rejectedAt || context.timestamp || new Date().toISOString(),
          notificationCreated: result.userNotificationCreated,
          emailQueued: result.emailQueued,
          planName: context.planName || null,
          price: context.price || null,
          createdAt: context.createdAt || null,
          eventType: ADMIN_EVENT_TYPES.SUBSCRIPTION_REJECTED,
        }),
      }),
  });
}

async function dispatchSubscriptionActivatedEvent(event, deps, result) {
  const supabase = deps.supabase;
  const actor = event.actor || {};
  const target = event.target || {};
  const context = event.context || {};
  const notification = event.notification || {};
  const email = event.email || {};
  const audit = event.audit || {};

  const requestId = String(target.id || "").trim();
  const userEmail = String(target.userEmail || "").trim().toLowerCase();
  const userId = target.userId || null;

  await runChannel({
    result,
    channel: "user_notification",
    enabled: notification.enabled !== false && Boolean(userEmail),
    warningMessage: "تم تفعيل الاشتراك، لكن تعذر إنشاء إشعار للمستخدم.",
    execute: () =>
      (deps.createUserNotification || defaultCreateUserNotification)(supabase, {
        preset: notification.preset || "system",
        userEmail,
        userId,
        title: notification.title || "تم تفعيل اشتراكك بنجاح 🎉",
        message: notification.message || notification.body || "",
        url: notification.url || "/subscriptions",
        notificationKey: notification.notificationKey || "system",
        metadata: sanitizeAdminEventDetails({
          ...(notification.metadata || {}),
          requestId,
          planName: context.planName || null,
          expiresAt: context.expiresAt || null,
          notification_key: notification.notificationKey || "system",
          idempotencyKey: buildAdminEventChannelIdempotencyKey(
            ADMIN_EVENT_TYPES.SUBSCRIPTION_ACTIVATED,
            requestId,
            "user"
          ),
        }),
      }),
  });

  await runChannel({
    result,
    channel: "email",
    enabled: email.enabled !== false && Boolean(userEmail),
    warningMessage: "تم تفعيل الاشتراك، لكن تعذر إضافة رسالة البريد إلى قائمة الإرسال.",
    execute: () =>
      (deps.queueEmail || defaultQueueActivatedEmail)(
        {
          subscriptionRequestId: requestId,
          recipientEmail: userEmail,
          planName: context.planName || email.payload?.planName || "",
          expiresAt: context.expiresAt || email.payload?.expiresAt || null,
        },
        deps.emailDeps || {}
      ),
  });

  await runChannel({
    result,
    channel: "audit",
    enabled: audit.enabled !== false,
    warningMessage: "تم تفعيل الاشتراك، لكن تعذر تسجيل العملية في سجل الإدارة.",
    execute: () =>
      (deps.createAuditLog || defaultCreateAuditLog)(supabase, {
        adminId: actor.id || null,
        adminEmail: actor.email || null,
        action: audit.action || "update-subscription-request",
        targetTable: audit.targetTable || target.type || "subscription_requests",
        targetId: requestId,
        details: sanitizeAdminEventDetails({
          ...(audit.details || {}),
          status: context.newStatus || "مفعل",
          userEmail,
          planName: context.planName || null,
          expiresAt: context.expiresAt || null,
          requestId,
          adminId: actor.id || null,
          adminEmail: actor.email || null,
          userId,
          previousStatus: context.previousStatus || null,
          newStatus: context.newStatus || "مفعل",
          startedAt: context.startedAt || null,
          timestamp: context.activatedAt || context.timestamp || new Date().toISOString(),
          notificationCreated: result.userNotificationCreated,
          emailQueued: result.emailQueued,
          profileUpdated: context.profileUpdated === true,
          partnerHookCompleted:
            context.partnerHookCompleted === null || context.partnerHookCompleted === undefined
              ? null
              : context.partnerHookCompleted === true,
          eventType: ADMIN_EVENT_TYPES.SUBSCRIPTION_ACTIVATED,
        }),
      }),
  });
}

async function dispatchSubscriptionExtendedEvent(event, deps, result) {
  const supabase = deps.supabase;
  const actor = event.actor || {};
  const target = event.target || {};
  const context = event.context || {};
  const notification = event.notification || {};
  const email = event.email || {};
  const audit = event.audit || {};

  const requestId = String(target.id || "").trim();
  const userEmail = String(target.userEmail || "").trim().toLowerCase();
  const userId = target.userId || null;

  await runChannel({
    result,
    channel: "user_notification",
    enabled: notification.enabled === true && Boolean(userEmail),
    warningMessage: "تم تمديد الاشتراك، لكن تعذر إنشاء إشعار للمستخدم.",
    execute: () =>
      (deps.createUserNotification || defaultCreateUserNotification)(supabase, {
        preset: notification.preset || "system",
        userEmail,
        userId,
        title: notification.title || "تم تمديد اشتراكك",
        message: notification.message || notification.body || "",
        url: notification.url || "/subscriptions",
        notificationKey: notification.notificationKey || "system",
        metadata: sanitizeAdminEventDetails({
          ...(notification.metadata || {}),
          requestId,
          planName: context.planName || null,
          expiresAt: context.expiresAt || null,
          notification_key: notification.notificationKey || "system",
          idempotencyKey: buildAdminEventChannelIdempotencyKey(
            ADMIN_EVENT_TYPES.SUBSCRIPTION_EXTENDED,
            requestId,
            "user"
          ),
        }),
      }),
  });

  await runChannel({
    result,
    channel: "email",
    enabled: email.enabled === true && Boolean(userEmail),
    warningMessage: "تم تمديد الاشتراك، لكن تعذر إضافة رسالة البريد إلى قائمة الإرسال.",
    execute: () =>
      (deps.queueEmail || defaultQueueExtendedEmail)(email.payload || {}, deps.emailDeps || {}),
  });

  await runChannel({
    result,
    channel: "audit",
    enabled: audit.enabled !== false,
    warningMessage: "تم تمديد الاشتراك، لكن تعذر تسجيل العملية في سجل الإدارة.",
    execute: () =>
      (deps.createAuditLog || defaultCreateAuditLog)(supabase, {
        adminId: actor.id || null,
        adminEmail: actor.email || null,
        action: audit.action || "extend_subscription",
        targetTable: audit.targetTable || target.type || "subscription_requests",
        targetId: requestId,
        details: sanitizeAdminEventDetails({
          ...(audit.details || {}),
          requestId,
          target_user_id: context.targetUserId || userId || null,
          userId,
          userEmail,
          planName: context.planName || null,
          days: context.days ?? null,
          expiresAt: context.expiresAt || null,
          previousExpiresAt: context.previousExpiresAt || null,
          before: context.beforeSnapshot || null,
          after: context.afterSnapshot || null,
          metadata: {
            days: context.days ?? null,
            expiresAt: context.expiresAt || null,
          },
          timestamp: context.extendedAt || context.timestamp || new Date().toISOString(),
          notificationCreated: result.userNotificationCreated,
          emailQueued: result.emailQueued,
          eventType: ADMIN_EVENT_TYPES.SUBSCRIPTION_EXTENDED,
        }),
      }),
  });
}

async function defaultQueueExtendedEmail() {
  return { success: false, emailQueued: false };
}

const ADMIN_EVENT_HANDLERS = {
  [ADMIN_EVENT_TYPES.SUBSCRIPTION_ENDED]: dispatchSubscriptionEndedEvent,
  [ADMIN_EVENT_TYPES.SUBSCRIPTION_REJECTED]: dispatchSubscriptionRejectedEvent,
  [ADMIN_EVENT_TYPES.SUBSCRIPTION_ACTIVATED]: dispatchSubscriptionActivatedEvent,
  [ADMIN_EVENT_TYPES.SUBSCRIPTION_EXTENDED]: dispatchSubscriptionExtendedEvent,
};

export async function dispatchAdminEvent(event = {}, deps = {}) {
  const startedAt = deps.now?.() ?? Date.now();
  const eventType = String(event.eventType || "").trim();
  const targetId = String(event.target?.id || "").trim();
  const idempotencyKey =
    String(event.idempotencyKey || "").trim() ||
    buildAdminEventIdempotencyKey(eventType, targetId);

  if (!eventType || !IMPLEMENTED_EVENT_TYPES.has(eventType)) {
    const error = new Error(`Unsupported admin event type: ${eventType || "missing"}`);
    error.status = 400;
    throw error;
  }

  if (!deps.supabase) {
    const error = new Error("dispatchAdminEvent requires supabase");
    error.status = 500;
    throw error;
  }

  if (idempotencyKey && processedIdempotencyKeys.has(idempotencyKey)) {
    const cached = processedIdempotencyKeys.get(idempotencyKey);
    logAdminEvent("ADMIN_EVENT_DISPATCH_COMPLETE", {
      eventType,
      targetType: event.target?.type || null,
      targetId,
      duplicate: true,
      durationMs: Date.now() - startedAt,
    });
    return { ...cached, duplicate: true };
  }

  logAdminEvent("ADMIN_EVENT_DISPATCH_START", {
    eventType,
    targetType: event.target?.type || null,
    targetId,
    idempotencyKey,
  });

  const result = createEmptyDispatchResult(eventType);

  try {
    const handler = ADMIN_EVENT_HANDLERS[eventType];
    if (handler) {
      await handler(event, deps, result);
    }

    if (idempotencyKey) {
      processedIdempotencyKeys.set(idempotencyKey, { ...result });
    }

    logAdminEvent("ADMIN_EVENT_DISPATCH_COMPLETE", {
      eventType,
      targetType: event.target?.type || null,
      targetId,
      success: result.success,
      auditLogged: result.auditLogged,
      userNotificationCreated: result.userNotificationCreated,
      adminNotificationCreated: result.adminNotificationCreated,
      emailQueued: result.emailQueued,
      warningsCount: result.warnings.length,
      durationMs: Date.now() - startedAt,
    });

    return result;
  } catch (error) {
    logAdminEvent("ADMIN_EVENT_DISPATCH_FAILED", {
      eventType,
      targetType: event.target?.type || null,
      targetId,
      error: error?.message || String(error),
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
}

export function mapAdminEventResultToLegacyChannelResponse(eventResult = {}) {
  return {
    notificationCreated: Boolean(eventResult.userNotificationCreated),
    adminNotificationCreated: Boolean(eventResult.adminNotificationCreated),
    emailQueued: Boolean(eventResult.emailQueued),
    auditLogged: Boolean(eventResult.auditLogged),
    eventType: eventResult.eventType || null,
    warnings: Array.isArray(eventResult.warnings) ? [...eventResult.warnings] : [],
  };
}

export function mapAdminEventResultToLegacyRemoveResponse(eventResult = {}) {
  return mapAdminEventResultToLegacyChannelResponse(eventResult);
}

export function mapAdminEventResultToLegacyRejectResponse(eventResult = {}) {
  return mapAdminEventResultToLegacyChannelResponse(eventResult);
}

export function mapAdminEventResultToLegacyActivateResponse(eventResult = {}) {
  return mapAdminEventResultToLegacyChannelResponse(eventResult);
}

export function mapAdminEventResultToLegacyExtendResponse(eventResult = {}) {
  return mapAdminEventResultToLegacyChannelResponse(eventResult);
}
