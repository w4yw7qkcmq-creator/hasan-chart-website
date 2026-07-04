import { normalizeNotificationKey } from "./notification-sound-keys.js";
import {
  DEFAULT_DND_END_TIME,
  DEFAULT_DND_START_TIME,
  getChannelPreference,
  normalizeNotificationSettings,
} from "./notification-settings-shared.js";
import {
  isNotificationKeyEnabled,
} from "./notification-sound-settings-shared.js";

export function parseTimeToMinutes(value, fallback = "00:00") {
  const raw = String(value || fallback).trim();
  const match = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function isWithinDndWindow(settings, date = new Date()) {
  const normalized = normalizeNotificationSettings(settings || {});

  if (!normalized.dnd_enabled) {
    return false;
  }

  const start = parseTimeToMinutes(normalized.dnd_start_time, DEFAULT_DND_START_TIME);
  const end = parseTimeToMinutes(normalized.dnd_end_time, DEFAULT_DND_END_TIME);
  const now = date.getHours() * 60 + date.getMinutes();

  if (start === end) {
    return false;
  }

  if (start < end) {
    return now >= start && now < end;
  }

  return now >= start || now < end;
}

export function isNotificationChannelEnabled(settings, notificationKey) {
  const normalized = normalizeNotificationSettings(settings || {});
  const key = normalizeNotificationKey(notificationKey);
  return getChannelPreference(normalized, key).enabled;
}

export function evaluateNotificationDelivery(settings, notificationKey) {
  const normalized = normalizeNotificationSettings(settings || {});
  const key = normalizeNotificationKey(notificationKey);
  const channel = getChannelPreference(normalized, key);
  const masterEnabled = normalized.notifications_enabled !== false;
  const dndActive = isWithinDndWindow(normalized);
  const soundTypeEnabled = isNotificationKeyEnabled(normalized, key);
  const masterSoundEnabled = normalized.sound_enabled !== false;
  const emailCopyEnabled = normalized.email_copy_enabled === true;

  let blockedReason = null;

  if (!masterEnabled) {
    blockedReason = "notifications-disabled";
  } else if (!channel.enabled) {
    blockedReason = "channel-disabled";
  } else if (dndActive) {
    blockedReason = "dnd-active";
  }

  const deliveryAllowed = masterEnabled && channel.enabled && !dndActive;
  const emailAllowed =
    deliveryAllowed && (emailCopyEnabled || channel.email_enabled);

  return {
    notificationKey: key,
    channelEnabled: channel.enabled,
    pushEnabled: channel.push_enabled,
    emailChannelEnabled: channel.email_enabled,
    masterEnabled,
    dndActive,
    emailCopyEnabled,
    blockedReason,
    inApp: deliveryAllowed,
    push: deliveryAllowed && channel.push_enabled,
    email: emailAllowed,
    sound: deliveryAllowed && masterSoundEnabled && soundTypeEnabled,
  };
}

export function logNotificationDeliveryDecision(event, details = {}) {
  console.log(event, details);
}
