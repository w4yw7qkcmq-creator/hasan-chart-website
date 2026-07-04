import { loadNotificationSettings, saveNotificationSettings } from "./notification-settings-client.js";
import {
  applyServerNotificationSettings,
  getActiveNotificationSettings,
  initializeGuestNotificationSettings,
  patchActiveNotificationSettings,
  resetNotificationSettingsToGuest,
} from "./notification-settings-store.js";
import { normalizeNotificationSettings } from "./notification-settings-shared.js";
import { sanitizeNotificationSoundSettingsUpdate } from "./notification-sound-settings-shared.js";

export async function loadServerNotificationSoundSettings() {
  const result = await loadNotificationSettings();
  const settings = normalizeNotificationSettings(result.settings);
  return applyServerNotificationSettings(settings);
}

export async function saveServerNotificationSoundSettings(patch = {}) {
  const soundPatch = sanitizeNotificationSoundSettingsUpdate(patch);
  const result = await saveNotificationSettings(soundPatch);
  const settings = normalizeNotificationSettings(result.settings);
  return applyServerNotificationSettings(settings);
}

export async function updateNotificationSoundSettings(patch = {}, { isAuthenticated = false } = {}) {
  if (isAuthenticated) {
    return saveServerNotificationSoundSettings(patch);
  }

  return patchActiveNotificationSettings(patch);
}

export function bootstrapGuestNotificationSoundSettings() {
  return initializeGuestNotificationSettings();
}

export function bootstrapLoggedOutNotificationSoundSettings() {
  resetNotificationSettingsToGuest();
}

export function readCurrentNotificationSoundSettings() {
  return getActiveNotificationSettings();
}
