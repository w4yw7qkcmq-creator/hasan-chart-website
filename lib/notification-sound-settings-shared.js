import {
  DEFAULT_NOTIFICATION_SOUND_ASSET,
  NOTIFICATION_SOUND_KEY_ORDER,
  normalizeNotificationKey,
} from "./notification-sound-keys.js";

export const DEFAULT_NOTIFICATION_SOUND_SETTINGS = {
  sound_enabled: true,
  sound_volume: 0.9,
  price_alert_sound_enabled: true,
  vip_signal_sound_enabled: true,
  breaking_news_sound_enabled: true,
  admin_sound_enabled: true,
  default_sound_enabled: true,
  sound_preferences: {},
};

export const NOTIFICATION_SOUND_SETTINGS_FIELDS = [
  "sound_enabled",
  "sound_volume",
  "price_alert_sound_enabled",
  "vip_signal_sound_enabled",
  "breaking_news_sound_enabled",
  "admin_sound_enabled",
  "default_sound_enabled",
];

const LEGACY_COLUMN_BY_KEY = {
  price_alert: "price_alert_sound_enabled",
  vip_signal: "vip_signal_sound_enabled",
  breaking_news: "breaking_news_sound_enabled",
  admin: "admin_sound_enabled",
};

export function clampNotificationSoundVolume(value, fallback = 0.9) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
}

export function buildDefaultKeyPreference(settings, notificationKey) {
  const key = normalizeNotificationKey(notificationKey);
  const legacyColumn = LEGACY_COLUMN_BY_KEY[key] || "default_sound_enabled";
  const enabled = settings?.[legacyColumn] !== false;

  return {
    enabled,
    sound: DEFAULT_NOTIFICATION_SOUND_ASSET,
    volume: clampNotificationSoundVolume(settings?.sound_volume, 0.9),
  };
}

export function buildDefaultSoundPreferences(settings = {}) {
  const preferences = {};

  for (const key of NOTIFICATION_SOUND_KEY_ORDER) {
    preferences[key] = buildDefaultKeyPreference(settings, key);
  }

  return preferences;
}

export function normalizeKeyPreference(input = {}, settings = {}) {
  const fallback = buildDefaultKeyPreference(settings, input.notificationKey);

  const enabled =
    input.enabled === undefined
      ? fallback.enabled
      : input.enabled !== false && input.enabled !== 0 && input.enabled !== "false";

  return {
    enabled,
    sound: String(input.sound || fallback.sound || DEFAULT_NOTIFICATION_SOUND_ASSET),
    volume: clampNotificationSoundVolume(
      input.volume ?? fallback.volume,
      fallback.volume
    ),
  };
}

export function normalizeSoundPreferences(input = {}, settings = {}) {
  const raw = input && typeof input === "object" ? input : {};
  const normalized = buildDefaultSoundPreferences(settings);

  for (const key of NOTIFICATION_SOUND_KEY_ORDER) {
    if (raw[key] && typeof raw[key] === "object") {
      normalized[key] = normalizeKeyPreference(
        { ...raw[key], notificationKey: key },
        settings
      );
    }
  }

  return normalized;
}

export function normalizeNotificationSoundSettings(input = {}) {
  const base = {
    sound_enabled: input.sound_enabled !== false,
    sound_volume: clampNotificationSoundVolume(
      input.sound_volume ?? DEFAULT_NOTIFICATION_SOUND_SETTINGS.sound_volume
    ),
    price_alert_sound_enabled: input.price_alert_sound_enabled !== false,
    vip_signal_sound_enabled: input.vip_signal_sound_enabled !== false,
    breaking_news_sound_enabled: input.breaking_news_sound_enabled !== false,
    admin_sound_enabled: input.admin_sound_enabled !== false,
    default_sound_enabled: input.default_sound_enabled !== false,
  };

  return {
    ...base,
    sound_preferences: normalizeSoundPreferences(input.sound_preferences, base),
  };
}

