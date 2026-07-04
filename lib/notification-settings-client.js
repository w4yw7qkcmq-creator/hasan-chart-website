import {
  buildNotificationSettingsResetPayload,
  normalizeNotificationSettings,
} from "./notification-settings-shared.js";
import { applyServerNotificationSettings } from "./notification-settings-store.js";

function logNotificationSettingsClient(event, details = {}) {
  console.log(event, details);
}

async function parseJsonResponse(response) {
  return response.json().catch(() => null);
}

export async function loadNotificationSettings() {
  logNotificationSettingsClient("NOTIFICATION_SETTINGS_LOAD_START");

  const response = await fetch("/api/notification-settings", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });

  const result = await parseJsonResponse(response);

  if (!response.ok || !result?.success) {
    const errorMessage = result?.error || "Failed to load notification settings";
    logNotificationSettingsClient("NOTIFICATION_SETTINGS_SAVE_ERROR", {
      phase: "load",
      status: response.status,
      error: errorMessage,
    });
    throw new Error(errorMessage);
  }

  const normalized = normalizeNotificationSettings(result.settings);
  applyServerNotificationSettings(normalized);

  logNotificationSettingsClient("NOTIFICATION_SETTINGS_LOAD_SUCCESS", {
    notifications_enabled: normalized.notifications_enabled,
    email_copy_enabled: normalized.email_copy_enabled,
    channel_preferences: normalized.channel_preferences,
  });

  return {
    settings: normalized,
  };
}

export async function saveNotificationSettings(settings = {}) {
  const payload = normalizeNotificationSettings(settings);

  logNotificationSettingsClient("NOTIFICATION_SETTINGS_SAVE_START");
  logNotificationSettingsClient("NOTIFICATION_SETTINGS_SAVE_PAYLOAD", {
    notifications_enabled: payload.notifications_enabled,
    email_copy_enabled: payload.email_copy_enabled,
    channel_preferences: payload.channel_preferences,
    sound_enabled: payload.sound_enabled,
  });

  const response = await fetch("/api/notification-settings", {
    method: "PUT",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = await parseJsonResponse(response);

  if (!response.ok || !result?.success) {
    const errorMessage = result?.error || "Failed to save notification settings";
    logNotificationSettingsClient("NOTIFICATION_SETTINGS_SAVE_ERROR", {
      phase: "save",
      status: response.status,
      error: errorMessage,
    });
    throw new Error(errorMessage);
  }

  const normalized = normalizeNotificationSettings(result.settings);
  applyServerNotificationSettings(normalized);

  logNotificationSettingsClient("NOTIFICATION_SETTINGS_SAVE_SUCCESS", {
    notifications_enabled: normalized.notifications_enabled,
    email_copy_enabled: normalized.email_copy_enabled,
    channel_preferences: normalized.channel_preferences,
  });

  return {
    settings: normalized,
  };
}

export async function resetNotificationSettings() {
  return saveNotificationSettings(buildNotificationSettingsResetPayload());
}
