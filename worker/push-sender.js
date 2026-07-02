const webpush = require("web-push");
const { logWorkerEvent } = require("./alert-logger");
const { getVapidEnv, getVapidEnvStatus } = require("./push-vapid-env");

let configured = false;

const SUBSCRIPTION_COLUMNS =
  "id, endpoint, p256dh, auth, email, anonymous_id, user_id, created_at, updated_at";

function isWebPushConfigured() {
  return getVapidEnvStatus().configured;
}

function logPushEvent(event, payload = {}) {
  console.log(event, {
    ts: new Date().toISOString(),
    ...payload,
  });
}

function configureWebPush() {
  if (configured) {
    return true;
  }

  if (!isWebPushConfigured()) {
    const status = getVapidEnvStatus();
    logPushEvent("push:vapid:missing", status);
    return false;
  }

  const { publicKey, privateKey, subject } = getVapidEnv();

  webpush.setVapidDetails(subject, publicKey, privateKey);
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

function formatPushError(error) {
  return {
    message: error?.message || null,
    statusCode: error?.statusCode || null,
    body: error?.body || null,
  };
}

async function sendWebPushNotification(subscriptionRow, payload) {
  if (!configureWebPush()) {
    return {
      success: false,
      skipped: true,
      message: "WEB_PUSH_NOT_CONFIGURED",
      statusCode: null,
      body: null,
      error: "WEB_PUSH_NOT_CONFIGURED",
    };
  }

  logPushEvent("push:send:start", {
    subscriptionId: subscriptionRow.id,
    endpointPrefix: String(subscriptionRow.endpoint || "").slice(0, 72),
    title: payload?.title || null,
    tag: payload?.tag || null,
  });

  try {
    const response = await webpush.sendNotification(
      toWebPushSubscription(subscriptionRow),
      JSON.stringify(payload)
    );

    logPushEvent("push:send:success", {
      subscriptionId: subscriptionRow.id,
      endpointPrefix: String(subscriptionRow.endpoint || "").slice(0, 72),
      statusCode: response?.statusCode || 201,
    });

    return {
      success: true,
      statusCode: response?.statusCode || 201,
      message: null,
      body: null,
    };
  } catch (error) {
    const formatted = formatPushError(error);

    logPushEvent("push:send:error", {
      subscriptionId: subscriptionRow.id,
      endpointPrefix: String(subscriptionRow.endpoint || "").slice(0, 72),
      statusCode: formatted.statusCode || null,
      message: formatted.message || formatted.body || "WEB_PUSH_SEND_FAILED",
    });

    return {
      success: false,
      ...formatted,
      error: formatted.body || formatted.message || "WEB_PUSH_SEND_FAILED",
    };
  }
}

function isUsablePushSubscription(row) {
  const userId = String(row?.user_id || "").trim();
  const email = String(row?.email || "").trim();
  return Boolean(userId || email);
}

function filterUsablePushSubscriptions(rows) {
  return (rows || []).filter(isUsablePushSubscription);
}

async function findPushSubscriptionsForRecipient(
  supabase,
  { email, userId } = {}
) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedUserId = String(userId || "").trim();

  if (normalizedUserId) {
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select(SUBSCRIPTION_COLUMNS)
      .eq("user_id", normalizedUserId);

    if (error) throw error;

    const usableRows = filterUsablePushSubscriptions(data);

    if (usableRows.length > 0) {
      return { rows: usableRows, foundBy: "user_id" };
    }
  }

  if (normalizedEmail) {
    const { data: exactRows, error: exactError } = await supabase
      .from("push_subscriptions")
      .select(SUBSCRIPTION_COLUMNS)
      .eq("email", normalizedEmail);

    if (exactError) throw exactError;

    const usableExactRows = filterUsablePushSubscriptions(exactRows);

    if (usableExactRows.length > 0) {
      return { rows: usableExactRows, foundBy: "email" };
    }

    const { data: ilikeRows, error: ilikeError } = await supabase
      .from("push_subscriptions")
      .select(SUBSCRIPTION_COLUMNS)
      .ilike("email", normalizedEmail);

    if (ilikeError) throw ilikeError;

    const usableIlikeRows = filterUsablePushSubscriptions(ilikeRows);

    if (usableIlikeRows.length > 0) {
      return { rows: usableIlikeRows, foundBy: "email" };
    }
  }

  return { rows: [], foundBy: null };
}

function logPriceAlertPushFailed(workerEntry, payload) {
  logWorkerEvent("PRICE_ALERT_PUSH_FAILED", {
    worker: workerEntry,
    success: false,
    ...payload,
  });
}

