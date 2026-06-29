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

async function resolveUserIdForEmail(supabase, email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!normalizedEmail) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .ilike("email", normalizedEmail)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.id || null;
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

    if ((data || []).length > 0) {
      return { rows: data, foundBy: "user_id" };
    }
  }

  if (normalizedEmail) {
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select(SUBSCRIPTION_COLUMNS)
      .eq("email", normalizedEmail);

    if (error) throw error;

    if ((data || []).length > 0) {
      return { rows: data, foundBy: "email" };
    }

    const { data: ilikeRows, error: ilikeError } = await supabase
      .from("push_subscriptions")
      .select(SUBSCRIPTION_COLUMNS)
      .ilike("email", normalizedEmail);

    if (ilikeError) throw ilikeError;

    if ((ilikeRows || []).length > 0) {
      return { rows: ilikeRows, foundBy: "email" };
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
  url = "https://www.hasanchartworld.com/alerts",
}) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  let resolvedUserId = String(userId || "").trim() || null;

  logWorkerEvent("PRICE_ALERT_PUSH_START", {
    worker: workerEntry,
    alertId,
    email: normalizedEmail || null,
    userId: resolvedUserId,
    webPushConfigured: isWebPushConfigured(),
    vapidStatus: getVapidEnvStatus(),
    title,
    bodyPreview: String(body || "").slice(0, 180),
  });

  if (!normalizedEmail && !resolvedUserId) {
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
      userId: resolvedUserId,
      ...getVapidEnvStatus(),
    });

    return { sent: 0, failed: 0, skipped: 1, skipReason: "WEB_PUSH_NOT_CONFIGURED" };
  }

  if (!resolvedUserId && normalizedEmail) {
    try {
      resolvedUserId = await resolveUserIdForEmail(supabase, normalizedEmail);
    } catch (error) {
      logPushEvent("push:send:error", {
        alertId,
        email: normalizedEmail,
        phase: "resolve_user_id",
        message: error?.message || "PROFILE_LOOKUP_FAILED",
      });

      return { sent: 0, failed: 1, skipped: 0, skipReason: "PROFILE_LOOKUP_FAILED" };
    }
  }

  let subscriptionLookup = { rows: [], foundBy: null };

  try {
    subscriptionLookup = await findPushSubscriptionsForRecipient(supabase, {
      email: normalizedEmail,
      userId: resolvedUserId,
    });
  } catch (error) {
    logPushEvent("push:send:error", {
      alertId,
      email: normalizedEmail || null,
      userId: resolvedUserId,
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
      userId: resolvedUserId || null,
      reason: "NO_PUSH_SUBSCRIPTIONS",
      hint: "User must click enable browser notifications while logged in so email/user_id are saved in push_subscriptions",
    });

    return { sent: 0, failed: 0, skipped: 1, skipReason: "NO_PUSH_SUBSCRIPTIONS" };
  }

  if (subscriptionLookup.foundBy === "user_id") {
    logPushEvent("push:subscription:found_by_user_id", {
      alertId,
      email: normalizedEmail || null,
      userId: resolvedUserId || null,
      count: subscriptionList.length,
      subscriptionIds: subscriptionList.map((row) => row.id),
      endpoints: subscriptionList.map((row) => String(row.endpoint || "").slice(0, 72)),
    });
  } else {
    logPushEvent("push:subscription:found_by_email", {
      alertId,
      email: normalizedEmail || null,
      userId: resolvedUserId || null,
      count: subscriptionList.length,
      subscriptionIds: subscriptionList.map((row) => row.id),
      endpoints: subscriptionList.map((row) => String(row.endpoint || "").slice(0, 72)),
    });
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

  for (const subscriptionRow of subscriptionList) {
    const outcome = await sendWebPushNotification(subscriptionRow, payload);

    if (outcome.success) {
      sent += 1;
      logWorkerEvent("PRICE_ALERT_PUSH_SENT", {
        worker: workerEntry,
        success: true,
        alertId,
        email: normalizedEmail || subscriptionRow.email || null,
        userId: resolvedUserId || subscriptionRow.user_id || null,
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
      userId: resolvedUserId || subscriptionRow.user_id || null,
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
  };
}

module.exports = {
  isWebPushConfigured,
  getVapidEnvStatus,
  sendPriceAlertPushNotifications,
};
