import { configureWebPush, sendWebPushNotification } from "./push-server";

const SITE_URL = "https://www.hasanchartworld.com";

const SUBSCRIPTION_COLUMNS =
  "id, endpoint, p256dh, auth, email, anonymous_id, user_id";

export async function findPushSubscriptionsForRecipient(
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

export async function sendTargetedPushNotification({
  supabase,
  email,
  userId,
  anonymousId,
  title,
  body,
  url = SITE_URL,
  type = "general",
  tag,
  successLogTag,
  meta = {},
}) {
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!configureWebPush()) {
    console.log(
      `${successLogTag} ${JSON.stringify({
        success: false,
        error: "WEB_PUSH_NOT_CONFIGURED",
        email: normalizedEmail || null,
        userId: userId || null,
        anonymousId: anonymousId || null,
        ...meta,
      })}`
    );

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
    console.log(
      `${successLogTag} ${JSON.stringify({
        success: false,
        error: error?.message || "SUBSCRIPTION_LOOKUP_FAILED",
        email: normalizedEmail || null,
        userId: userId || null,
        anonymousId: anonymousId || null,
        ...meta,
      })}`
    );

    return { sent: 0, failed: 1, skipped: 0 };
  }

  if (subscriptionList.length === 0) {
    console.log(
      `${successLogTag} ${JSON.stringify({
        success: false,
        error: "NO_PUSH_SUBSCRIPTIONS",
        email: normalizedEmail || null,
        userId: userId || null,
        anonymousId: anonymousId || null,
        ...meta,
      })}`
    );

    return { sent: 0, failed: 0, skipped: 1 };
  }

  const payload = {
    title,
    body,
    url,
    icon: "/logo.png",
    type,
    tag: tag || type,
  };

  let sent = 0;
  let failed = 0;

  for (const subscriptionRow of subscriptionList) {
    const outcome = await sendWebPushNotification(subscriptionRow, payload);

    if (outcome.success) {
      sent += 1;
      console.log(
        `${successLogTag} ${JSON.stringify({
          success: true,
          email: normalizedEmail || subscriptionRow.email || null,
          userId: userId || subscriptionRow.user_id || null,
          anonymousId: anonymousId || subscriptionRow.anonymous_id || null,
          subscriptionId: subscriptionRow.id,
          endpoint: subscriptionRow.endpoint,
          ...meta,
        })}`
      );
      continue;
    }

    failed += 1;

    if (outcome.statusCode === 404 || outcome.statusCode === 410) {
      await supabase.from("push_subscriptions").delete().eq("id", subscriptionRow.id);
    }
  }

  return { sent, failed, skipped: 0 };
}

export async function sendAnalysisReadyPush({
  supabase,
  email,
  userId,
  coin,
  requestId,
}) {
  const coinLabel = String(coin || "").trim().toUpperCase() || "العملة";

  return sendTargetedPushNotification({
    supabase,
    email,
    userId,
    title: "📊 تحليلك جاهز",
    body: `تم إنجاز تحليل ${coinLabel}. افتح صفحة تحليلاتي لقراءة الرد.`,
    url: `${SITE_URL}/my-analysis`,
    type: "analysis-ready",
    tag: `analysis-ready-${requestId}`,
    successLogTag: "ANALYSIS_READY_PUSH_SENT",
    meta: { requestId, coin: coinLabel },
  });
}

export async function sendVipSignalPush({
  supabase,
  email,
  userId,
  signalType,
  coin,
  signalId,
}) {
  const normalizedType = signalType === "futures" ? "futures" : "spot";
  const label = normalizedType === "futures" ? "Futures" : "Spot";
  const coinLabel = String(coin || "").trim().toUpperCase() || "VIP";
  const signalPageUrl =
    normalizedType === "futures" ? `${SITE_URL}/vip-futures` : `${SITE_URL}/vip-spot`;

  return sendTargetedPushNotification({
    supabase,
    email,
    userId,
    title: `🚨 توصية VIP ${label} جديدة`,
    body: `تم نشر توصية جديدة على ${coinLabel}. افتح صفحة توصيات VIP ${label}.`,
    url: signalPageUrl,
    type: normalizedType === "futures" ? "vip-futures" : "vip-spot",
    tag: `vip-signal-${signalId}-${normalizedEmailHash(email)}`,
    successLogTag: "VIP_SIGNAL_PUSH_SENT",
    meta: { signalId, signalType: normalizedType, coin: coinLabel },
  });
}

export async function sendAccountManagementAcceptedPush({
  supabase,
  email,
  userId,
  requestId,
  platform,
}) {
  const platformLabel = String(platform || "").trim() || "حسابك";

  return sendTargetedPushNotification({
    supabase,
    email,
    userId,
    title: "✅ تم قبول طلب إدارة الحساب",
    body: `تم قبول طلب إدارة الحساب على ${platformLabel}. سيتواصل معك الفريق قريباً.`,
    url: `${SITE_URL}/my-dashboard`,
    type: "account-management",
    tag: `account-management-${requestId}`,
    successLogTag: "ACCOUNT_MANAGEMENT_ACCEPTED_PUSH_SENT",
    meta: { requestId, platform: platformLabel },
  });
}