export function getNotificationKeyPreference(settings, notificationKey) {
  const key = normalizeNotificationKey(notificationKey);
  const normalized = normalizeNotificationSoundSettings(settings);
  const preferences = normalized.sound_preferences || {};

  if (preferences[key]) {
    return preferences[key];
  }

  return buildDefaultKeyPreference(normalized, key);
}

export function isNotificationKeyEnabled(settings, notificationKey) {
  const normalized = normalizeNotificationSoundSettings(settings);

  if (!normalized.sound_enabled) {
    return false;
  }

  return getNotificationKeyPreference(normalized, notificationKey).enabled !== false;
}

export function getNotificationKeyVolume(settings, notificationKey) {
  const normalized = normalizeNotificationSoundSettings(settings);
  const preference = getNotificationKeyPreference(normalized, notificationKey);

  return clampNotificationSoundVolume(
    preference.volume ?? normalized.sound_volume,
    normalized.sound_volume
  );
}

export function syncLegacyColumnsFromPreferences(settings) {
  const normalized = normalizeNotificationSoundSettings(settings);
  const preferences = normalized.sound_preferences || {};

  const legacyPatch = {
    price_alert_sound_enabled: preferences.price_alert?.enabled !== false,
    vip_signal_sound_enabled: preferences.vip_signal?.enabled !== false,
    breaking_news_sound_enabled: preferences.breaking_news?.enabled !== false,
    admin_sound_enabled: preferences.admin?.enabled !== false,
    default_sound_enabled: preferences.system?.enabled !== false,
  };

  return {
    ...normalized,
    ...legacyPatch,
  };
}

export function pickNotificationSoundSettingsPayload(input = {}) {
  const normalized = syncLegacyColumnsFromPreferences(input);

  return {
    sound_enabled: normalized.sound_enabled,
    sound_volume: normalized.sound_volume,
    price_alert_sound_enabled: normalized.price_alert_sound_enabled,
    vip_signal_sound_enabled: normalized.vip_signal_sound_enabled,
    breaking_news_sound_enabled: normalized.breaking_news_sound_enabled,
    admin_sound_enabled: normalized.admin_sound_enabled,
    default_sound_enabled: normalized.default_sound_enabled,
    sound_preferences: normalized.sound_preferences,
  };
}

export function mergeSoundPreferencesPatch(currentPreferences = {}, patch = {}) {
  const next = { ...(currentPreferences || {}) };

  for (const [key, value] of Object.entries(patch || {})) {
    const normalizedKey = normalizeNotificationKey(key);
    if (!value || typeof value !== "object") continue;

    next[normalizedKey] = normalizeKeyPreference(
      {
        ...(next[normalizedKey] || {}),
        ...value,
        notificationKey: normalizedKey,
      },
      {}
    );
  }

  return next;
}

export function sanitizeNotificationSoundSettingsUpdate(body = {}) {
  const patch = {};

  for (const field of NOTIFICATION_SOUND_SETTINGS_FIELDS) {
    if (!(field in body)) continue;

    if (field === "sound_volume") {
      patch[field] = clampNotificationSoundVolume(body[field]);
      continue;
    }

    patch[field] = Boolean(body[field]);
  }

  if (body.sound_preferences && typeof body.sound_preferences === "object") {
    patch.sound_preferences = body.sound_preferences;
  }

  return patch;
}

export function applySettingsPatch(currentSettings = {}, patch = {}) {
  const merged = {
    ...normalizeNotificationSoundSettings(currentSettings),
    ...patch,
  };

  if (patch.sound_preferences) {
    merged.sound_preferences = mergeSoundPreferencesPatch(
      currentSettings.sound_preferences,
      patch.sound_preferences
    );
  }

  if (patch.sound_volume !== undefined) {
    merged.sound_preferences = normalizeSoundPreferences(merged.sound_preferences, merged);
    for (const key of NOTIFICATION_SOUND_KEY_ORDER) {
      if (!patch.sound_preferences?.[key]) {
        merged.sound_preferences[key] = {
          ...merged.sound_preferences[key],
          volume: merged.sound_volume,
        };
      }
    }
  }

  return syncLegacyColumnsFromPreferences(merged);
}
