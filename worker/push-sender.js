const webpush = require("web-push");
const { logWorkerEvent } = require("./alert-logger");

let configured = false;

const SUBSCRIPTION_COLUMNS =
  "id, endpoint, p256dh, auth, email, anonymous_id, user_id";

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

async function findPushSubscriptionsForRecipient(
  supabase,
  { email, userId, anonymousId } = {}
) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedUserId = String(userId || "").trim();
  const normalizedAnonymousId = String(anonymousId || "").trim();
  const seenIds = new Set();
  const rows = [];

  const collectRows = (data) => {
    for (const row of data || []) {
      if (!row?.id || seenIds.has(row.id)) continue;
      seenIds.add(row.id);
      rows.push(row);
    }
  };

  if (normalizedEmail) {
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select(SUBSCRIPTION_COLUMNS)
      .eq("email", normalizedEmail);

    if (error) throw error;
    collectRows(data);
  }

  if (normalizedUserId) {
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select(SUBSCRIPTION_COLUMNS)
      .eq("user_id", normalizedUserId);

    if (error) throw error;
    collectRows(data);
  }

  if (normalizedAnonymousId) {
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select(SUBSCRIPTION_COLUMNS)
      .eq("anonymous_id", normalizedAnonymousId);

    if (error) throw error;
    collectRows(data);
  }

  return rows;
}

async function sendTargetedPushNotifications({
  supabase,
  workerEntry,
  email,
  userId,
  anonymousId,
  title,
  body,
  url,
  type,
  tag,
  successLogTag,
  meta = {},
}) {
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!configureWebPush()) {
    logWorkerEvent(successLogTag, {
      worker: workerEntry,
      success: false,
      error: "WEB_PUSH_NOT_CONFIGURED",
      email: normalizedEmail || null,
      userId: userId || null,
      anonymousId: anonymousId || null,
      ...meta,
    });

    return { sent: 0, failed: 0, skipped: 1 };
  }

  let subscriptionList = [];

  try {
    subscriptionList = await findPushSubscriptionsForRecipient(supabase, {
      email: normalizedEmail,
      userId,
      anonymousId,
    });
  } catch (error) {
    logWorkerEvent(successLogTag, {
      worker: workerEntry,
      success: false,
      error: error?.message || "SUBSCRIPTION_LOOKUP_FAILED",
      email: normalizedEmail || null,
      userId: userId || null,
      anonymousId: anonymousId || null,
      ...meta,
    });

    return { sent: 0, failed: 1, skipped: 0 };
  }

  if (subscriptionList.length === 0) {
    logWorkerEvent(successLogTag, {
      worker: workerEntry,
      success: false,
      error: "NO_PUSH_SUBSCRIPTIONS",
      email: normalizedEmail || null,
      userId: userId || null,
      anonymousId: anonymousId || null,
      ...meta,
    });

    return { sent: 0, failed: 0, skipped: 1 };
  }

  const payload = {
    title,
    body,
    url,
    icon: "/logo.png",
    type,
    tag,
  };

  let sent = 0;
  let failed = 0;

  for (const subscriptionRow of subscriptionList) {
    const outcome = await sendWebPushNotification(subscriptionRow, payload);

    if (outcome.success) {
      sent += 1;
      logWorkerEvent(successLogTag, {
        worker: workerEntry,
        success: true,
        email: normalizedEmail || subscriptionRow.email || null,
        userId: userId || subscriptionRow.user_id || null,
        anonymousId: anonymousId || subscriptionRow.anonymous_id || null,
        subscriptionId: subscriptionRow.id,
        endpoint: subscriptionRow.endpoint,
        ...meta,
      });
      continue;
    }

    failed += 1;

    if (outcome.statusCode === 404 || outcome.statusCode === 410) {
      await supabase.from("push_subscriptions").delete().eq("id", subscriptionRow.id);
    }
  }

  return { sent, failed, skipped: 0 };
}

async function sendPriceAlertPushNotifications({
  supabase,
  workerEntry,
  alertId,
  email,
  userId,
  title,
  body,
  url = "https://www.hasanchartworld.com/alerts",
}) {
  return sendTargetedPushNotifications({
    supabase,
    workerEntry,
    email,
    userId,
    title,
    body,
    url,
    type: "price-alert",
    tag: `price-alert-${alertId}`,
    successLogTag: "PRICE_ALERT_PUSH_SENT",
    meta: { alertId },
  });
}

module.exports = {
  isWebPushConfigured,
  sendPriceAlertPushNotifications,
};
