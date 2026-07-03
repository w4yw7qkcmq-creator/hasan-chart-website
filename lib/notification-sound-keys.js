export const DEFAULT_NOTIFICATION_SOUND_ASSET = "trading-alert";

export const NOTIFICATION_SOUND_ASSETS = {
  "trading-alert": "/sounds/trading-alert.wav",
};

export const NOTIFICATION_SOUND_KEYS = {
  PRICE_ALERT: "price_alert",
  VIP_SIGNAL: "vip_signal",
  BREAKING_NEWS: "breaking_news",
  ADMIN: "admin",
  SYSTEM: "system",
  ANALYSIS_REQUEST: "analysis_request",
  ANALYSIS_REPLY: "analysis_reply",
  SUBSCRIPTION_REQUEST: "subscription_request",
  SUBSCRIPTION_EXPIRY: "subscription_expiry",
  ACCOUNT_MANAGEMENT: "account_management",
  MARKET_NEWS: "market_news",
};

export const NOTIFICATION_SOUND_KEY_ORDER = [
  NOTIFICATION_SOUND_KEYS.PRICE_ALERT,
  NOTIFICATION_SOUND_KEYS.VIP_SIGNAL,
  NOTIFICATION_SOUND_KEYS.BREAKING_NEWS,
  NOTIFICATION_SOUND_KEYS.ADMIN,
  NOTIFICATION_SOUND_KEYS.SYSTEM,
  NOTIFICATION_SOUND_KEYS.ANALYSIS_REQUEST,
  NOTIFICATION_SOUND_KEYS.ANALYSIS_REPLY,
  NOTIFICATION_SOUND_KEYS.SUBSCRIPTION_REQUEST,
  NOTIFICATION_SOUND_KEYS.SUBSCRIPTION_EXPIRY,
  NOTIFICATION_SOUND_KEYS.ACCOUNT_MANAGEMENT,
  NOTIFICATION_SOUND_KEYS.MARKET_NEWS,
];

export const NOTIFICATION_SOUND_KEY_LABELS_AR = {
  [NOTIFICATION_SOUND_KEYS.PRICE_ALERT]: "تنبيهات الأسعار",
  [NOTIFICATION_SOUND_KEYS.VIP_SIGNAL]: "توصيات VIP",
  [NOTIFICATION_SOUND_KEYS.BREAKING_NEWS]: "الأخبار العاجلة",
  [NOTIFICATION_SOUND_KEYS.ADMIN]: "لوحة الإدارة",
  [NOTIFICATION_SOUND_KEYS.SYSTEM]: "إشعارات النظام",
  [NOTIFICATION_SOUND_KEYS.ANALYSIS_REQUEST]: "طلبات التحليل",
  [NOTIFICATION_SOUND_KEYS.ANALYSIS_REPLY]: "ردود التحليل",
  [NOTIFICATION_SOUND_KEYS.SUBSCRIPTION_REQUEST]: "طلبات الاشتراك",
  [NOTIFICATION_SOUND_KEYS.SUBSCRIPTION_EXPIRY]: "انتهاء الاشتراك",
  [NOTIFICATION_SOUND_KEYS.ACCOUNT_MANAGEMENT]: "إدارة الحسابات",
  [NOTIFICATION_SOUND_KEYS.MARKET_NEWS]: "أخبار السوق",
};

/** Maps legacy boolean columns to notification keys (for fallback). */
export const LEGACY_COLUMN_BY_NOTIFICATION_KEY = {
  [NOTIFICATION_SOUND_KEYS.PRICE_ALERT]: "price_alert_sound_enabled",
  [NOTIFICATION_SOUND_KEYS.VIP_SIGNAL]: "vip_signal_sound_enabled",
  [NOTIFICATION_SOUND_KEYS.BREAKING_NEWS]: "breaking_news_sound_enabled",
  [NOTIFICATION_SOUND_KEYS.ADMIN]: "admin_sound_enabled",
};

/** Keys without a dedicated legacy column fall back to default_sound_enabled. */
export const LEGACY_DEFAULT_COLUMN = "default_sound_enabled";

/** Legacy hyphenated sound types from Web Push / older code. */
export const LEGACY_SOUND_TYPE_TO_NOTIFICATION_KEY = {
  "price-alert": NOTIFICATION_SOUND_KEYS.PRICE_ALERT,
  "vip-signal": NOTIFICATION_SOUND_KEYS.VIP_SIGNAL,
  "breaking-news": NOTIFICATION_SOUND_KEYS.BREAKING_NEWS,
  default: NOTIFICATION_SOUND_KEYS.SYSTEM,
};

export function getNotificationSoundKeyDefinitions() {
  return NOTIFICATION_SOUND_KEY_ORDER.map((key) => ({
    key,
    label: NOTIFICATION_SOUND_KEY_LABELS_AR[key] || key,
  }));
}

export function normalizeNotificationKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return NOTIFICATION_SOUND_KEYS.SYSTEM;

  if (NOTIFICATION_SOUND_KEY_ORDER.includes(raw)) {
    return raw;
  }

  if (LEGACY_SOUND_TYPE_TO_NOTIFICATION_KEY[raw]) {
    return LEGACY_SOUND_TYPE_TO_NOTIFICATION_KEY[raw];
  }

  return raw.replace(/-/g, "_");
}

export function resolveNotificationKeyFromSiteType(notificationType) {
  switch (String(notificationType || "").trim()) {
    case "price-alert":
      return NOTIFICATION_SOUND_KEYS.PRICE_ALERT;
    case "vip-spot":
    case "vip-futures":
      return NOTIFICATION_SOUND_KEYS.VIP_SIGNAL;
    case "breaking-news":
      return NOTIFICATION_SOUND_KEYS.BREAKING_NEWS;
    case "analysis-reply":
      return NOTIFICATION_SOUND_KEYS.ANALYSIS_REPLY;
    case "subscription":
      return NOTIFICATION_SOUND_KEYS.SUBSCRIPTION_REQUEST;
    case "subscription-expired":
    case "subscription-renewal-reminder":
      return NOTIFICATION_SOUND_KEYS.SUBSCRIPTION_EXPIRY;
    default:
      return NOTIFICATION_SOUND_KEYS.SYSTEM;
  }
}

export function resolveNotificationKeyFromSource(source = "") {
  if (source === "admin-dashboard") {
    return NOTIFICATION_SOUND_KEYS.ADMIN;
  }

  return null;
}

export function resolveSoundAssetPath(soundId = DEFAULT_NOTIFICATION_SOUND_ASSET) {
  return (
    NOTIFICATION_SOUND_ASSETS[soundId] ||
    NOTIFICATION_SOUND_ASSETS[DEFAULT_NOTIFICATION_SOUND_ASSET]
  );
}
