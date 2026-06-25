export const NOTIFICATION_TYPES = {
  PRICE_ALERT: "price-alert",
  ANALYSIS_REPLY: "analysis-reply",
  VIP_SPOT: "vip-spot",
  VIP_FUTURES: "vip-futures",
  SUBSCRIPTION: "subscription",
  SUBSCRIPTION_EXPIRED: "subscription-expired",
  SUBSCRIPTION_RENEWAL: "subscription-renewal-reminder",
};

export function getNotificationHref(type) {
  switch (type) {
    case NOTIFICATION_TYPES.PRICE_ALERT:
      return "/alerts";
    case NOTIFICATION_TYPES.ANALYSIS_REPLY:
      return "/my-analysis";
    case NOTIFICATION_TYPES.VIP_SPOT:
      return "/vip-spot";
    case NOTIFICATION_TYPES.VIP_FUTURES:
      return "/vip-futures";
    case NOTIFICATION_TYPES.SUBSCRIPTION:
    case NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRED:
    case NOTIFICATION_TYPES.SUBSCRIPTION_RENEWAL:
      return "/subscriptions";
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
      return "⭐";
    case NOTIFICATION_TYPES.SUBSCRIPTION:
    case NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRED:
    case NOTIFICATION_TYPES.SUBSCRIPTION_RENEWAL:
      return "📧";
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
      return "vip";
    case NOTIFICATION_TYPES.SUBSCRIPTION:
    case NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRED:
    case NOTIFICATION_TYPES.SUBSCRIPTION_RENEWAL:
      return "subscription";
    default:
      return "general";
  }
}

export function normalizeNotification(row) {
  if (!row?.id) return null;

  const type = row.type || "general";

  return {
    id: row.id,
    userEmail: row.user_email,
    title: row.title || "إشعار جديد",
    message: row.message || "",
    type,
    isRead: Boolean(row.is_read),
    createdAt: row.created_at,
    href: getNotificationHref(type) || "/notifications",
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
