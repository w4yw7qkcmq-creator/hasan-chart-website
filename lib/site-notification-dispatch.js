import { createUserNotification, createUserNotifications } from "./create-user-notification.js";
import { evaluateDeliveryForRecipient } from "./notification-delivery-gate-server.js";
import { logNotificationDeliveryDecision } from "./notification-delivery-gate.js";
import { NOTIFICATION_SOUND_KEYS, normalizeNotificationKey } from "./notification-sound-keys.js";
import { NOTIFICATION_TYPES } from "./notifications-shared.js";

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
