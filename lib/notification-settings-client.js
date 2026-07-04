import {
  buildNotificationSettingsResetPayload,
  normalizeNotificationSettings,
} from "./notification-settings-shared.js";
import { applyServerNotificationSettings } from "./notification-settings-store.js";

async function parseJsonResponse(response) {
  return response.json().catch(() => null);
}

export async function loadNotificationSettings() {
  const response = await fetch("/api/notification-settings", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });

  const result = await parseJsonResponse(response);

  if (!response.ok || !result?.success) {
    throw new Error(result?.error || "Failed to load notification settings");
  }

  return normalizeNotificationSettings(result.settings);
}

export async function saveNotificationSettings(settings = {}) {
  const response = await fetch("/api/notification-settings", {
    method: "PUT",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(settings),
  });

  const result = await parseJsonResponse(response);

  if (!response.ok || !result?.success) {
    throw new Error(result?.error || "Failed to save notification settings");
  }

  const normalized = normalizeNotificationSettings(result.settings);
  applyServerNotificationSettings(normalized);
  return normalized;
}

export async function resetNotificationSettings() {
  return saveNotificationSettings(buildNotificationSettingsResetPayload());
}
