import { buildEmailLayout, getSiteUrl, sendEmail } from "./email.js";
import { buildSubscriptionRejectedEmailContent } from "./email-layout.js";
import { dispatchTransactionalEmail } from "./email-dispatch.js";

export const SUBSCRIPTION_REJECTED_SUBJECT = "تم رفض طلب اشتراكك — HasaN CharT World";
export const SUBSCRIPTION_REJECTED_MESSAGE_TYPE = "subscription_rejected";
export const SUBSCRIPTION_REJECTED_SUPPORT_URL = "https://t.me/HasaNCharTSupport";
export const SUBSCRIPTION_RESUBMIT_PATH = "/subscriptions#plans";

export function buildSubscriptionResubmitUrl(siteUrl = "") {
  const base = String(siteUrl || "").trim().replace(/\/$/, "") || "https://www.hasanchartworld.com";
  return `${base}${SUBSCRIPTION_RESUBMIT_PATH}`;
}

export function buildSubscriptionRejectedIdempotencyKey(subscriptionRequestId) {
  return `subscription_rejected:${String(subscriptionRequestId || "").trim()}`;
}

export function resolveSubscriptionRejectedRecipientEmail(userEmail) {
  return String(userEmail || "").trim().toLowerCase();
}

export function resolveSubscriptionRejectedUsername({ username, userEmail }) {
  const normalizedUsername = String(username || "").trim();
  if (normalizedUsername) return normalizedUsername;

  const email = String(userEmail || "").trim();
  if (!email.includes("@")) return "عضونا";

  return email.split("@")[0] || "عضونا";
}

function mapSubscriptionRejectedDispatchResult(dispatchResult) {
  if (!dispatchResult) {
    return {
      sent: false,
      queued: false,
      duplicate: false,
      reason: "empty-dispatch-result",
    };
  }

  if (dispatchResult.mode === "outbox") {
    const queued = Boolean(dispatchResult.enqueued || dispatchResult.duplicate);

    return {
      sent: dispatchResult.success === true && queued,
      queued: Boolean(dispatchResult.enqueued),
      duplicate: Boolean(dispatchResult.duplicate),
      emailQueued: queued,
      skipped: Boolean(dispatchResult.duplicate),
      mode: "outbox",
      messageType: SUBSCRIPTION_REJECTED_MESSAGE_TYPE,
      record: dispatchResult.record || null,
      error: dispatchResult.error || null,
    };
  }

  if (dispatchResult.success === false) {
    return {
      sent: false,
      queued: false,
      duplicate: false,
      emailQueued: false,
      skipped: Boolean(dispatchResult.skipped),
      mode: "direct",
      messageType: SUBSCRIPTION_REJECTED_MESSAGE_TYPE,
      status: dispatchResult.status,
      error: dispatchResult.error,
    };
  }

  return {
    sent: true,
    queued: false,
    duplicate: false,
    emailQueued: true,
    mode: "direct",
    messageType: SUBSCRIPTION_REJECTED_MESSAGE_TYPE,
    messageId: dispatchResult.id || null,
  };
}

export async function dispatchSubscriptionRejectedEmail(
  {
    subscriptionRequestId,
    recipientEmail,
    username,
    planName,
    price,
    createdAt,
    rejectionReason,
    adminNotes,
  },
  deps = {}
) {
  const normalizedRequestId = String(subscriptionRequestId || "").trim();
  const normalizedEmail = resolveSubscriptionRejectedRecipientEmail(recipientEmail);
  const dispatchFn = deps.dispatchTransactionalEmail || dispatchTransactionalEmail;
  const hasRecipient = Boolean(normalizedEmail);

  if (!normalizedRequestId) {
    return {
      sent: false,
      emailQueued: false,
      hasRecipient,
      reason: "missing-subscription-request-id",
    };
  }

  if (!normalizedEmail) {
    return {
      sent: false,
      emailQueued: false,
      hasRecipient: false,
      reason: "missing-recipient-email",
    };
  }

  const resolvedUsername = resolveSubscriptionRejectedUsername({
    username,
    userEmail: normalizedEmail,
  });

  const emailContent = buildSubscriptionRejectedEmailContent({
    username: resolvedUsername,
    planName,
    price,
    createdAt,
    rejectionReason,
    adminNotes,
    requestId: normalizedRequestId,
  });

  const html = buildEmailLayout({
    title: "تم رفض طلب الاشتراك",
    content: emailContent,
    actionText: "إعادة تقديم الطلب",
    actionUrl: buildSubscriptionResubmitUrl(getSiteUrl()),
    secondaryActionText: "التواصل مع الدعم الفني",
    secondaryActionUrl: SUBSCRIPTION_REJECTED_SUPPORT_URL,
    preheader: `تعذر اعتماد طلب اشتراكك في ${planName || "الباقة المطلوبة"}.`,
  });

  try {
    const dispatchResult = await dispatchFn(
      {
        idempotencyKey: buildSubscriptionRejectedIdempotencyKey(normalizedRequestId),
        recipientEmail: normalizedEmail,
        subject: SUBSCRIPTION_REJECTED_SUBJECT,
        html,
        messageType: SUBSCRIPTION_REJECTED_MESSAGE_TYPE,
        recordId: normalizedRequestId,
        metadata: {
          source: "subscription_rejected",
          subscriptionRequestId: normalizedRequestId,
          userEmail: normalizedEmail,
          planName: planName || null,
          rejectionReason: rejectionReason || null,
        },
      },
      {
        sendDirectEmail: deps.sendDirectEmail || sendEmail,
        ...deps.dispatchDeps,
      }
    );

    const emailResult = mapSubscriptionRejectedDispatchResult(dispatchResult);

    return {
      ...emailResult,
      hasRecipient: true,
    };
  } catch (error) {
    return {
      sent: false,
      queued: false,
      duplicate: false,
      emailQueued: false,
      hasRecipient: true,
      error: error?.message || String(error),
    };
  }
}
