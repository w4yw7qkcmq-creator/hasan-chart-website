export const NOTIFICATION_TYPES = {
  PRICE_ALERT: "price-alert",
  ANALYSIS_REPLY: "analysis-reply",
  VIP_SPOT: "vip-spot",
  VIP_FUTURES: "vip-futures",
  VIP_FOREX: "vip-forex",
  SUBSCRIPTION: "subscription",
  SUBSCRIPTION_EXPIRED: "subscription-expired",
  SUBSCRIPTION_RENEWAL: "subscription-renewal-reminder",
};

export const PRICE_ALERT_NOTIFICATION_HREF = "/alerts?tab=notifications";

export function getNotificationHref(type) {
  switch (type) {
    case NOTIFICATION_TYPES.PRICE_ALERT:
      return PRICE_ALERT_NOTIFICATION_HREF;
    case NOTIFICATION_TYPES.ANALYSIS_REPLY:
      return "/my-analysis";
    case NOTIFICATION_TYPES.VIP_SPOT:
      return "/vip-spot";
    case NOTIFICATION_TYPES.VIP_FUTURES:
      return "/vip-futures";
    case NOTIFICATION_TYPES.VIP_FOREX:
      return "/vip-forex";
    case NOTIFICATION_TYPES.SUBSCRIPTION:
    case NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRED:
    case NOTIFICATION_TYPES.SUBSCRIPTION_RENEWAL:
      return "/subscriptions";
    case "withdrawal_approved":
    case "withdrawal_rejected":
    case "withdraw_paid":
    case "withdrawal_paid":
      return "/partner-center";
    default:
      return "/notifications";
  }
}

export function getNotificationIcon(type) {
  switch (type) {
    case NOTIFICATION_TYPES.PRICE_ALERT:
      return "🔔";
    case NOTIFICATION_TYPES.ANALYSIS_REPLY:
      return "🧠";
    case NOTIFICATION_TYPES.VIP_SPOT:
    case NOTIFICATION_TYPES.VIP_FUTURES:
    case NOTIFICATION_TYPES.VIP_FOREX:
      return "⭐";
    case NOTIFICATION_TYPES.SUBSCRIPTION:
    case NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRED:
    case NOTIFICATION_TYPES.SUBSCRIPTION_RENEWAL:
      return "📧";
    case "withdrawal_approved":
      return "✅";
    case "withdrawal_rejected":
      return "❌";
    case "withdraw_paid":
    case "withdrawal_paid":
      return "💵";
    default:
      return "⚠️";
  }
}

export function getNotificationVisualType(type) {
  switch (type) {
    case NOTIFICATION_TYPES.PRICE_ALERT:
      return "price-alert";
    case NOTIFICATION_TYPES.ANALYSIS_REPLY:
      return "analysis-reply";
    case NOTIFICATION_TYPES.VIP_SPOT:
    case NOTIFICATION_TYPES.VIP_FUTURES:
    case NOTIFICATION_TYPES.VIP_FOREX:
      return "vip";
    case NOTIFICATION_TYPES.SUBSCRIPTION:
    case NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRED:
    case NOTIFICATION_TYPES.SUBSCRIPTION_RENEWAL:
      return "subscription";
    default:
      return "general";
  }
}

export function isNotificationUnread(notification) {
  if (!notification) return false;

  if (typeof notification.isRead === "boolean") {
    return !notification.isRead;
  }

  if (typeof notification.is_read === "boolean") {
    return !notification.is_read;
  }

  return false;
}

export function countUnreadNotifications(notifications) {
  return (notifications || []).filter(isNotificationUnread).length;
}

function isPriceAlertNotification(type, notificationKey) {
  const key = String(notificationKey || "").trim().toLowerCase();
  return (
    type === NOTIFICATION_TYPES.PRICE_ALERT ||
    type === "price-alert" ||
    key === "price_alert"
  );
}

export function resolveNotificationHref(url, type, notificationKey) {
  const raw = String(url || "").trim();

  if (isPriceAlertNotification(type, notificationKey)) {
    return PRICE_ALERT_NOTIFICATION_HREF;
  }

  return raw || null;
}

export function normalizeNotification(row) {
  if (!row?.id) return null;

  const type = row.type || "general";
  let metadata = row.metadata;
  if (metadata && typeof metadata === "string") {
    try {
      metadata = JSON.parse(metadata);
    } catch {
      metadata = {};
    }
  }
  if (!metadata || typeof metadata !== "object") {
    metadata = {};
  }

  const notificationKey =
    row.notification_key ||
    metadata.notification_key ||
    metadata.key ||
    null;

  return {
    id: row.id,
    userEmail: row.user_email,
    title: row.title || "إشعار جديد",
    message: row.message || "",
    type,
    notificationKey,
    metadata,
    isRead: Boolean(row.is_read),
    isPinned: Boolean(row.is_pinned),
    createdAt: row.created_at,
    href:
      resolveNotificationHref(row.url, type, notificationKey) ||
      getNotificationHref(type) ||
      "/notifications",
    icon: getNotificationIcon(type),
    visualType: getNotificationVisualType(type),
  };
}

export function formatNotificationTime(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("ar-SY-u-nu-latn", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Damascus",
  }).format(date);
}
