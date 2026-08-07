import { configureWebPush, sendWebPushNotification } from "./push-server.js";
import { evaluateDeliveryForRecipient } from "./notification-delivery-gate-server.js";
import { normalizeNotificationKey } from "./notification-sound-keys.js";
import { logNotificationDeliveryDecision } from "./notification-delivery-gate.js";

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
  notificationKey = null,
  skipDeliveryGate = false,
}) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const resolvedKey = notificationKey ? normalizeNotificationKey(notificationKey) : null;

  if (supabase && resolvedKey && !skipDeliveryGate) {
    const delivery = await evaluateDeliveryForRecipient(supabase, {
      userEmail: normalizedEmail,
      userId,
      notificationKey: resolvedKey,
    });

    if (!delivery.push) {
      logNotificationDeliveryDecision("WEB_PUSH_SKIPPED_BY_SETTINGS", {
        email: normalizedEmail || null,
        userId: userId || null,
        notificationKey: resolvedKey,
        reason: delivery.blockedReason || "push-blocked",
        successLogTag,
        ...meta,
      });

      return {
        sent: 0,
        failed: 0,
        skipped: 1,
        skipReason: delivery.blockedReason || "PUSH_BLOCKED_BY_SETTINGS",
      };
    }
  }

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

    return { sent: 0, failed: 0, skipped: 1, skipReason: "web-push-not-configured" };
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

    return { sent: 0, failed: 0, skipped: 1, skipReason: "no-subscription" };
  }

  const payload = {
    title,
    body,
    url,
    icon: "/logo.png",
    type,
    tag: tag || type,
  };

  if (resolvedKey) {
    payload.notification_key = resolvedKey;
  }

  if (meta.requestId) {
    payload.requestId = String(meta.requestId);
  }

  if (meta.signalId) {
    payload.signalId = String(meta.signalId);
  }

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
  title,
  body,
}) {
  const coinLabel = String(coin || "").trim().toUpperCase() || "العملة";

  return sendTargetedPushNotification({
    supabase,
    email,
    userId,
    title: title || `📩 رد الإدارة على تحليل ${coinLabel}`,
    body:
      body ||
      "وصل رد جديد على طلب التحليل. افتح صفحة طلباتي للاطلاع على التفاصيل.",
    url: `${SITE_URL}/my-analysis`,
    type: "analysis-ready",
    tag: `analysis-ready-${requestId}`,
    successLogTag: "ANALYSIS_REPLY_PUSH_SENT",
    meta: { requestId, coin: coinLabel },
    notificationKey: "analysis_reply",
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
    notificationKey: "vip_signal",
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
    notificationKey: "account_management",
  });
}

function normalizedEmailHash(email) {
  return String(email || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 24);
}
