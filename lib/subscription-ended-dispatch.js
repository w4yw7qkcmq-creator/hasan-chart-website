import { buildEmailLayout, getSiteUrl, sendEmail } from "./email.js";
import { buildSubscriptionEndedEmailContent } from "./email-layout.js";
import { dispatchTransactionalEmail } from "./email-dispatch.js";
import { SUBSCRIPTION_REJECTED_SUPPORT_URL } from "./subscription-rejected-dispatch.js";

export const SUBSCRIPTION_ENDED_SUBJECT = "تم إنهاء اشتراكك — HasaN CharT World";
export const SUBSCRIPTION_ENDED_MESSAGE_TYPE = "subscription_ended";
export const SUBSCRIPTION_RENEW_PATH = "/subscriptions#plans";

export function buildSubscriptionRenewUrl(siteUrl = "") {
  const base = String(siteUrl || "").trim().replace(/\/$/, "") || "https://www.hasanchartworld.com";
  return `${base}${SUBSCRIPTION_RENEW_PATH}`;
}

export function buildSubscriptionEndedIdempotencyKey(subscriptionRequestId) {
  return `subscription_ended:${String(subscriptionRequestId || "").trim()}`;
}

export function resolveSubscriptionEndedRecipientEmail(userEmail) {
  return String(userEmail || "").trim().toLowerCase();
}

export function resolveSubscriptionEndedUsername({ username, userEmail }) {
  const normalizedUsername = String(username || "").trim();
  if (normalizedUsername) return normalizedUsername;

  const email = String(userEmail || "").trim();
  if (!email.includes("@")) return "عضونا";

  return email.split("@")[0] || "عضونا";
}

function mapSubscriptionEndedDispatchResult(dispatchResult) {
  if (!dispatchResult) {
    return {
      sent: false,
      queued: false,
      duplicate: false,
      emailQueued: false,
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
      messageType: SUBSCRIPTION_ENDED_MESSAGE_TYPE,
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
      messageType: SUBSCRIPTION_ENDED_MESSAGE_TYPE,
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
    messageType: SUBSCRIPTION_ENDED_MESSAGE_TYPE,
    messageId: dispatchResult.id || null,
  };
}

export async function dispatchSubscriptionEndedEmail(
  {
    subscriptionRequestId,
    recipientEmail,
    username,
    planName,
    price,
    endedAt,
    removalNotes,
  },
  deps = {}
) {
  const normalizedRequestId = String(subscriptionRequestId || "").trim();
  const normalizedEmail = resolveSubscriptionEndedRecipientEmail(recipientEmail);
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

  const resolvedUsername = resolveSubscriptionEndedUsername({
    username,
    userEmail: normalizedEmail,
  });

  const emailContent = buildSubscriptionEndedEmailContent({
    username: resolvedUsername,
    planName,
    price,
    endedAt,
    removalNotes,
    requestId: normalizedRequestId,
  });

  const html = buildEmailLayout({
    title: "تم إنهاء اشتراكك",
    content: emailContent,
    actionText: "تجديد الاشتراك",
    actionUrl: buildSubscriptionRenewUrl(getSiteUrl()),
    secondaryActionText: "التواصل مع الدعم الفني",
    secondaryActionUrl: SUBSCRIPTION_REJECTED_SUPPORT_URL,
    preheader: `تم إنهاء اشتراكك في ${planName || "الباقة"}.`,
  });

  try {
    const dispatchResult = await dispatchFn(
      {
        idempotencyKey: buildSubscriptionEndedIdempotencyKey(normalizedRequestId),
        recipientEmail: normalizedEmail,
        subject: SUBSCRIPTION_ENDED_SUBJECT,
        html,
        messageType: SUBSCRIPTION_ENDED_MESSAGE_TYPE,
        recordId: normalizedRequestId,
        metadata: {
          source: "subscription_ended",
          subscriptionRequestId: normalizedRequestId,
          userEmail: normalizedEmail,
          planName: planName || null,
        },
      },
      {
        sendDirectEmail: deps.sendDirectEmail || sendEmail,
        ...deps.dispatchDeps,
      }
    );

    const emailResult = mapSubscriptionEndedDispatchResult(dispatchResult);

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
