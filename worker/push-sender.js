const webpush = require("web-push");
const { logWorkerEvent } = require("./alert-logger");

let configured = false;

function isWebPushConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() &&
      process.env.VAPID_PRIVATE_KEY?.trim() &&
      process.env.VAPID_SUBJECT?.trim()
  );
}

function configureWebPush() {
  if (configured || !isWebPushConfigured()) {
    return configured;
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT.trim(),
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY.trim(),
    process.env.VAPID_PRIVATE_KEY.trim()
  );

  configured = true;
  return true;
}

function toWebPushSubscription(row) {
  return {
    endpoint: row.endpoint,
    keys: {
      p256dh: row.p256dh,
      auth: row.auth,
    },
  };
}

async function sendWebPushNotification(subscriptionRow, payload) {
  if (!configureWebPush()) {
    return {
      success: false,
      skipped: true,
      error: "WEB_PUSH_NOT_CONFIGURED",
    };
  }

  try {
    const response = await webpush.sendNotification(
      toWebPushSubscription(subscriptionRow),
      JSON.stringify(payload)
    );

    return {
      success: true,
      statusCode: response?.statusCode || 201,
    };
  } catch (error) {
    return {
      success: false,
      statusCode: error?.statusCode || null,
      error: error?.body || error?.message || "WEB_PUSH_SEND_FAILED",
    };
  }
}

async function sendPriceAlertPushNotifications({
  supabase,
  workerEntry,
  alertId,
  email,
  title,
  body,
  url = "https://www.hasanchartworld.com/alerts",
}) {
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!normalizedEmail) {
    return { sent: 0, failed: 0, skipped: 0 };
  }

  if (!configureWebPush()) {
    logWorkerEvent("ALERT_PUSH_FAILED", {
      worker: workerEntry,
      alertId,
      email: normalizedEmail,
      success: false,
      error: "WEB_PUSH_NOT_CONFIGURED",
    });

    return { sent: 0, failed: 0, skipped: 1 };
  }

  const { data: subscriptions, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, email, anonymous_id")
    .eq("email", normalizedEmail);

  if (error) {
    logWorkerEvent("ALERT_PUSH_FAILED", {
      worker: workerEntry,
      alertId,
      email: normalizedEmail,
      success: false,
      error: error.message,
    });

    return { sent: 0, failed: 1, skipped: 0 };
  }

  if (!subscriptions?.length) {
    logWorkerEvent("ALERT_PUSH_FAILED", {
      worker: workerEntry,
      alertId,
      email: normalizedEmail,
      success: false,
      error: "NO_PUSH_SUBSCRIPTIONS",
    });

    return { sent: 0, failed: 0, skipped: 1 };
  }

  const payload = {
    title,
    body,
    url,
    icon: "/logo.png",
    type: "price-alert",
    tag: `price-alert-${alertId}`,
  };

  let sent = 0;
  let failed = 0;

  for (const subscriptionRow of subscriptions) {
    const outcome = await sendWebPushNotification(subscriptionRow, payload);

    if (outcome.success) {
      sent += 1;
      logWorkerEvent("ALERT_PUSH_SENT", {
        worker: workerEntry,
        alertId,
        email: normalizedEmail,
        subscriptionId: subscriptionRow.id,
        endpoint: subscriptionRow.endpoint,
        success: true,
      });
      continue;
    }

    failed += 1;
    logWorkerEvent("ALERT_PUSH_FAILED", {
      worker: workerEntry,
      alertId,
      email: normalizedEmail,
      subscriptionId: subscriptionRow.id,
      endpoint: subscriptionRow.endpoint,
      success: false,
      statusCode: outcome.statusCode || null,
      error: outcome.error,
    });

    if (outcome.statusCode === 404 || outcome.statusCode === 410) {
      await supabase.from("push_subscriptions").delete().eq("id", subscriptionRow.id);
    }
  }

  return { sent, failed, skipped: 0 };
}

module.exports = {
  isWebPushConfigured,
  sendPriceAlertPushNotifications,
};
