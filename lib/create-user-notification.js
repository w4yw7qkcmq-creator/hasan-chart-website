import { evaluateDeliveryForRecipient } from "./notification-delivery-gate-server.js";
import { logNotificationDeliveryDecision } from "./notification-delivery-gate.js";
import { normalizeNotificationKey } from "./notification-sound-keys.js";

export async function createUserNotification(
  supabase,
  {
    userEmail,
    title,
    message,
    type,
    notificationKey = null,
    url = null,
    metadata = null,
    skipDeliveryGate = false,
  }
) {
  const normalizedEmail = String(userEmail || "")
    .trim()
    .toLowerCase();

  if (!normalizedEmail || !title || !type) {
    return { data: null, error: new Error("Missing notification fields") };
  }

  const resolvedKey = normalizeNotificationKey(
    notificationKey || metadata?.notification_key || "system"
  );

  if (!skipDeliveryGate) {
    const delivery = await evaluateDeliveryForRecipient(supabase, {
      userEmail: normalizedEmail,
      notificationKey: resolvedKey,
    });

    if (!delivery.inApp) {
      logNotificationDeliveryDecision("NOTIFICATION_CREATE_SKIPPED", {
        userEmail: normalizedEmail,
        notificationKey: resolvedKey,
        reason: delivery.blockedReason || "in-app-blocked",
      });

      return {
        data: null,
        error: null,
        skipped: true,
        reason: delivery.blockedReason || "in-app-blocked",
        delivery,
      };
    }
  }

  const payload = {
    user_email: normalizedEmail,
    title: String(title).trim(),
    message: String(message || "").trim(),
    type,
    is_read: false,
  };

  if (notificationKey) {
    payload.notification_key = String(notificationKey).trim();
  }

  if (url) {
    payload.url = String(url).trim();
  }

  if (metadata && typeof metadata === "object") {
    payload.metadata = metadata;
  }

  let { data, error } = await supabase
    .from("notifications")
    .insert(payload)
    .select("*")
    .single();

  if (
    error &&
    error.code === "PGRST204" &&
    /notification_key|metadata|\burl\b/i.test(String(error.message || ""))
  ) {
    const minimalPayload = {
      user_email: normalizedEmail,
      title: String(title).trim(),
      message: String(message || "").trim(),
      type,
      is_read: false,
    };

    ({ data, error } = await supabase
      .from("notifications")
      .insert(minimalPayload)
      .select("*")
      .single());
  }

  return { data, error };
}

export async function createUserNotifications(
  supabase,
  notifications = [],
  { skipDeliveryGate = false } = {}
) {
  const rows = [];

  for (const item of notifications) {
    const normalizedEmail = String(item.userEmail || "")
      .trim()
      .toLowerCase();

    if (!normalizedEmail || !item.title || !item.type) continue;

    const resolvedKey = normalizeNotificationKey(
      item.notificationKey || item.metadata?.notification_key || "system"
    );

    if (!skipDeliveryGate) {
      const delivery = await evaluateDeliveryForRecipient(supabase, {
        userEmail: normalizedEmail,
        notificationKey: resolvedKey,
      });

      if (!delivery.inApp) {
        logNotificationDeliveryDecision("NOTIFICATION_CREATE_SKIPPED", {
          userEmail: normalizedEmail,
          notificationKey: resolvedKey,
          reason: delivery.blockedReason || "in-app-blocked",
          bulk: true,
        });
        continue;
      }
    }

    const row = {
      user_email: normalizedEmail,
      title: String(item.title).trim(),
      message: String(item.message || "").trim(),
      type: item.type,
      is_read: false,
    };

    if (item.notificationKey) {
      row.notification_key = String(item.notificationKey).trim();
    }

    if (item.url) {
      row.url = String(item.url).trim();
    }

    if (item.metadata && typeof item.metadata === "object") {
      row.metadata = item.metadata;
    }

    rows.push(row);
  }

  if (!rows.length) {
    return { data: [], error: null, skipped: true };
  }

  let { data, error } = await supabase.from("notifications").insert(rows).select("*");

  if (
    error &&
    error.code === "PGRST204" &&
    /notification_key|metadata|\burl\b/i.test(String(error.message || ""))
  ) {
    const minimalRows = rows.map(({ user_email, title, message, type, is_read }) => ({
      user_email,
      title,
      message,
      type,
      is_read,
    }));

    ({ data, error } = await supabase.from("notifications").insert(minimalRows).select("*"));
  }

  return { data, error };
}