function logPriceAlertPush(tag, payload) {
  const line = `${tag} ${JSON.stringify({
    ...payload,
    ts: new Date().toISOString(),
  })}`;

  if (tag === "PRICE_ALERT_PUSH_FAILED" || payload?.success === false) {
    console.error(line);
    return;
  }

  console.log(line);
}

export async function sendPriceAlertPush({
  supabase,
  email,
  userId,
  alertId,
  title,
  body,
  url = `${SITE_URL}/alerts`,
}) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  let resolvedUserId = String(userId || "").trim() || null;

  logPriceAlertPush("PRICE_ALERT_PUSH_START", {
    path: "nextjs-price-alerts-runner",
    alertId,
    email: normalizedEmail || null,
    userId: resolvedUserId,
    webPushConfigured: configureWebPush(),
    bodyPreview: String(body || "").slice(0, 180),
  });

  console.log("PRICE_ALERT_PUSH_START", {
    alertId,
    email: normalizedEmail || null,
    userId: resolvedUserId,
    path: "lib/push-notifications::sendPriceAlertPush",
  });

  if (!normalizedEmail && !resolvedUserId) {
    logPriceAlertPush("PRICE_ALERT_PUSH_FAILED", {
      path: "nextjs-price-alerts-runner",
      alertId,
      success: false,
      message: "MISSING_ALERT_RECIPIENT",
      statusCode: null,
      body: null,
      error: "MISSING_ALERT_RECIPIENT",
    });

    return { sent: 0, failed: 1, skipped: 0 };
  }

  if (!configureWebPush()) {
    logPriceAlertPush("PRICE_ALERT_PUSH_FAILED", {
      path: "nextjs-price-alerts-runner",
      alertId,
      email: normalizedEmail || null,
      userId: resolvedUserId,
      success: false,
      message: "WEB_PUSH_NOT_CONFIGURED",
      statusCode: null,
      body: null,
      error: "WEB_PUSH_NOT_CONFIGURED",
    });

    return { sent: 0, failed: 0, skipped: 1 };
  }

  if (!resolvedUserId && normalizedEmail) {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id")
        .ilike("email", normalizedEmail)
        .maybeSingle();

      if (error) throw error;
      resolvedUserId = data?.id || null;
    } catch (error) {
      logPriceAlertPush("PRICE_ALERT_PUSH_FAILED", {
        path: "nextjs-price-alerts-runner",
        alertId,
        email: normalizedEmail,
        userId: null,
        phase: "resolve_user_id",
        success: false,
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
    logPriceAlertPush("PRICE_ALERT_PUSH_FAILED", {
      path: "nextjs-price-alerts-runner",
      alertId,
      email: normalizedEmail || null,
      userId: resolvedUserId,
      phase: "subscription_lookup",
      success: false,
      message: error?.message || "SUBSCRIPTION_LOOKUP_FAILED",
      statusCode: error?.statusCode || null,
      body: error?.details || error?.hint || null,
      error: error?.message || "SUBSCRIPTION_LOOKUP_FAILED",
    });

    return { sent: 0, failed: 1, skipped: 0 };
  }

  logPriceAlertPush("PRICE_ALERT_PUSH_START", {
    path: "nextjs-price-alerts-runner",
    alertId,
    email: normalizedEmail || null,
    userId: resolvedUserId,
    phase: "subscriptions_loaded",
    subscriptionCount: subscriptionList.length,
    subscriptionIds: subscriptionList.map((row) => row.id),
  });

  if (subscriptionList.length === 0) {
    logPriceAlertPush("PRICE_ALERT_PUSH_FAILED", {
      path: "nextjs-price-alerts-runner",
      alertId,
      email: normalizedEmail || null,
      userId: resolvedUserId,
      success: false,
      message: "NO_PUSH_SUBSCRIPTIONS",
      statusCode: null,
      body: null,
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

  for (const subscriptionRow of subscriptionList) {
    const outcome = await sendWebPushNotification(subscriptionRow, payload);

    if (outcome.success) {
      sent += 1;
      console.log("PRICE_ALERT_PUSH_SENT", {
        alertId,
        email: normalizedEmail || subscriptionRow.email || null,
        subscriptionId: subscriptionRow.id,
      });
      logPriceAlertPush("PRICE_ALERT_PUSH_SENT", {
        path: "nextjs-price-alerts-runner",
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

    logPriceAlertPush("PRICE_ALERT_PUSH_FAILED", {
      path: "nextjs-price-alerts-runner",
      alertId,
      email: normalizedEmail || subscriptionRow.email || null,
      userId: resolvedUserId || subscriptionRow.user_id || null,
      subscriptionId: subscriptionRow.id,
      endpoint: subscriptionRow.endpoint,
      success: false,
      message: outcome.message || outcome.error || "WEB_PUSH_SEND_FAILED",
      statusCode: outcome.statusCode || null,
      body: outcome.body || null,
      error: outcome.error || outcome.message || "WEB_PUSH_SEND_FAILED",
    });

    if (outcome.statusCode === 404 || outcome.statusCode === 410) {
      await supabase.from("push_subscriptions").delete().eq("id", subscriptionRow.id);
    }
  }

  return { sent, failed, skipped: 0 };
}

function normalizedEmailHash(email) {
  return String(email || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 24);
}
