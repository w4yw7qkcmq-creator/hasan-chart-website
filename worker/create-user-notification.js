function normalizeEmail(userEmail) {
  return String(userEmail || "").trim().toLowerCase();
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

async function createUserNotification(
  supabase,
  { userEmail, title, message, type, notificationKey = null, url = null, metadata = null }
) {
  const normalizedEmail = normalizeEmail(userEmail);

  if (!normalizedEmail || !title || !type) {
    return { data: null, error: new Error("Missing notification fields") };
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
    .select("*")
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
      .select("*")
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
