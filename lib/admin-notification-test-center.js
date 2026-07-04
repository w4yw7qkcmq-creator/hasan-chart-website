import { createRequire } from "node:module";
import { dispatchAnalysisReplyAlerts } from "./analysis-reply-dispatch.js";
import { createUserNotification } from "./create-user-notification.js";
import { getSiteUrl, sendTemplateEmail } from "./email.js";
import {
  buildEmailParagraph,
  buildSubscriptionExpiryEmailContent,
  buildVipSignalEmailContent,
} from "./email-layout.js";
import { evaluateDeliveryForRecipient } from "./notification-delivery-gate-server.js";
import { NOTIFICATION_SOUND_KEYS } from "./notification-sound-keys.js";
import { dispatchUnifiedSiteAlerts } from "./site-notification-dispatch.js";

const require = createRequire(import.meta.url);
const { sendPriceAlertEmail } = require("../worker/price-alert-email.js");
const { sendPriceAlertPushNotifications } = require("../worker/push-sender.js");

export const ADMIN_NOTIFICATION_TEST_TYPES = [
  {
    id: "price_alert",
    label: "Price Alert",
    icon: "🔔",
    description: "worker/price-alert-email.js + createUserNotification + push-sender",
  },
  {
    id: "analysis_reply",
    label: "Analysis Reply",
    icon: "📊",
    description: "dispatchAnalysisReplyAlerts",
  },
  {
    id: "vip_signal",
    label: "VIP Signal",
    icon: "⭐",
    description: "dispatchUnifiedSiteAlerts (vip_signal)",
  },
  {
    id: "account_management",
    label: "Account Management",
    icon: "📂",
    description: "dispatchUnifiedSiteAlerts (account_management)",
  },
  {
    id: "subscription_expiry",
    label: "Subscription Expiry",
    icon: "⏳",
    description: "dispatchUnifiedSiteAlerts (subscription_expiry)",
  },
  {
    id: "system",
    label: "System",
    icon: "⚙️",
    description: "dispatchUnifiedSiteAlerts (system)",
  },
];

function normalizeRecipientEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function buildTestId(type) {
  return `admin-test-${type}-${Date.now()}`;
}

function formatPriceAlertNumber(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return String(value ?? "");
  return numberValue.toLocaleString("en-US", {
    maximumFractionDigits: numberValue >= 1 ? 4 : 8,
  });
}

function buildPriceAlertTestMessage({ coin, targetPrice, currentPrice }) {
  return [
    `العملة: ${coin}`,
    `السعر الذي طلبته: ${formatPriceAlertNumber(targetPrice)}`,
    `السعر الحالي عند التفعيل: ${formatPriceAlertNumber(currentPrice)}`,
    "",
    "نوع التنبيه: وصول السعر للأعلى",
    "",
    "تم تفعيل التنبيه لأن السعر وصل إلى المستوى المطلوب.",
  ].join("\n");
}

