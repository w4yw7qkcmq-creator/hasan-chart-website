const DEFAULT_DND_START_TIME = "22:00";
const DEFAULT_DND_END_TIME = "07:00";

const PHASE1_CHANNEL_KEYS = [
  "price_alert",
  "vip_signal",
  "market_news",
  "breaking_news",
  "analysis_reply",
  "account_management",
  "subscription_expiry",
  "system",
];

function normalizeNotificationKey(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "system";
  if (PHASE1_CHANNEL_KEYS.includes(raw)) return raw;
  const underscored = raw.replace(/-/g, "_");
  if (PHASE1_CHANNEL_KEYS.includes(underscored)) return underscored;
  if (raw === "price-alert") return "price_alert";
  if (raw === "vip-signal" || raw === "vip-spot" || raw === "vip-futures") return "vip_signal";
  if (raw === "breaking-news") return "breaking_news";
  if (raw === "analysis-reply") return "analysis_reply";
  if (raw === "account-management") return "account_management";
  if (raw === "subscription-expired" || raw === "subscription-renewal-reminder") {
    return "subscription_expiry";
  }
  if (raw === "market-news" || raw === "market_news") return "market_news";
  return "system";
}

function normalizeBooleanFlag(value, defaultValue = true) {
  if (value === undefined || value === null) return defaultValue;
  return value !== false && value !== 0 && value !== "false";
}

function buildDefaultChannelEntry() {
  return {
    enabled: true,
    push_enabled: true,
    email_enabled: true,
  };
}

function buildDefaultChannelPreferences() {
  const preferences = {};
  for (const key of PHASE1_CHANNEL_KEYS) {
    preferences[key] = buildDefaultChannelEntry();
  }
  return preferences;
}

function normalizeTimeValue(value, fallback) {
  const raw = String(value || fallback).trim();
  const match = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return fallback;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function normalizeChannelPreferences(input = {}) {
  const raw = input && typeof input === "object" ? input : {};
  const normalized = buildDefaultChannelPreferences();

  for (const key of PHASE1_CHANNEL_KEYS) {
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

function getChannelPreference(settings, channelKey) {
  const key = String(channelKey || "").trim();
  const entry = settings?.channel_preferences?.[key] || buildDefaultChannelEntry();
  return {
    enabled: normalizeBooleanFlag(entry.enabled, true),
    push_enabled: normalizeBooleanFlag(entry.push_enabled, true),
    email_enabled: normalizeBooleanFlag(entry.email_enabled, true),
  };
}

function normalizeSettings(input = {}) {
  return {
    notifications_enabled: input.notifications_enabled !== false,
    sound_enabled: input.sound_enabled !== false,
    email_copy_enabled: input.email_copy_enabled === true,
    dnd_enabled: input.dnd_enabled === true,
    dnd_start_time: normalizeTimeValue(input.dnd_start_time, DEFAULT_DND_START_TIME),
    dnd_end_time: normalizeTimeValue(input.dnd_end_time, DEFAULT_DND_END_TIME),
    channel_preferences: normalizeChannelPreferences(input.channel_preferences),
  };
}

function parseTimeToMinutes(value, fallback) {
  const raw = String(value || fallback).trim();
  const match = raw.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

function isWithinDndWindow(settings, date = new Date()) {
  if (!settings?.dnd_enabled) return false;

  const start = parseTimeToMinutes(settings.dnd_start_time, DEFAULT_DND_START_TIME);
  const end = parseTimeToMinutes(settings.dnd_end_time, DEFAULT_DND_END_TIME);
  const now = date.getHours() * 60 + date.getMinutes();

  if (start === end) return false;
  if (start < end) return now >= start && now < end;
  return now >= start || now < end;
}

function evaluateNotificationDelivery(settings, notificationKey) {
  const normalized = normalizeSettings(settings || {});
  const key = normalizeNotificationKey(notificationKey);
  const channel = getChannelPreference(normalized, key);
  const masterEnabled = normalized.notifications_enabled !== false;
  const dndActive = isWithinDndWindow(normalized);

  let blockedReason = null;
  if (!masterEnabled) blockedReason = "notifications-disabled";
  else if (!channel.enabled) blockedReason = "channel-disabled";
  else if (dndActive) blockedReason = "dnd-active";

  const deliveryAllowed = masterEnabled && channel.enabled && !dndActive;
  const emailAllowed =
    deliveryAllowed && (normalized.email_copy_enabled === true || channel.email_enabled);

  return {
    notificationKey: key,
    channelEnabled: channel.enabled,
    pushEnabled: channel.push_enabled,
    emailChannelEnabled: channel.email_enabled,
    masterEnabled,
    dndActive,
    emailCopyEnabled: normalized.email_copy_enabled === true,
    blockedReason,
    inApp: deliveryAllowed,
    push: deliveryAllowed && channel.push_enabled,
    email: emailAllowed,
    sound: deliveryAllowed && normalized.sound_enabled !== false,
  };
}

async function resolveUserIdByEmail(supabase, userEmail) {
  const normalizedEmail = String(userEmail || "").trim().toLowerCase();
  if (!normalizedEmail) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .ilike("email", normalizedEmail)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.id || null;
}

async function fetchSettingsRow(supabase, userId) {
  const { data, error } = await supabase
    .from("user_notification_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function createDefaultSettingsRow(supabase, userId) {
  const { data, error } = await supabase
    .from("user_notification_settings")
    .insert({
      user_id: userId,
      notifications_enabled: true,
      sound_enabled: true,
      sound_volume: 0.9,
      price_alert_sound_enabled: true,
      vip_signal_sound_enabled: true,
      breaking_news_sound_enabled: true,
      admin_sound_enabled: true,
      default_sound_enabled: true,
    })
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function loadNotificationSettingsForRecipient(
  supabase,
  { userEmail = null, userId = null } = {}
) {
  let resolvedUserId = userId || null;

  if (!resolvedUserId && userEmail) {
    resolvedUserId = await resolveUserIdByEmail(supabase, userEmail);
  }

  if (!resolvedUserId) {
    return normalizeSettings({});
  }

  let row = await fetchSettingsRow(supabase, resolvedUserId);
  if (!row) {
    row = await createDefaultSettingsRow(supabase, resolvedUserId);
  }

  return normalizeSettings(row);
}

async function evaluateDeliveryForRecipient(
  supabase,
  { userEmail = null, userId = null, notificationKey }
) {
  const settings = await loadNotificationSettingsForRecipient(supabase, {
    userEmail,
    userId,
  });

  const delivery = evaluateNotificationDelivery(settings, notificationKey);

  console.log(
    "NOTIFICATION_DELIVERY_EVALUATED",
    JSON.stringify({
      userEmail: userEmail || null,
      userId: userId || null,
      notificationKey: normalizeNotificationKey(notificationKey),
      ...delivery,
    })
  );

  return delivery;
}

module.exports = {
  evaluateNotificationDelivery,
  evaluateDeliveryForRecipient,
  loadNotificationSettingsForRecipient,
};
