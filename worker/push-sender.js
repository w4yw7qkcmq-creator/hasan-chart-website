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

  try {
    const response = await webpush.sendNotification(
      toWebPushSubscription(subscriptionRow),
      JSON.stringify(payload)
    );

    return {
      success: true,
      statusCode: response?.statusCode || 201,
      message: null,
      body: null,
    };
  } catch (error) {
    const formatted = formatPushError(error);

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
      .ilike("email", normalizedEmail);

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

  return rows;
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

  console.log("PRICE_ALERT_PUSH_START", {
    alertId,
    email: normalizedEmail || null,
    userId: resolvedUserId,
    worker: workerEntry,
  });

  logWorkerEvent("PRICE_ALERT_PUSH_START", {
    worker: workerEntry,
    alertId,
    email: normalizedEmail || null,
    userId: resolvedUserId,
    webPushConfigured: isWebPushConfigured(),
    title,
    bodyPreview: String(body || "").slice(0, 180),
  });

  if (!normalizedEmail && !resolvedUserId) {
    logPriceAlertPushFailed(workerEntry, {
      alertId,
      email: null,
      userId: null,
      message: "MISSING_ALERT_RECIPIENT",
      statusCode: null,
      body: null,
      error: "MISSING_ALERT_RECIPIENT",
    });

    return { sent: 0, failed: 0, skipped: 1, skipReason: "MISSING_ALERT_RECIPIENT" };
  }

  if (!configureWebPush()) {
    console.log("alert:push:skipped", {
      alertId,
      email: normalizedEmail || null,
      userId: resolvedUserId,
      reason: "WEB_PUSH_NOT_CONFIGURED",
      missingEnv: {
        hasPublicKey: Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()),
        hasPrivateKey: Boolean(process.env.VAPID_PRIVATE_KEY?.trim()),
        hasSubject: Boolean(process.env.VAPID_SUBJECT?.trim()),
      },
    });

    logPriceAlertPushFailed(workerEntry, {
      alertId,
      email: normalizedEmail || null,
      userId: resolvedUserId,
      message: "WEB_PUSH_NOT_CONFIGURED",
      statusCode: null,
      body: null,
      error: "WEB_PUSH_NOT_CONFIGURED",
      missingEnv: {
        hasPublicKey: Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()),
        hasPrivateKey: Boolean(process.env.VAPID_PRIVATE_KEY?.trim()),
        hasSubject: Boolean(process.env.VAPID_SUBJECT?.trim()),
      },
    });

    return { sent: 0, failed: 0, skipped: 1, skipReason: "WEB_PUSH_NOT_CONFIGURED" };
  }

  if (!resolvedUserId && normalizedEmail) {
    try {
      resolvedUserId = await resolveUserIdForEmail(supabase, normalizedEmail);
    } catch (error) {
      logPriceAlertPushFailed(workerEntry, {
        alertId,
        email: normalizedEmail,
        userId: null,
        phase: "resolve_user_id",
        message: error?.message || "PROFILE_LOOKUP_FAILED",
        statusCode: error?.statusCode || null,
        body: error?.details || error?.hint || null,
        error: error?.message || "PROFILE_LOOKUP_FAILED",
      });

      return { sent: 0, failed: 1, skipped: 0 };
    }
  }

  let subscriptionList = [];

  try {
    subscriptionList = await findPushSubscriptionsForRecipient(supabase, {
      email: normalizedEmail,
      userId: resolvedUserId,
    });
  } catch (error) {
    logPriceAlertPushFailed(workerEntry, {
      alertId,
      email: normalizedEmail || null,
      userId: resolvedUserId,
      phase: "subscription_lookup",
      message: error?.message || "SUBSCRIPTION_LOOKUP_FAILED",
      statusCode: error?.statusCode || null,
      body: error?.details || error?.hint || null,
      error: error?.message || "SUBSCRIPTION_LOOKUP_FAILED",
    });

    return { sent: 0, failed: 1, skipped: 0 };
  }

  logWorkerEvent("PRICE_ALERT_PUSH_START", {
    worker: workerEntry,
    alertId,
    email: normalizedEmail || null,
    userId: resolvedUserId,
    subscriptionCount: subscriptionList.length,
    subscriptionIds: subscriptionList.map((row) => row.id),
    phase: "subscriptions_loaded",
  });

  if (subscriptionList.length === 0) {
    console.log("alert:push:skipped", {
      alertId,
      email: normalizedEmail || null,
      userId: resolvedUserId,
      reason: "NO_PUSH_SUBSCRIPTIONS",
    });

    logPriceAlertPushFailed(workerEntry, {
      alertId,
      email: normalizedEmail || null,
      userId: resolvedUserId,
      message: "NO_PUSH_SUBSCRIPTIONS",
      statusCode: null,
      body: null,
      error: "NO_PUSH_SUBSCRIPTIONS",
    });

    return { sent: 0, failed: 0, skipped: 1, skipReason: "NO_PUSH_SUBSCRIPTIONS" };
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
      console.log("PRICE_ALERT_PUSH_SENT", {
        alertId,
        email: normalizedEmail || subscriptionRow.email || null,
        subscriptionId: subscriptionRow.id,
        worker: workerEntry,
      });
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

    failed += 1;

    console.log("PRICE_ALERT_PUSH_FAILED", {
      alertId,
      email: normalizedEmail || subscriptionRow.email || null,
      message: outcome.message || outcome.error || "WEB_PUSH_SEND_FAILED",
      statusCode: outcome.statusCode || null,
      body: outcome.body || null,
    });

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

  return { sent, failed, skipped: 0, skipReason: failed > 0 ? "WEB_PUSH_SEND_FAILED" : null };
}

module.exports = {
  isWebPushConfigured,
  sendPriceAlertPushNotifications,
};
