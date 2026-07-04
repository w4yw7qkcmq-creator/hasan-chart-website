import {
  applyNotificationSettingsPatch,
  DEFAULT_NOTIFICATION_SETTINGS,
  normalizeNotificationSettings,
} from "./notification-settings-shared.js";
import {
  getNotificationKeyVolume,
  isNotificationKeyEnabled,
} from "./notification-sound-settings-shared.js";
import {
  LEGACY_SOUND_TYPE_TO_NOTIFICATION_KEY,
  NOTIFICATION_SOUND_KEYS,
} from "./notification-sound-keys.js";
import {
  applyServerNotificationSettings,
  getActiveNotificationSettings,
  getNotificationSettingsMode,
  initializeGuestNotificationSettings,
  patchActiveNotificationSettings,
  resetNotificationSettingsToGuest,
  setActiveNotificationSettings,
} from "./notification-settings-store.js";

export const GUEST_NOTIFICATION_SOUND_SETTINGS_KEY = "notification_settings_guest";

export {
  getNotificationSettingsMode as getNotificationSoundSettingsMode,
  getActiveNotificationSettings as getActiveNotificationSoundSettings,
  applyServerNotificationSettings as applyServerNotificationSoundSettings,
  resetNotificationSettingsToGuest as resetNotificationSoundSettingsToGuest,
  initializeGuestNotificationSettings as initializeGuestNotificationSoundSettings,
  setActiveNotificationSettings as setActiveNotificationSoundSettings,
};

export function patchActiveNotificationSoundSettings(patch = {}, options = {}) {
  return patchActiveNotificationSettings(patch, options);
}

export function isNotificationKeySoundEnabled(notificationKey) {
  return isNotificationKeyEnabled(getActiveNotificationSettings(), notificationKey);
}

export function getActiveNotificationKeyVolume(notificationKey) {
  return getNotificationKeyVolume(getActiveNotificationSettings(), notificationKey);
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
  return getActiveNotificationSettings().sound_enabled !== false;
}

export function getNotificationSoundVolumeSetting() {
  return getActiveNotificationSettings().sound_volume;
}

export { DEFAULT_NOTIFICATION_SETTINGS as DEFAULT_NOTIFICATION_SOUND_SETTINGS };
