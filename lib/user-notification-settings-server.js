import {
  normalizeNotificationSettings,
  pickNotificationSettingsPayload,
} from "./notification-settings-shared.js";

const MIGRATION_HINT =
  "شغّل supabase/sql/user_notification_settings_setup.sql في Supabase SQL Editor ثم أعد تحميل schema cache.";

export function isNotificationSettingsTableMissingError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  const code = String(error?.code || "").toUpperCase();

  return (
    code === "PGRST205" ||
    (message.includes("user_notification_settings") &&
      (message.includes("schema cache") ||
        message.includes("does not exist") ||
        message.includes("could not find")))
  );
}

export function isNotificationSettingsSchemaMismatchError(error) {
  const code = String(error?.code || "").toUpperCase();
  const message = String(error?.message || error || "").toLowerCase();

  return (
    code === "PGRST204" ||
    (message.includes("user_notification_settings") &&
      (message.includes("column") || message.includes("schema cache")))
  );
}

function wrapSettingsDbError(error, phase) {
  if (isNotificationSettingsTableMissingError(error)) {
    return new Error(
      `جدول user_notification_settings غير موجود (${phase}). ${MIGRATION_HINT}`
    );
  }

  if (isNotificationSettingsSchemaMismatchError(error)) {
    return new Error(
      `مخطط user_notification_settings غير مكتمل (${phase}): ${error?.message || error}. ${MIGRATION_HINT}`
    );
  }

  return error instanceof Error ? error : new Error(String(error?.message || error));
}

export function logNotificationSettingsEvent(event, details = {}) {
  console.log(event, details);
}

export async function fetchUserNotificationSettingsRow(supabase, userId) {
  const { data, error } = await supabase
    .from("user_notification_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw wrapSettingsDbError(error, "fetch");
  }

  return data;
}

export async function createDefaultUserNotificationSettingsRow(supabase, userId) {
  const payload = {
    user_id: userId,
    ...pickNotificationSettingsPayload({}),
  };

  logNotificationSettingsEvent("NOTIFICATION_SETTINGS_CREATE_DEFAULT", {
    userId,
    payloadKeys: Object.keys(payload),
  });

  const { data, error } = await supabase
    .from("user_notification_settings")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    throw wrapSettingsDbError(error, "insert-default");
  }

  return data;
}

export async function getOrCreateUserNotificationSettingsRow(supabase, userId) {
  const existing = await fetchUserNotificationSettingsRow(supabase, userId);

  if (existing) {
    return existing;
  }

  return createDefaultUserNotificationSettingsRow(supabase, userId);
}

export async function upsertUserNotificationSettingsRow(supabase, userId, settingsInput) {
  const normalized = normalizeNotificationSettings(settingsInput);
  const payload = {
    user_id: userId,
    ...pickNotificationSettingsPayload(normalized),
  };

  logNotificationSettingsEvent("NOTIFICATION_SETTINGS_SAVE_PAYLOAD", {
    userId,
    payloadKeys: Object.keys(payload),
    notifications_enabled: payload.notifications_enabled,
    email_copy_enabled: payload.email_copy_enabled,
    dnd_enabled: payload.dnd_enabled,
    channel_preferences: payload.channel_preferences,
    sound_enabled: payload.sound_enabled,
  });

  const { data, error } = await supabase
    .from("user_notification_settings")
    .upsert(payload, { onConflict: "user_id" })
    .select("*")
    .single();

  if (error) {
    logNotificationSettingsEvent("NOTIFICATION_SETTINGS_SAVE_ERROR", {
      userId,
      code: error.code || null,
      message: error.message || String(error),
    });
    throw wrapSettingsDbError(error, "upsert");
  }

  logNotificationSettingsEvent("NOTIFICATION_SETTINGS_SAVE_SUCCESS", {
    userId,
    rowId: data?.id || null,
    notifications_enabled: data?.notifications_enabled,
    email_copy_enabled: data?.email_copy_enabled,
    channel_preferences: data?.channel_preferences,
  });

  return data;
}

export function serializeUserNotificationSettings(row) {
  return normalizeNotificationSettings(row || {});
}
