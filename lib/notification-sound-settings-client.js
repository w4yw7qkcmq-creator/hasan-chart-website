import {
  applyServerNotificationSoundSettings,
  getActiveNotificationSoundSettings,
  initializeGuestNotificationSoundSettings,
  patchActiveNotificationSoundSettings,
  resetNotificationSoundSettingsToGuest,
} from "./notification-sound-settings-store.js";
import { normalizeNotificationSoundSettings } from "./notification-sound-settings-shared.js";

async function parseJsonResponse(response) {
  return response.json().catch(() => null);
}

export async function loadServerNotificationSoundSettings() {
  const response = await fetch("/api/notification-sound-settings", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });

  const result = await parseJsonResponse(response);

  if (!response.ok || !result?.success) {
    throw new Error(result?.error || "Failed to load notification sound settings");
  }

  const settings = applyServerNotificationSoundSettings(
    normalizeNotificationSoundSettings(result.settings)
  );

  return settings;
}

export async function saveServerNotificationSoundSettings(patch = {}) {
  const response = await fetch("/api/notification-sound-settings", {
    method: "PUT",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(patch),
  });

  const result = await parseJsonResponse(response);

  if (!response.ok || !result?.success) {
    throw new Error(result?.error || "Failed to save notification sound settings");
  }

  const settings = applyServerNotificationSoundSettings(
    normalizeNotificationSoundSettings(result.settings)
  );

  return settings;
}

export async function updateNotificationSoundSettings(patch = {}, { isAuthenticated = false } = {}) {
  if (isAuthenticated) {
    return saveServerNotificationSoundSettings(patch);
  }

  return patchActiveNotificationSoundSettings(patch);
}

export function bootstrapGuestNotificationSoundSettings() {
  return initializeGuestNotificationSoundSettings();
}

export function bootstrapLoggedOutNotificationSoundSettings() {
  resetNotificationSoundSettingsToGuest();
}

export function readCurrentNotificationSoundSettings() {
  return getActiveNotificationSoundSettings();
}
