import {
  evaluateNotificationDelivery,
  logNotificationDeliveryDecision,
} from "./notification-delivery-gate.js";
import { normalizeNotificationKey } from "./notification-sound-keys.js";
import { normalizeNotificationSettings } from "./notification-settings-shared.js";
import {
  getOrCreateUserNotificationSettingsRow,
  serializeUserNotificationSettings,
} from "./user-notification-settings-server.js";

export async function resolveUserIdByEmail(supabase, userEmail) {
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

export async function loadNotificationSettingsForRecipient(
  supabase,
  { userEmail = null, userId = null } = {}
) {
  let resolvedUserId = userId || null;

  if (!resolvedUserId && userEmail) {
    resolvedUserId = await resolveUserIdByEmail(supabase, userEmail);
  }

  if (!resolvedUserId) {
    return normalizeNotificationSettings({});
  }

  const row = await getOrCreateUserNotificationSettingsRow(supabase, resolvedUserId);
  return serializeUserNotificationSettings(row);
}

export async function evaluateDeliveryForRecipient(
  supabase,
  { userEmail = null, userId = null, notificationKey }
) {
  const settings = await loadNotificationSettingsForRecipient(supabase, {
    userEmail,
    userId,
  });

  const delivery = evaluateNotificationDelivery(settings, notificationKey);

  logNotificationDeliveryDecision("NOTIFICATION_DELIVERY_EVALUATED", {
    userEmail: userEmail || null,
    userId: userId || null,
    notificationKey: normalizeNotificationKey(notificationKey),
    ...delivery,
  });

  return delivery;
}