async function sendPriceAlertPushNotifications({
  supabase,
  workerEntry,
  alertId,
  email,
  userId,
  title,
  body,
  url = "/notifications",
}) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const alertUserId = String(userId || "").trim() || null;

  if (!normalizedEmail && !alertUserId) {
    logPushEvent("push:subscription:not_found", {
      alertId,
      email: null,
      userId: null,
      reason: "MISSING_ALERT_RECIPIENT",
    });

    return { sent: 0, failed: 0, skipped: 1, skipReason: "MISSING_ALERT_RECIPIENT" };
  }

  if (!configureWebPush()) {
    logPushEvent("push:vapid:missing", {
      alertId,
      email: normalizedEmail || null,
      userId: alertUserId,
      ...getVapidEnvStatus(),
    });

    return { sent: 0, failed: 0, skipped: 1, skipReason: "WEB_PUSH_NOT_CONFIGURED" };
  }

  let subscriptionLookup = { rows: [], foundBy: null };

  logPushEvent("alert:push:lookup:start", {
    alertId,
    email: normalizedEmail || null,
    userId: alertUserId,
    lookupOrder: ["user_id", "email"],
  });

  try {
    subscriptionLookup = await findPushSubscriptionsForRecipient(supabase, {
      email: normalizedEmail,
      userId: alertUserId,
    });
  } catch (error) {
    logPushEvent("push:send:error", {
      alertId,
      email: normalizedEmail || null,
      userId: alertUserId,
      phase: "subscription_lookup",
      message: error?.message || "SUBSCRIPTION_LOOKUP_FAILED",
    });

    return { sent: 0, failed: 1, skipped: 0, skipReason: "SUBSCRIPTION_LOOKUP_FAILED" };
  }

  const subscriptionList = subscriptionLookup.rows || [];

  if (subscriptionList.length === 0) {
    logPushEvent("push:subscription:not_found", {
      alertId,
      email: normalizedEmail || null,
      userId: alertUserId,
      reason: "NO_PUSH_SUBSCRIPTIONS",
      hint: "User must click enable browser notifications while logged in so email/user_id are saved in push_subscriptions",
    });

    return {
      sent: 0,
      failed: 0,
      skipped: 1,
      skipReason: "NO_PUSH_SUBSCRIPTIONS",
      foundBy: null,
      subscriptionCount: 0,
    };
  }

  logPushEvent("alert:push:subscriptions:found", {
    alertId,
    email: normalizedEmail || null,
    userId: alertUserId,
    foundBy: subscriptionLookup.foundBy || null,
    count: subscriptionList.length,
    subscriptionIds: subscriptionList.map((row) => row.id),
    endpoints: subscriptionList.map((row) => String(row.endpoint || "").slice(0, 72)),
  });

  logPushEvent("push:subscription:found", {
    alertId,
    email: normalizedEmail || null,
    userId: alertUserId,
    foundBy: subscriptionLookup.foundBy || null,
    count: subscriptionList.length,
    subscriptionIds: subscriptionList.map((row) => row.id),
    endpoints: subscriptionList.map((row) => String(row.endpoint || "").slice(0, 72)),
  });

  if (subscriptionLookup.foundBy === "user_id") {
    logPushEvent("push:subscription:found_by_user_id", {
      alertId,
      email: normalizedEmail || null,
      userId: alertUserId,
      count: subscriptionList.length,
      subscriptionIds: subscriptionList.map((row) => row.id),
      endpoints: subscriptionList.map((row) => String(row.endpoint || "").slice(0, 72)),
    });
  } else {
    logPushEvent("push:subscription:found_by_email", {
      alertId,
      email: normalizedEmail || null,
      userId: alertUserId,
      count: subscriptionList.length,
      subscriptionIds: subscriptionList.map((row) => row.id),
      endpoints: subscriptionList.map((row) => String(row.endpoint || "").slice(0, 72)),
    });
  }

  const payload = {
    title,
    body,
    icon: "/logo.png",
    badge: "/logo.png",
    url: url || "/notifications",
    tag: `price-alert-${alertId}`,
    alertId: String(alertId),
    type: "price-alert",
    sound: true,
  };

  logPushEvent("WEB_PUSH_PAYLOAD_READY", {
    alertId,
    email: normalizedEmail || null,
    userId: alertUserId,
    title: payload.title,
    body: payload.body,
    icon: payload.icon,
    badge: payload.badge,
    url: payload.url,
    tag: payload.tag,
    type: payload.type,
    sound: payload.sound,
    subscriptionCount: subscriptionList.length,
  });

  let sent = 0;
  let failed = 0;

  for (const subscriptionRow of subscriptionList) {
    const outcome = await sendWebPushNotification(subscriptionRow, payload);

    if (outcome.success) {
      sent += 1;
      logWorkerEvent("PRICE_ALERT_PUSH_SENT", {
        worker: workerEntry,
        success: true,
        alertId,
        email: normalizedEmail || subscriptionRow.email || null,
        userId: alertUserId || subscriptionRow.user_id || null,
        subscriptionId: subscriptionRow.id,
        endpoint: subscriptionRow.endpoint,
        statusCode: outcome.statusCode || 201,
      });
      continue;
    }

    if (outcome.skipped) {
      continue;
    }

    failed += 1;

    logPriceAlertPushFailed(workerEntry, {
      alertId,
      email: normalizedEmail || subscriptionRow.email || null,
      userId: alertUserId || subscriptionRow.user_id || null,
      subscriptionId: subscriptionRow.id,
      endpoint: subscriptionRow.endpoint,
      message: outcome.message || outcome.error || "WEB_PUSH_SEND_FAILED",
      statusCode: outcome.statusCode || null,
      body: outcome.body || null,
      error: outcome.error || outcome.message || "WEB_PUSH_SEND_FAILED",
    });

    if (outcome.statusCode === 404 || outcome.statusCode === 410) {
      await supabase.from("push_subscriptions").delete().eq("id", subscriptionRow.id);
    }
  }

  return {
    sent,
    failed,
    skipped: 0,
    skipReason: failed > 0 ? "WEB_PUSH_SEND_FAILED" : null,
    foundBy: subscriptionLookup.foundBy || null,
    subscriptionCount: subscriptionList.length,
  };
}

module.exports = {
  isWebPushConfigured,
  getVapidEnvStatus,
  sendPriceAlertPushNotifications,
};
