import {
  DEFAULT_NOTIFICATION_SOUND_ASSET,
  NOTIFICATION_SOUND_ASSETS,
} from "./notification-sound-keys.js";
import {
  applySettingsPatch,
  normalizeNotificationSoundSettings,
  pickNotificationSoundSettingsPayload,
  sanitizeNotificationSoundSettingsUpdate,
} from "./notification-sound-settings-shared.js";

export const PHASE1_NOTIFICATION_CHANNELS = [
  {
    key: "price_alert",
    label: "إشعارات الأسعار",
    description: "تنبيهات وصول السعر إلى الهدف الذي حددته.",
    icon: "🔔",
  },
  {
    key: "vip_signal",
    label: "إشعارات VIP",
    description: "توصيات Spot و Futures الجديدة.",
    icon: "🚨",
  },
  {
    key: "market_news",
    label: "الأخبار المهمة",
    description: "أخبار السوق والتحديثات المهمة.",
    icon: "📰",
  },
  {
    key: "breaking_news",
    label: "الأخبار العاجلة",
    description: "أخبار عاجلة وتطورات لحظية.",
    icon: "⚡",
  },
  {
    key: "analysis_reply",
    label: "ردود التحليل",
    description: "رد الإدارة على طلبات التحليل.",
    icon: "📊",
  },
  {
    key: "account_management",
    label: "إدارة الحساب",
    description: "تحديثات طلبات إدارة الحساب.",
    icon: "💼",
  },
  {
    key: "subscription_expiry",
    label: "انتهاء الاشتراك",
    description: "تذكيرات وتنبيهات انتهاء الباقات.",
    icon: "⏳",
  },
  {
    key: "system",
    label: "إشعارات النظام",
    description: "إشعارات عامة وتحديثات المنصة.",
    icon: "⚙️",
  },
];

export const NOTIFICATION_SOUND_TONE_OPTIONS = Object.entries(NOTIFICATION_SOUND_ASSETS).map(
  ([id, path]) => ({
    id,
    label: id === "trading-alert" ? "تنبيه تداول" : id,
    path,
  })
);

export const DEFAULT_DND_START_TIME = "22:00";
export const DEFAULT_DND_END_TIME = "07:00";

function buildDefaultChannelEntry() {
  return {
    enabled: true,
    push_enabled: true,
    email_enabled: true,
  };
}

function buildDefaultChannelPreferences() {
  const preferences = {};

  for (const { key } of PHASE1_NOTIFICATION_CHANNELS) {
    preferences[key] = buildDefaultChannelEntry();
  }

  return preferences;
}

export const DEFAULT_CHANNEL_PREFERENCES = buildDefaultChannelPreferences();

export const DEFAULT_NOTIFICATION_SETTINGS = {
  ...normalizeNotificationSoundSettings({}),
  notifications_enabled: true,
  email_copy_enabled: false,
  dnd_enabled: false,
  dnd_start_time: DEFAULT_DND_START_TIME,
  dnd_end_time: DEFAULT_DND_END_TIME,
  channel_preferences: DEFAULT_CHANNEL_PREFERENCES,
};

function normalizeBooleanFlag(value, defaultValue = true) {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  return value !== false && value !== 0 && value !== "false";
}

