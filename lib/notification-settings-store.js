import {
  applyNotificationSettingsPatch,
  DEFAULT_NOTIFICATION_SETTINGS,
  normalizeNotificationSettings,
} from "./notification-settings-shared.js";

export const GUEST_NOTIFICATION_SETTINGS_KEY = "notification_settings_guest";

let activeSettings = normalizeNotificationSettings(DEFAULT_NOTIFICATION_SETTINGS);
let settingsMode = "guest";

function readGuestSettingsFromStorage() {
  if (typeof window === "undefined") {
    return normalizeNotificationSettings(DEFAULT_NOTIFICATION_SETTINGS);
  }

  try {
    const raw = window.localStorage.getItem(GUEST_NOTIFICATION_SETTINGS_KEY);
    if (!raw) {
      return normalizeNotificationSettings(DEFAULT_NOTIFICATION_SETTINGS);
    }

    return normalizeNotificationSettings(JSON.parse(raw));
  } catch {
    return normalizeNotificationSettings(DEFAULT_NOTIFICATION_SETTINGS);
  }
}

function writeGuestSettingsToStorage(settings) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    GUEST_NOTIFICATION_SETTINGS_KEY,
    JSON.stringify(normalizeNotificationSettings(settings))
  );
}

export function getNotificationSettingsMode() {
  return settingsMode;
}

export function getActiveNotificationSettings() {
  return activeSettings;
}

export function setActiveNotificationSettings(settings, { mode = settingsMode } = {}) {
  activeSettings = normalizeNotificationSettings(settings);
  settingsMode = mode;

  if (mode === "guest") {
    writeGuestSettingsToStorage(activeSettings);
  }
}

export function initializeGuestNotificationSettings() {
  const guestSettings = readGuestSettingsFromStorage();
  setActiveNotificationSettings(guestSettings, { mode: "guest" });
  return guestSettings;
}

export function applyServerNotificationSettings(settings) {
  setActiveNotificationSettings(settings, { mode: "server" });
  return activeSettings;
}

export function resetNotificationSettingsToGuest() {
  initializeGuestNotificationSettings();
}

export function patchActiveNotificationSettings(patch = {}, { persistGuest = true } = {}) {
  const nextSettings = applyNotificationSettingsPatch(activeSettings, patch);

  setActiveNotificationSettings(nextSettings, {
    mode: settingsMode === "server" ? "server" : "guest",
  });

  if (settingsMode === "guest" && persistGuest) {
    writeGuestSettingsToStorage(nextSettings);
  }

  return nextSettings;
}
