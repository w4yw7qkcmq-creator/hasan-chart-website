import {
  applySettingsPatch,
  DEFAULT_NOTIFICATION_SOUND_SETTINGS,
  getNotificationKeyVolume,
  isNotificationKeyEnabled,
  normalizeNotificationSoundSettings,
} from "./notification-sound-settings-shared.js";
import {
  LEGACY_SOUND_TYPE_TO_NOTIFICATION_KEY,
  NOTIFICATION_SOUND_KEYS,
} from "./notification-sound-keys.js";

export const GUEST_NOTIFICATION_SOUND_SETTINGS_KEY = "notification_sound_settings_guest";

let activeSettings = normalizeNotificationSoundSettings(DEFAULT_NOTIFICATION_SOUND_SETTINGS);
let settingsMode = "guest";

function readGuestSettingsFromStorage() {
  if (typeof window === "undefined") {
    return normalizeNotificationSoundSettings(DEFAULT_NOTIFICATION_SOUND_SETTINGS);
  }

  try {
    const raw = window.localStorage.getItem(GUEST_NOTIFICATION_SOUND_SETTINGS_KEY);
    if (!raw) {
      return normalizeNotificationSoundSettings(DEFAULT_NOTIFICATION_SOUND_SETTINGS);
    }

    return normalizeNotificationSoundSettings(JSON.parse(raw));
  } catch {
    return normalizeNotificationSoundSettings(DEFAULT_NOTIFICATION_SOUND_SETTINGS);
  }
}

function writeGuestSettingsToStorage(settings) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    GUEST_NOTIFICATION_SOUND_SETTINGS_KEY,
    JSON.stringify(normalizeNotificationSoundSettings(settings))
  );
}

export function getNotificationSoundSettingsMode() {
  return settingsMode;
}

export function getActiveNotificationSoundSettings() {
  return activeSettings;
}

export function setActiveNotificationSoundSettings(settings, { mode = settingsMode } = {}) {
  activeSettings = normalizeNotificationSoundSettings(settings);
  settingsMode = mode;

  if (mode === "guest") {
    writeGuestSettingsToStorage(activeSettings);
  }
}

export function initializeGuestNotificationSoundSettings() {
  const guestSettings = readGuestSettingsFromStorage();
  setActiveNotificationSoundSettings(guestSettings, { mode: "guest" });
  return guestSettings;
}

export function applyServerNotificationSoundSettings(settings) {
  setActiveNotificationSoundSettings(settings, { mode: "server" });
  return activeSettings;
}

export function resetNotificationSoundSettingsToGuest() {
  initializeGuestNotificationSoundSettings();
}

export function patchActiveNotificationSoundSettings(patch = {}, { persistGuest = true } = {}) {
  const nextSettings = applySettingsPatch(activeSettings, patch);

  setActiveNotificationSoundSettings(nextSettings, {
    mode: settingsMode === "server" ? "server" : "guest",
  });

  if (settingsMode === "guest" && persistGuest) {
    writeGuestSettingsToStorage(nextSettings);
  }

  return nextSettings;
}

export function isNotificationKeySoundEnabled(notificationKey) {
  return isNotificationKeyEnabled(getActiveNotificationSoundSettings(), notificationKey);
}

export function getActiveNotificationKeyVolume(notificationKey) {
  return getNotificationKeyVolume(getActiveNotificationSoundSettings(), notificationKey);
}

export function isNotificationSoundCategoryEnabled(soundType, source = "site") {
  if (source === "admin-dashboard") {
    return isNotificationKeySoundEnabled(NOTIFICATION_SOUND_KEYS.ADMIN);
  }

  const notificationKey =
    LEGACY_SOUND_TYPE_TO_NOTIFICATION_KEY[soundType] || NOTIFICATION_SOUND_KEYS.SYSTEM;

  return isNotificationKeySoundEnabled(notificationKey);
}

export function isNotificationSoundMasterEnabled() {
  return getActiveNotificationSoundSettings().sound_enabled;
}

export function getNotificationSoundVolumeSetting() {
  return getActiveNotificationSoundSettings().sound_volume;
}
