import { NOTIFICATION_SOUND_KEYS, normalizeNotificationKey } from "./notification-sound-keys.js";
import { NOTIFICATION_TYPES } from "./notifications-shared.js";

export const NOTIFICATION_CENTER_WIRED_KEYS = [
  NOTIFICATION_SOUND_KEYS.PRICE_ALERT,
  NOTIFICATION_SOUND_KEYS.VIP_SIGNAL,
  NOTIFICATION_SOUND_KEYS.BREAKING_NEWS,
  NOTIFICATION_SOUND_KEYS.ADMIN,
  NOTIFICATION_SOUND_KEYS.SYSTEM,
  NOTIFICATION_SOUND_KEYS.ANALYSIS_REPLY,
  NOTIFICATION_SOUND_KEYS.SUBSCRIPTION_REQUEST,
  NOTIFICATION_SOUND_KEYS.SUBSCRIPTION_EXPIRY,
  NOTIFICATION_SOUND_KEYS.ACCOUNT_MANAGEMENT,
  NOTIFICATION_SOUND_KEYS.MARKET_NEWS,
];

export const NOTIFICATION_KEY_TO_SITE_TYPE = {
  [NOTIFICATION_SOUND_KEYS.PRICE_ALERT]: NOTIFICATION_TYPES.PRICE_ALERT,
  [NOTIFICATION_SOUND_KEYS.VIP_SIGNAL]: NOTIFICATION_TYPES.VIP_SPOT,
  [NOTIFICATION_SOUND_KEYS.BREAKING_NEWS]: "breaking-news",
  [NOTIFICATION_SOUND_KEYS.ADMIN]: "admin-dashboard",
  [NOTIFICATION_SOUND_KEYS.SYSTEM]: "system",
  [NOTIFICATION_SOUND_KEYS.ANALYSIS_REPLY]: NOTIFICATION_TYPES.ANALYSIS_REPLY,
  [NOTIFICATION_SOUND_KEYS.SUBSCRIPTION_REQUEST]: "subscription_request",
  [NOTIFICATION_SOUND_KEYS.SUBSCRIPTION_EXPIRY]: NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRED,
  [NOTIFICATION_SOUND_KEYS.ACCOUNT_MANAGEMENT]: "account-management",
  [NOTIFICATION_SOUND_KEYS.MARKET_NEWS]: "market_news",
};

export const NOTIFICATION_KEY_DEFAULT_URL = {
  [NOTIFICATION_SOUND_KEYS.PRICE_ALERT]: "/alerts",
  [NOTIFICATION_SOUND_KEYS.VIP_SIGNAL]: "/vip-spot",
  [NOTIFICATION_SOUND_KEYS.BREAKING_NEWS]: "/news",
  [NOTIFICATION_SOUND_KEYS.ADMIN]: "/admin",
  [NOTIFICATION_SOUND_KEYS.SYSTEM]: "/notifications",
  [NOTIFICATION_SOUND_KEYS.ANALYSIS_REPLY]: "/my-analysis",
  [NOTIFICATION_SOUND_KEYS.SUBSCRIPTION_REQUEST]: "/admin",
  [NOTIFICATION_SOUND_KEYS.SUBSCRIPTION_EXPIRY]: "/subscriptions",
  [NOTIFICATION_SOUND_KEYS.ACCOUNT_MANAGEMENT]: "/my-dashboard",
  [NOTIFICATION_SOUND_KEYS.MARKET_NEWS]: "/news",
};

function parseRowMetadata(raw) {
  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;

  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function isNotificationCenterWiredKey(key) {
  return NOTIFICATION_CENTER_WIRED_KEYS.includes(normalizeNotificationKey(key));
}

export function resolveSiteTypeForNotificationKey(key, metadata = {}) {
  const normalizedKey = normalizeNotificationKey(key);

  if (metadata.type) {
    return String(metadata.type);
  }

  return NOTIFICATION_KEY_TO_SITE_TYPE[normalizedKey] || "general";
}

export function resolveDefaultUrlForNotificationKey(key) {
  const normalizedKey = normalizeNotificationKey(key);
  return NOTIFICATION_KEY_DEFAULT_URL[normalizedKey] || "/notifications";
}

export function resolveNotificationCenterKeyFromSiteType(siteType) {
  switch (String(siteType || "").trim()) {
    case NOTIFICATION_TYPES.PRICE_ALERT:
    case "price-alert":
      return NOTIFICATION_SOUND_KEYS.PRICE_ALERT;
    case NOTIFICATION_TYPES.VIP_SPOT:
    case NOTIFICATION_TYPES.VIP_FUTURES:
    case "vip-spot":
    case "vip-futures":
      return NOTIFICATION_SOUND_KEYS.VIP_SIGNAL;
    case NOTIFICATION_TYPES.ANALYSIS_REPLY:
    case "analysis-reply":
      return NOTIFICATION_SOUND_KEYS.ANALYSIS_REPLY;
    case "subscription_request":
      return NOTIFICATION_SOUND_KEYS.SUBSCRIPTION_REQUEST;
    case NOTIFICATION_TYPES.SUBSCRIPTION:
      return NOTIFICATION_SOUND_KEYS.SYSTEM;
    case NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRED:
    case NOTIFICATION_TYPES.SUBSCRIPTION_RENEWAL:
    case "subscription-expired":
    case "subscription-renewal-reminder":
      return NOTIFICATION_SOUND_KEYS.SUBSCRIPTION_EXPIRY;
    case "account-management":
    case "account_management_request":
      return NOTIFICATION_SOUND_KEYS.ACCOUNT_MANAGEMENT;
    case "breaking-news":
      return NOTIFICATION_SOUND_KEYS.BREAKING_NEWS;
    case "market_news":
    case "market-news":
      return NOTIFICATION_SOUND_KEYS.MARKET_NEWS;
    case "admin-dashboard":
    case "admin":
      return NOTIFICATION_SOUND_KEYS.ADMIN;
    case "system":
      return NOTIFICATION_SOUND_KEYS.SYSTEM;
    default:
      return NOTIFICATION_SOUND_KEYS.SYSTEM;
  }
}

export function resolveNotificationEventUrl(event = {}) {
  return (
    event.url ||
    resolveDefaultUrlForNotificationKey(event.notificationKey) ||
    "/notifications"
  );
}

export function parseNotificationRow(row = {}) {
  const metadata = parseRowMetadata(row.metadata);
  const siteType = row.type || metadata.type || "general";
  const notificationKey = normalizeNotificationKey(
    row.notification_key ||
      metadata.notification_key ||
      metadata.key ||
      resolveNotificationCenterKeyFromSiteType(siteType)
  );

  return {
    id: String(row.id || metadata.id || ""),
    notificationKey,
    title: String(row.title || metadata.title || "إشعار جديد").trim(),
    body: String(row.message || row.body || metadata.body || metadata.message || "").trim(),
    url: String(row.url || metadata.url || "").trim(),
    metadata: {
      ...metadata,
      id: row.id || metadata.id,
      type: siteType,
    },
    siteType,
    row,
  };
}
