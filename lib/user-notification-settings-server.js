import {
  normalizeNotificationSettings,
  pickNotificationSettingsPayload,
} from "./notification-settings-shared.js";
import { pickNotificationSoundSettingsPayload } from "./notification-sound-settings-shared.js";

export async function fetchUserNotificationSettingsRow(supabase, userId) {
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

export async function createDefaultUserNotificationSettingsRow(supabase, userId) {
  const payload = {
    user_id: userId,
    ...pickNotificationSettingsPayload({}),
  };

  let { data, error } = await supabase
    .from("user_notification_settings")
    .insert(payload)
    .select("*")
    .single();

  if (
    error &&
    error.code === "PGRST204" &&
    /email_copy_enabled|dnd_|channel_preferences|notifications_enabled/i.test(String(error.message || ""))
  ) {
    ({ data, error } = await supabase
      .from("user_notification_settings")
      .insert({
        user_id: userId,
        ...pickNotificationSoundSettingsPayload({}),
      })
      .select("*")
      .single());
  }

  if (error) {
    throw new Error(error.message);
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

export function serializeUserNotificationSettings(row) {
  return normalizeNotificationSettings(row || {});
}