function normalizeTimeValue(value, fallback) {
  const raw = String(value || fallback).trim();
  const match = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return fallback;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

export function getChannelPreference(settings, channelKey) {
  const normalized = normalizeNotificationSettings(settings || {});
  const key = String(channelKey || "").trim();
  const entry = normalized.channel_preferences?.[key] || buildDefaultChannelEntry();

  return {
    enabled: normalizeBooleanFlag(entry.enabled, true),
    push_enabled: normalizeBooleanFlag(entry.push_enabled, true),
    email_enabled: normalizeBooleanFlag(entry.email_enabled, true),
  };
}

export function normalizeChannelPreferences(input = {}) {
  const raw = input && typeof input === "object" ? input : {};
  const normalized = buildDefaultChannelPreferences();

  for (const { key } of PHASE1_NOTIFICATION_CHANNELS) {
    const entry = raw[key];
    if (!entry || typeof entry !== "object") continue;

    normalized[key] = {
      enabled: normalizeBooleanFlag(entry.enabled, true),
      push_enabled: normalizeBooleanFlag(entry.push_enabled, true),
      email_enabled: normalizeBooleanFlag(entry.email_enabled, true),
    };
  }

  return normalized;
}

export function normalizeNotificationSettings(input = {}) {
  const sound = normalizeNotificationSoundSettings(input);

  return {
    ...sound,
    notifications_enabled: input.notifications_enabled !== false,
    email_copy_enabled: input.email_copy_enabled === true,
    dnd_enabled: input.dnd_enabled === true,
    dnd_start_time: normalizeTimeValue(input.dnd_start_time, DEFAULT_DND_START_TIME),
    dnd_end_time: normalizeTimeValue(input.dnd_end_time, DEFAULT_DND_END_TIME),
    channel_preferences: normalizeChannelPreferences(input.channel_preferences),
  };
}

export function pickNotificationSettingsPayload(input = {}) {
  const normalized = normalizeNotificationSettings(input);

  return {
    ...pickNotificationSoundSettingsPayload(normalized),
    notifications_enabled: normalized.notifications_enabled,
    email_copy_enabled: normalized.email_copy_enabled,
    dnd_enabled: normalized.dnd_enabled,
    dnd_start_time: normalized.dnd_start_time,
    dnd_end_time: normalized.dnd_end_time,
    channel_preferences: normalized.channel_preferences,
  };
}

export function sanitizeNotificationSettingsUpdate(body = {}) {
  const patch = sanitizeNotificationSoundSettingsUpdate(body);

  if ("notifications_enabled" in body) {
    patch.notifications_enabled = Boolean(body.notifications_enabled);
  }

  if ("email_copy_enabled" in body) {
    patch.email_copy_enabled = Boolean(body.email_copy_enabled);
  }

  if ("dnd_enabled" in body) {
    patch.dnd_enabled = Boolean(body.dnd_enabled);
  }

  if ("dnd_start_time" in body) {
    patch.dnd_start_time = normalizeTimeValue(body.dnd_start_time, DEFAULT_DND_START_TIME);
  }

  if ("dnd_end_time" in body) {
    patch.dnd_end_time = normalizeTimeValue(body.dnd_end_time, DEFAULT_DND_END_TIME);
  }

  if (body.channel_preferences && typeof body.channel_preferences === "object") {
    patch.channel_preferences = body.channel_preferences;
  }

  return patch;
}

export function mergeChannelPreferencesPatch(current = {}, patch = {}) {
  const next = normalizeChannelPreferences(current);

  for (const [key, value] of Object.entries(patch || {})) {
    if (!value || typeof value !== "object") continue;
    if (!PHASE1_NOTIFICATION_CHANNELS.some((item) => item.key === key)) continue;

    next[key] = {
      ...(next[key] || buildDefaultChannelEntry()),
      ...value,
    };
  }

  return normalizeChannelPreferences(next);
}

export function applyNotificationSettingsPatch(currentSettings = {}, patch = {}) {
  const soundPatch = sanitizeNotificationSoundSettingsUpdate(patch);
  const mergedSound = applySettingsPatch(
    normalizeNotificationSoundSettings(currentSettings),
    soundPatch
  );

  const merged = normalizeNotificationSettings({
    ...mergedSound,
    notifications_enabled:
      patch.notifications_enabled !== undefined
        ? patch.notifications_enabled
        : currentSettings.notifications_enabled,
    email_copy_enabled:
      patch.email_copy_enabled !== undefined
        ? patch.email_copy_enabled
        : currentSettings.email_copy_enabled,
    dnd_enabled:
      patch.dnd_enabled !== undefined ? patch.dnd_enabled : currentSettings.dnd_enabled,
    dnd_start_time:
      patch.dnd_start_time !== undefined
        ? patch.dnd_start_time
        : currentSettings.dnd_start_time,
    dnd_end_time:
      patch.dnd_end_time !== undefined ? patch.dnd_end_time : currentSettings.dnd_end_time,
    channel_preferences:
      patch.channel_preferences !== undefined
        ? normalizeChannelPreferences(patch.channel_preferences)
        : normalizeChannelPreferences(currentSettings.channel_preferences),
  });

  return merged;
}

export function getDefaultGlobalSoundTone(settings = {}) {
  const preferences = settings.sound_preferences || {};
  const firstKey = PHASE1_NOTIFICATION_CHANNELS[0]?.key;
  const tone = preferences[firstKey]?.sound || DEFAULT_NOTIFICATION_SOUND_ASSET;
  return NOTIFICATION_SOUND_TONE_OPTIONS.some((item) => item.id === tone)
    ? tone
    : DEFAULT_NOTIFICATION_SOUND_ASSET;
}

export function buildNotificationSettingsResetPayload() {
  return normalizeNotificationSettings(DEFAULT_NOTIFICATION_SETTINGS);
}