async function runPriceAlertTest(supabase, userEmail) {
  const alertId = buildTestId("price_alert");
  const coin = "BTC";
  const targetPrice = 65000;
  const currentPrice = 65001;
  const conditionLabel = "وصول السعر للأعلى";
  const coinLabel = "BTC/USDT";
  const notificationMessage = buildPriceAlertTestMessage({ coin, targetPrice, currentPrice });
  const pushBody = [
    `العملة: ${coinLabel}`,
    `السعر المطلوب: ${formatPriceAlertNumber(targetPrice)}`,
    `السعر الحالي: ${formatPriceAlertNumber(currentPrice)}`,
  ].join(" | ");

  const delivery = await evaluateDeliveryForRecipient(supabase, {
    userEmail,
    notificationKey: NOTIFICATION_SOUND_KEYS.PRICE_ALERT,
  });

  let notificationCreated = false;

  if (delivery.inApp) {
    const { data, error } = await createUserNotification(supabase, {
      userEmail,
      title: "🔔 وصل السعر إلى هدف التنبيه",
      message: notificationMessage,
      type: "price-alert",
      notificationKey: NOTIFICATION_SOUND_KEYS.PRICE_ALERT,
      url: "/alerts?tab=notifications",
      metadata: {
        alertId,
        type: "price-alert",
        notification_key: NOTIFICATION_SOUND_KEYS.PRICE_ALERT,
        coin,
        targetPrice,
        currentPrice,
        adminTest: true,
      },
      skipDeliveryGate: true,
    });

    notificationCreated = Boolean(data?.id) && !error;
  }

  let pushResult = {
    sent: 0,
    failed: 0,
    skipped: 1,
    skipReason: delivery.push ? "not-attempted" : delivery.blockedReason || "PUSH_BLOCKED_BY_SETTINGS",
  };

  if (delivery.push) {
    pushResult = await sendPriceAlertPushNotifications({
      supabase,
      workerEntry: "lib/admin-notification-test-center.js",
      alertId,
      email: userEmail,
      title: "🔔 وصل السعر إلى هدف التنبيه",
      body: pushBody,
      url: "/notifications",
    });
  }

  let emailResult = {
    sent: false,
    skipped: true,
    reason: delivery.email ? "not-attempted" : delivery.blockedReason || "EMAIL_BLOCKED_BY_SETTINGS",
  };

  if (delivery.email) {
    emailResult = await sendPriceAlertEmail({
      supabase,
      resendApiKey: process.env.RESEND_API_KEY,
      email: userEmail,
      coinLabel,
      conditionLabel,
      targetPrice: formatPriceAlertNumber(targetPrice),
      currentPrice: formatPriceAlertNumber(currentPrice),
      alertId,
    });
  }

  return {
    type: "price_alert",
    testId: alertId,
    userEmail,
    delivery,
    notificationCreated,
    pushResult,
    emailResult,
  };
}

async function runAnalysisReplyTest(supabase, userEmail) {
  const requestId = buildTestId("analysis_reply");

  const result = await dispatchAnalysisReplyAlerts({
    supabase,
    userEmail,
    coin: "BTC",
    reply:
      "هذا رد اختبار من Notification Test Center. تم استخدام dispatchAnalysisReplyAlerts الحقيقي.",
    requestId,
  });

  return {
    type: "analysis_reply",
    testId: requestId,
    userEmail,
    ...result,
  };
}

async function runVipSignalTest(supabase, userEmail) {
  const signalId = buildTestId("vip_signal");
  const coin = "BTC";
  const title = "🚨 توصية VIP Spot جديدة";
  const message = `تم نشر توصية جديدة على ${coin}. افتح صفحة توصيات VIP Spot للاطلاع على التفاصيل.`;
  const emailContent = buildVipSignalEmailContent({
    coin,
    entry: "65000",
    targets: "68000 / 70000",
    stopLoss: "63500",
    notes: "اختبار Notification Test Center — dispatchUnifiedSiteAlerts",
  });

  const result = await dispatchUnifiedSiteAlerts(supabase, {
    preset: "vip_signal",
    userEmail,
    title,
    message,
    type: "vip-spot",
    url: "/vip-spot",
    metadata: {
      signalId,
      signalType: "spot",
      coin,
      notification_key: "vip_signal",
      adminTest: true,
    },
    sendEmail: () =>
      sendTemplateEmail({
        to: userEmail,
        subject: `${title} - ${coin}`,
        title,
        content: emailContent,
        actionText: "فتح صفحة التوصيات",
        actionUrl: `${getSiteUrl()}/vip-spot`,
      }),
  });

  return {
    type: "vip_signal",
    testId: signalId,
    userEmail,
    ...result,
  };
}

