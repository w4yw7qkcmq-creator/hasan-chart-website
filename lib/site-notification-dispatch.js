import { createUserNotification, createUserNotifications } from "./create-user-notification.js";
import { evaluateDeliveryForRecipient } from "./notification-delivery-gate-server.js";
import { logNotificationDeliveryDecision } from "./notification-delivery-gate.js";
import { NOTIFICATION_SOUND_KEYS, normalizeNotificationKey } from "./notification-sound-keys.js";
import { NOTIFICATION_TYPES } from "./notifications-shared.js";
import { sendTargetedPushNotification } from "./push-notifications.js";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.hasanchartworld.com";

const UNIFIED_ALERT_PRESETS = new Set([
  "account_management",
  "vip_signal",
  "subscription_expiry",
  "subscription_renewal",
  "system",
]);

function normalizeRecipientEmail(userEmail) {
  return String(userEmail || "").trim().toLowerCase();
}

function normalizeEmailHash(email) {
  return normalizeRecipientEmail(email).replace(/[^a-z0-9]/g, "").slice(0, 24);
}

function resolveAbsoluteNotificationUrl(url, presetDefaults = {}) {
  const path = String(url || presetDefaults.url || "/notifications").trim();

  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

function buildPushOptionsForPreset(
  preset,
  { title, message, url, metadata, userEmail, notificationKey, presetDefaults }
) {
  const meta = metadata && typeof metadata === "object" ? metadata : {};
  const absoluteUrl = resolveAbsoluteNotificationUrl(url, presetDefaults);
  const resolvedKey = normalizeNotificationKey(
    notificationKey || meta.notification_key || presetDefaults.notificationKey
  );

  const base = {
    title,
    body: message,
    url: absoluteUrl,
    notificationKey: resolvedKey,
  };

  switch (preset) {
    case "account_management":
      return {
        ...base,
        type: "account-management",
        tag: meta.requestId
          ? `account-management-${meta.requestId}`
          : `account-management-${Date.now()}`,
        successLogTag: "ACCOUNT_MANAGEMENT_PUSH_SENT",
        meta: { requestId: meta.requestId, platform: meta.platform },
      };
    case "vip_signal": {
      const signalType = meta.signalType === "futures" ? "futures" : "spot";
      const emailHash = normalizeEmailHash(userEmail);

      return {
        ...base,
        type: signalType === "futures" ? "vip-futures" : "vip-spot",
        tag: meta.signalId
          ? `vip-signal-${meta.signalId}-${emailHash}`
          : `vip-signal-${Date.now()}-${emailHash}`,
        successLogTag: "VIP_SIGNAL_PUSH_SENT",
        meta: { signalId: meta.signalId, signalType, coin: meta.coin },
      };
    }
    case "subscription_expiry":
      return {
        ...base,
        type: "subscription-expired",
        tag: `subscription-expiry-expired-${normalizeEmailHash(userEmail)}`,
        successLogTag: "SUBSCRIPTION_EXPIRY_PUSH_SENT",
        meta: { planName: meta.planName, variant: meta.variant || "expired" },
      };
    case "subscription_renewal":
      return {
        ...base,
        type: "subscription-renewal-reminder",
        tag: `subscription-expiry-reminder-${meta.daysLeft || 3}-${normalizeEmailHash(userEmail)}`,
        successLogTag: "SUBSCRIPTION_EXPIRY_PUSH_SENT",
        meta: {
          planName: meta.planName,
          variant: meta.variant || "reminder",
          daysLeft: meta.daysLeft,
        },
      };
    case "system":
      return {
        ...base,
        type: "system",
        tag: meta.requestId ? `system-${meta.requestId}` : `system-${Date.now()}`,
        successLogTag: "SYSTEM_PUSH_SENT",
        meta,
      };
    default:
      return {
        ...base,
        type: presetDefaults.type || "general",
        tag: `${preset}-${Date.now()}`,
        successLogTag: "SITE_NOTIFICATION_PUSH_SENT",
        meta,
      };
  }
}

function normalizeEmailDispatchResult(result) {
  if (!result) {
    return { sent: false, skipped: true, reason: "empty-email-result" };
  }

  return {
    sent: Boolean(result.sent || result.success),
    skipped: Boolean(result.skipped),
    reason: result.reason || result.error || null,
    ...result,
  };
}

async function dispatchUnifiedPushForPreset(
  supabase,
  {
    preset,
    userEmail,
    userId,
    title,
    message,
    url,
    metadata,
    notificationKey,
    presetDefaults,
  }
) {
  const pushOptions = buildPushOptionsForPreset(preset, {
    title,
    message,
    url,
    metadata,
    userEmail,
    notificationKey,
    presetDefaults,
  });

  try {
    return await sendTargetedPushNotification({
      supabase,
      email: userEmail,
      userId,
      ...pushOptions,
    });
  } catch (error) {
    return {
      sent: 0,
      failed: 1,
      skipped: 0,
      skipReason: error?.message || "WEB_PUSH_DISPATCH_FAILED",
    };
  }
}

/**
 * Unified in-app + web push + optional email dispatch for site notification presets.
 * Uses the shared notification-delivery-gate for every channel.
 */
export async function dispatchUnifiedSiteAlerts(
  supabase,
  {
    preset,
    userEmail,
    userId = null,
    title,
    message,
    notificationKey = null,
    type = null,
    url = null,
    metadata = null,
    sendEmail = null,
  }
) {
  if (!UNIFIED_ALERT_PRESETS.has(preset)) {
    throw new Error(`Unsupported unified alert preset: ${preset}`);
  }

  const defaults = SITE_NOTIFICATION_PRESETS[preset] || {};
  const normalizedEmail = normalizeRecipientEmail(userEmail);
  const resolvedKey = normalizeNotificationKey(
    notificationKey || metadata?.notification_key || defaults.notificationKey
  );
  const logPrefix = String(resolvedKey).toUpperCase();

  let notificationCreated = false;

  if (normalizedEmail) {
    const result = await dispatchSiteNotification(supabase, {
      preset,
      userEmail: normalizedEmail,
      userId,
      title,
      message,
      notificationKey: resolvedKey,
      type,
      url,
      metadata: {
        ...(metadata || {}),
        notification_key: resolvedKey,
      },
    });

    if (result.error) {
      console.error(`${logPrefix}_NOTIFICATION_CREATED`, {
        success: false,
        email: normalizedEmail,
        error: result.error.message || String(result.error),
      });
    } else if (result.skipped) {
      console.log(`${logPrefix}_NOTIFICATION_SKIPPED`, {
        email: normalizedEmail,
        reason: result.reason || "delivery-blocked",
      });
    } else {
      notificationCreated = Boolean(result.data?.id);
      console.log(`${logPrefix}_NOTIFICATION_CREATED`, {
        success: true,
        email: normalizedEmail,
        notificationId: result.data?.id || null,
      });
    }
  }

  let pushResult = {
    sent: 0,
    failed: 0,
    skipped: 1,
    skipReason: normalizedEmail ? "not-attempted" : "missing-user-email",
  };

  if (normalizedEmail) {
    pushResult = await dispatchUnifiedPushForPreset(supabase, {
      preset,
      userEmail: normalizedEmail,
      userId,
      title,
      message,
      url,
      metadata,
      notificationKey: resolvedKey,
      presetDefaults: defaults,
    });

    if ((pushResult?.sent || 0) > 0) {
      console.log(`${logPrefix}_PUSH_SENT`, {
        email: normalizedEmail,
        sent: pushResult.sent,
        failed: pushResult.failed || 0,
      });
    } else {
      console.log(`${logPrefix}_PUSH_SKIPPED`, {
        email: normalizedEmail,
        reason: pushResult?.skipReason || "WEB_PUSH_NOT_SENT",
        sent: pushResult?.sent || 0,
        failed: pushResult?.failed || 0,
        skipped: pushResult?.skipped || 0,
      });
    }
  }

  const emailAllowed =
    normalizedEmail && typeof sendEmail === "function"
      ? await shouldDeliverEmailToRecipient(supabase, {
          userEmail: normalizedEmail,
          userId,
          notificationKey: resolvedKey,
        })
      : false;

  const emailResult =
    normalizedEmail && emailAllowed && typeof sendEmail === "function"
      ? normalizeEmailDispatchResult(await sendEmail())
      : normalizedEmail && typeof sendEmail === "function"
        ? {
            sent: false,
            skipped: true,
            reason: "notification-email-blocked-by-settings",
          }
        : {
            sent: false,
            skipped: true,
            reason: typeof sendEmail === "function" ? "Missing user email" : "no-email-handler",
          };

  if (emailResult.sent) {
    console.log(`${logPrefix}_EMAIL_SENT`, { email: normalizedEmail });
  } else if (normalizedEmail && typeof sendEmail === "function") {
    console.log(`${logPrefix}_EMAIL_SKIPPED`, {
      email: normalizedEmail,
      reason: emailResult.reason || "not-sent",
      skipped: Boolean(emailResult.skipped),
    });
  }

  return {
    notificationCreated,
    pushResult,
    emailResult,
  };
}

export async function dispatchUnifiedSiteAlertsBulk(supabase, notifications = []) {
  const results = [];

  for (const item of notifications) {
    if (!item?.userEmail || !item?.title || !item?.preset) continue;

    results.push({
      userEmail: normalizeRecipientEmail(item.userEmail),
      ...(await dispatchUnifiedSiteAlerts(supabase, item)),
    });
  }

  return results;
}

export const SITE_NOTIFICATION_PRESETS = {
  analysis_reply: {
    notificationKey: NOTIFICATION_SOUND_KEYS.ANALYSIS_REPLY,
    type: NOTIFICATION_TYPES.ANALYSIS_REPLY,
    url: "/my-analysis",
  },
  vip_signal: {
    notificationKey: NOTIFICATION_SOUND_KEYS.VIP_SIGNAL,
    type: NOTIFICATION_TYPES.VIP_SPOT,
    url: "/vip-spot",
  },
  subscription_request: {
    notificationKey: NOTIFICATION_SOUND_KEYS.SUBSCRIPTION_REQUEST,
    type: "subscription_request",
    url: "/admin",
  },
  subscription_expiry: {
    notificationKey: NOTIFICATION_SOUND_KEYS.SUBSCRIPTION_EXPIRY,
    type: NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRED,
    url: "/subscriptions",
  },
  subscription_renewal: {
    notificationKey: NOTIFICATION_SOUND_KEYS.SUBSCRIPTION_EXPIRY,
    type: NOTIFICATION_TYPES.SUBSCRIPTION_RENEWAL,
    url: "/subscriptions",
  },
  account_management: {
    notificationKey: NOTIFICATION_SOUND_KEYS.ACCOUNT_MANAGEMENT,
    type: "account-management",
    url: "/my-dashboard",
  },
  market_news: {
    notificationKey: NOTIFICATION_SOUND_KEYS.MARKET_NEWS,
    type: "market_news",
    url: "/news",
  },
  breaking_news: {
    notificationKey: NOTIFICATION_SOUND_KEYS.BREAKING_NEWS,
    type: "breaking-news",
    url: "/news",
  },
  admin: {
    notificationKey: NOTIFICATION_SOUND_KEYS.ADMIN,
    type: "admin-dashboard",
    url: "/admin",
  },
  system: {
    notificationKey: NOTIFICATION_SOUND_KEYS.SYSTEM,
    type: "system",
    url: "/notifications",
  },
};

export function getAdminNotificationEmail() {
  return String(
    process.env.ADMIN_EMAIL || process.env.EMAIL_REPLY_TO || ""
  )
    .trim()
    .toLowerCase();
}

export async function dispatchSiteNotification(
  supabase,
  {
    userEmail,
    preset,
    title,
    message,
    notificationKey = null,
    type = null,
    url = null,
    metadata = null,
    userId = null,
    skipDeliveryGate = false,
  }
) {
  const defaults = preset ? SITE_NOTIFICATION_PRESETS[preset] || {} : {};
  const resolvedKey = normalizeNotificationKey(
    notificationKey || defaults.notificationKey || NOTIFICATION_SOUND_KEYS.SYSTEM
  );

  if (!skipDeliveryGate) {
    const delivery = await evaluateDeliveryForRecipient(supabase, {
      userEmail,
      userId,
      notificationKey: resolvedKey,
    });

    if (!delivery.inApp) {
      logNotificationDeliveryDecision("NOTIFICATION_DISPATCH_SKIPPED", {
        userEmail: userEmail || null,
        userId: userId || null,
        notificationKey: resolvedKey,
        reason: delivery.blockedReason || "in-app-blocked",
      });

      return {
        data: null,
        error: null,
        skipped: true,
        reason: delivery.blockedReason || "in-app-blocked",
        delivery,
      };
    }
  }

  return createUserNotification(supabase, {
    userEmail,
    title,
    message,
    type: type || defaults.type || "general",
    notificationKey: resolvedKey,
    url: url || defaults.url || null,
    metadata,
    skipDeliveryGate: true,
  });
}

export async function shouldDeliverEmailToRecipient(
  supabase,
  { userEmail, userId = null, notificationKey }
) {
  const delivery = await evaluateDeliveryForRecipient(supabase, {
    userEmail,
    userId,
    notificationKey,
  });

  return delivery.email;
}

export async function shouldDeliverPushToRecipient(
  supabase,
  { userEmail, userId = null, notificationKey }
) {
  const delivery = await evaluateDeliveryForRecipient(supabase, {
    userEmail,
    userId,
    notificationKey,
  });

  return delivery.push;
}

export async function dispatchSiteNotificationsBulk(supabase, notifications = []) {
  const acceptedRows = [];

  for (const item of notifications) {
    const presetDefaults = item.preset ? SITE_NOTIFICATION_PRESETS[item.preset] || {} : {};
    const normalizedEmail = String(item.userEmail || "")
      .trim()
      .toLowerCase();

    if (!normalizedEmail || !item.title) continue;

    const resolvedKey = normalizeNotificationKey(
      item.notificationKey || presetDefaults.notificationKey || NOTIFICATION_SOUND_KEYS.SYSTEM
    );

    const delivery = await evaluateDeliveryForRecipient(supabase, {
      userEmail: normalizedEmail,
      userId: item.userId || null,
      notificationKey: resolvedKey,
    });

    if (!delivery.inApp) {
      logNotificationDeliveryDecision("NOTIFICATION_DISPATCH_SKIPPED", {
        userEmail: normalizedEmail,
        notificationKey: resolvedKey,
        reason: delivery.blockedReason || "in-app-blocked",
        bulk: true,
      });
      continue;
    }

    acceptedRows.push({
      userEmail: normalizedEmail,
      title: String(item.title).trim(),
      message: String(item.message || "").trim(),
      type: item.type || presetDefaults.type || "general",
      notificationKey: resolvedKey,
      url: item.url || presetDefaults.url || null,
      metadata: item.metadata || null,
    });
  }

  if (!acceptedRows.length) {
    return { data: [], error: null, skipped: true };
  }

  return createUserNotifications(supabase, acceptedRows, { skipDeliveryGate: true });
}

export async function dispatchAdminSiteNotification(
  supabase,
  { preset = "admin", title, message, notificationKey = null, url = null, metadata = null }
) {
  const adminEmail = getAdminNotificationEmail();
  if (!adminEmail) {
    return { data: null, error: new Error("Missing ADMIN_EMAIL") };
  }

  return dispatchSiteNotification(supabase, {
    userEmail: adminEmail,
    preset,
    title,
    message,
    notificationKey,
    url,
    metadata,
  });
}
