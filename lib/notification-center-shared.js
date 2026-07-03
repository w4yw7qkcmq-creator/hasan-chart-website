import { NOTIFICATION_SOUND_KEYS, normalizeNotificationKey } from "./notification-sound-keys.js";
import { NOTIFICATION_TYPES } from "./notifications-shared.js";

export const NOTIFICATION_CENTER_WIRED_KEYS = [
  NOTIFICATION_SOUND_KEYS.PRICE_ALERT,
  NOTIFICATION_SOUND_KEYS.VIP_SIGNAL,
  NOTIFICATION_SOUND_KEYS.ADMIN,
  NOTIFICATION_SOUND_KEYS.ANALYSIS_REPLY,
];

export const NOTIFICATION_KEY_TO_SITE_TYPE = {
  [NOTIFICATION_SOUND_KEYS.PRICE_ALERT]: NOTIFICATION_TYPES.PRICE_ALERT,
  [NOTIFICATION_SOUND_KEYS.VIP_SIGNAL]: NOTIFICATION_TYPES.VIP_SPOT,
  [NOTIFICATION_SOUND_KEYS.ADMIN]: "admin-dashboard",
  [NOTIFICATION_SOUND_KEYS.ANALYSIS_REPLY]: NOTIFICATION_TYPES.ANALYSIS_REPLY,
};

export const NOTIFICATION_KEY_DEFAULT_URL = {
  [NOTIFICATION_SOUND_KEYS.PRICE_ALERT]: "/alerts",
  [NOTIFICATION_SOUND_KEYS.VIP_SIGNAL]: "/vip-spot",
  [NOTIFICATION_SOUND_KEYS.ADMIN]: "/admin",
  [NOTIFICATION_SOUND_KEYS.ANALYSIS_REPLY]: "/my-analysis",
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
    case "admin-dashboard":
      return NOTIFICATION_SOUND_KEYS.ADMIN;
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