async function runAccountManagementTest(supabase, userEmail) {
  const requestId = buildTestId("account_management");
  const platformLabel = "Binance Spot";

  const result = await dispatchUnifiedSiteAlerts(supabase, {
    preset: "account_management",
    userEmail,
    title: "تم قبول طلب إدارة حسابك ✅",
    message: `تم تفعيل طلب إدارة حسابك على ${platformLabel}.`,
    metadata: {
      requestId,
      platform: platformLabel,
      notification_key: "account_management",
      adminTest: true,
    },
    sendEmail: () =>
      sendTemplateEmail({
        to: userEmail,
        subject: "تم قبول طلب إدارة حسابك ✅",
        title: "تم قبول طلب إدارة حسابك ✅",
        content: buildEmailParagraph(
          `تم تفعيل طلب إدارة حسابك على ${platformLabel}. هذا اختبار Notification Test Center.`
        ),
        actionText: "فتح لوحة التحكم",
        actionUrl: `${getSiteUrl()}/my-dashboard`,
      }),
  });

  return {
    type: "account_management",
    testId: requestId,
    userEmail,
    ...result,
  };
}

async function runSubscriptionExpiryTest(supabase, userEmail) {
  const testId = buildTestId("subscription_expiry");
  const planName = "VIP Spot Test";
  const title = "انتهى اشتراكك ⚠️";
  const message = `انتهت صلاحية ${planName}. اضغط لتجديد اشتراكك من صفحة الباقات.`;

  const result = await dispatchUnifiedSiteAlerts(supabase, {
    preset: "subscription_expiry",
    userEmail,
    title,
    message,
    metadata: {
      planName,
      variant: "expired",
      notification_key: NOTIFICATION_SOUND_KEYS.SUBSCRIPTION_EXPIRY,
      adminTest: true,
      testId,
    },
    sendEmail: () =>
      sendTemplateEmail({
        to: userEmail,
        subject: "انتهاء الاشتراك - HasaN CharT World",
        title,
        content: buildSubscriptionExpiryEmailContent({
          planName,
          variant: "expired",
        }),
        actionText: "تجديد الاشتراك",
        actionUrl: `${getSiteUrl()}/subscriptions`,
      }),
  });

  return {
    type: "subscription_expiry",
    testId,
    userEmail,
    ...result,
  };
}

async function runSystemTest(supabase, userEmail) {
  const requestId = buildTestId("system");
  const planName = "VIP Spot Test";
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const expiresLabel = new Date(expiresAt).toLocaleDateString("ar-SY-u-nu-latn");

  const result = await dispatchUnifiedSiteAlerts(supabase, {
    preset: "system",
    userEmail,
    title: "تم تفعيل اشتراكك بنجاح 🎉",
    message: `تم تفعيل اشتراك ${planName} حتى تاريخ ${expiresLabel}.`,
    url: "/subscriptions",
    metadata: {
      requestId,
      planName,
      expiresAt,
      notification_key: "system",
      adminTest: true,
    },
    sendEmail: () =>
      sendTemplateEmail({
        to: userEmail,
        subject: "تم تفعيل اشتراكك بنجاح 🎉",
        title: "تم تفعيل اشتراكك بنجاح 🎉",
        content: buildEmailParagraph(
          `تم تفعيل اشتراك ${planName} حتى تاريخ ${expiresLabel}. هذا اختبار Notification Test Center.`
        ),
        actionText: "عرض الباقات",
        actionUrl: `${getSiteUrl()}/subscriptions`,
      }),
  });

  return {
    type: "system",
    testId: requestId,
    userEmail,
    ...result,
  };
}

export async function runAdminNotificationTest(supabase, { type, targetEmail }) {
  const userEmail = normalizeRecipientEmail(targetEmail);

  if (!userEmail) {
    throw new Error("Recipient email is required.");
  }

  switch (type) {
    case "price_alert":
      return runPriceAlertTest(supabase, userEmail);
    case "analysis_reply":
      return runAnalysisReplyTest(supabase, userEmail);
    case "vip_signal":
      return runVipSignalTest(supabase, userEmail);
    case "account_management":
      return runAccountManagementTest(supabase, userEmail);
    case "subscription_expiry":
      return runSubscriptionExpiryTest(supabase, userEmail);
    case "system":
      return runSystemTest(supabase, userEmail);
    default:
      throw new Error(`Unsupported notification test type: ${type}`);
  }
}
