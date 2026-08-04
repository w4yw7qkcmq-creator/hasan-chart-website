const { evaluateDeliveryForRecipient } = require("./notification-delivery-gate");

function normalizeEmail(userEmail) {
  return String(userEmail || "").trim().toLowerCase();
}

function normalizeNotificationKey(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "system";
  return raw.replace(/-/g, "_");
}

function isMissingExtendedNotificationColumnError(error) {
  const message = String(error?.message || "");
  return (
    error?.code === "PGRST204" &&
    /notification_key|metadata|\burl\b/i.test(message)
  );
}

function buildBaseNotificationPayload({ userEmail, title, message, type }) {
  return {
    user_email: normalizeEmail(userEmail),
    title: String(title).trim(),
    message: String(message || "").trim(),
    type,
    is_read: false,
  };
}

const NOTIFICATION_INSERT_RETURN_COLUMNS =
  "id,user_email,title,message,type,notification_key,url,metadata,is_read,created_at";

async function createUserNotification(
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
  const normalizedEmail = normalizeEmail(userEmail);

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
      console.log(
        "NOTIFICATION_CREATE_SKIPPED",
        JSON.stringify({
          userEmail: normalizedEmail,
          notificationKey: resolvedKey,
          reason: delivery.blockedReason || "in-app-blocked",
        })
      );

      return {
        data: null,
        error: null,
        skipped: true,
        reason: delivery.blockedReason || "in-app-blocked",
        delivery,
      };
    }
  }

  const payload = buildBaseNotificationPayload({
    userEmail: normalizedEmail,
    title,
    message,
    type,
  });

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
    .select(NOTIFICATION_INSERT_RETURN_COLUMNS)
    .single();

  if (error && isMissingExtendedNotificationColumnError(error)) {
    console.warn(
      "notifications:insert:fallback-minimal",
      JSON.stringify({
        userEmail: normalizedEmail,
        type,
        reason: "extended-columns-unavailable",
        code: error.code || null,
        message: error.message || String(error),
      })
    );

    ({ data, error } = await supabase
      .from("notifications")
      .insert(buildBaseNotificationPayload({ userEmail: normalizedEmail, title, message, type }))
      .select("id,user_email,title,message,type,is_read,created_at")
      .single());
  }

  if (error) {
    console.error(
      "notifications:insert:error",
      JSON.stringify({
        userEmail: normalizedEmail,
        type,
        code: error.code || null,
        message: error.message || String(error),
      })
    );
  }

  return { data, error };
}

module.exports = {
  createUserNotification,
};
