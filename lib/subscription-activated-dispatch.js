import { buildEmailLayout, getSiteUrl, sendEmail } from "./email.js";
import { buildEmailParagraph } from "./email-layout.js";
import { dispatchTransactionalEmail } from "./email-dispatch.js";

const SUBSCRIPTION_ACTIVATED_SUBJECT = "تم تفعيل اشتراكك بنجاح 🎉";
const SUBSCRIPTION_ACTIVATED_MESSAGE_TYPE = "subscription_activated";

export function buildSubscriptionActivatedIdempotencyKey(subscriptionRequestId) {
  return `subscription_activated:${String(subscriptionRequestId || "").trim()}`;
}

export function resolveSubscriptionActivatedRecipientEmail(userEmail) {
  return String(userEmail || "").trim().toLowerCase();
}

export function buildSubscriptionActivatedEmailContent({ planName, expiresAt }) {
  const expiresLabel = new Date(expiresAt).toLocaleDateString("ar-SY-u-nu-latn");

  return {
    subject: SUBSCRIPTION_ACTIVATED_SUBJECT,
    title: SUBSCRIPTION_ACTIVATED_SUBJECT,
    content: buildEmailParagraph(
      `تم تفعيل اشتراك ${planName || "الخاص بك"} حتى تاريخ ${expiresLabel}.`
    ),
    actionText: "عرض الباقات",
    actionUrl: `${getSiteUrl()}/subscriptions`,
  };
}

function mapSubscriptionActivatedDispatchResult(dispatchResult) {
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
      skipped: Boolean(dispatchResult.duplicate),
      mode: "outbox",
      messageType: SUBSCRIPTION_ACTIVATED_MESSAGE_TYPE,
      record: dispatchResult.record || null,
      error: dispatchResult.error || null,
    };
  }

  if (dispatchResult.success === false) {
    return {
      sent: false,
      queued: false,
      duplicate: false,
      skipped: Boolean(dispatchResult.skipped),
      mode: "direct",
      messageType: SUBSCRIPTION_ACTIVATED_MESSAGE_TYPE,
      status: dispatchResult.status,
      error: dispatchResult.error,
    };
  }

  return {
    sent: true,
    queued: false,
    duplicate: false,
    mode: "direct",
    messageType: SUBSCRIPTION_ACTIVATED_MESSAGE_TYPE,
    messageId: dispatchResult.id || null,
  };
}

export async function dispatchSubscriptionActivatedEmail(
  { subscriptionRequestId, recipientEmail, planName, expiresAt },
  deps = {}
) {
  const normalizedRequestId = String(subscriptionRequestId || "").trim();
  const normalizedEmail = resolveSubscriptionActivatedRecipientEmail(recipientEmail);
  const dispatchFn = deps.dispatchTransactionalEmail || dispatchTransactionalEmail;
  const hasRecipient = Boolean(normalizedEmail);

  console.log("SUBSCRIPTION_ACTIVATED_EMAIL_DISPATCH_STARTED", {
    subscriptionRequestId: normalizedRequestId || null,
    hasRecipient,
    messageType: SUBSCRIPTION_ACTIVATED_MESSAGE_TYPE,
  });

  console.log("SUBSCRIPTION_ACTIVATED_RECIPIENT_RESOLVED", {
    subscriptionRequestId: normalizedRequestId || null,
    hasRecipient,
    messageType: SUBSCRIPTION_ACTIVATED_MESSAGE_TYPE,
  });

  if (!normalizedRequestId) {
    console.error("SUBSCRIPTION_ACTIVATED_EMAIL_DISPATCH_FAILED", {
      subscriptionRequestId: null,
      hasRecipient,
      messageType: SUBSCRIPTION_ACTIVATED_MESSAGE_TYPE,
      error: "missing-subscription-request-id",
    });

    return {
      sent: false,
      hasRecipient,
      reason: "missing-subscription-request-id",
    };
  }

  if (!normalizedEmail) {
    console.error("SUBSCRIPTION_ACTIVATED_EMAIL_DISPATCH_FAILED", {
      subscriptionRequestId: normalizedRequestId,
      hasRecipient: false,
      messageType: SUBSCRIPTION_ACTIVATED_MESSAGE_TYPE,
      error: "missing-recipient-email",
    });

    return {
      sent: false,
      hasRecipient: false,
      reason: "missing-recipient-email",
    };
  }

  if (!expiresAt) {
    console.error("SUBSCRIPTION_ACTIVATED_EMAIL_DISPATCH_FAILED", {
      subscriptionRequestId: normalizedRequestId,
      hasRecipient: true,
      messageType: SUBSCRIPTION_ACTIVATED_MESSAGE_TYPE,
      error: "missing-expires-at",
    });

    return {
      sent: false,
      hasRecipient: true,
      reason: "missing-expires-at",
    };
  }

  const emailContent = buildSubscriptionActivatedEmailContent({ planName, expiresAt });
  const html = buildEmailLayout({
    title: emailContent.title,
    content: emailContent.content,
    actionText: emailContent.actionText,
    actionUrl: emailContent.actionUrl,
  });

  try {
    const dispatchResult = await dispatchFn(
      {
        idempotencyKey: buildSubscriptionActivatedIdempotencyKey(normalizedRequestId),
        recipientEmail: normalizedEmail,
        subject: emailContent.subject,
        html,
        messageType: SUBSCRIPTION_ACTIVATED_MESSAGE_TYPE,
        recordId: normalizedRequestId,
        metadata: {
          source: "subscription_activated",
          subscriptionRequestId: normalizedRequestId,
          userEmail: normalizedEmail,
          planName: planName || null,
          expiresAt,
        },
      },
      {
        sendDirectEmail: deps.sendDirectEmail || sendEmail,
        ...deps.dispatchDeps,
      }
    );

    const emailResult = mapSubscriptionActivatedDispatchResult(dispatchResult);

    console.log("SUBSCRIPTION_ACTIVATED_EMAIL_DISPATCH_RESULT", {
      subscriptionRequestId: normalizedRequestId,
      hasRecipient: true,
      mode: emailResult.mode || null,
      queued: Boolean(emailResult.queued),
      duplicate: Boolean(emailResult.duplicate),
      sent: Boolean(emailResult.sent),
      messageType: SUBSCRIPTION_ACTIVATED_MESSAGE_TYPE,
      outboxId: emailResult.record?.id || null,
      error: emailResult.error || emailResult.reason || null,
    });

    if (!emailResult.sent) {
      console.error("SUBSCRIPTION_ACTIVATED_EMAIL_DISPATCH_FAILED", {
        subscriptionRequestId: normalizedRequestId,
        hasRecipient: true,
        mode: emailResult.mode || null,
        queued: Boolean(emailResult.queued),
        duplicate: Boolean(emailResult.duplicate),
        sent: false,
        messageType: SUBSCRIPTION_ACTIVATED_MESSAGE_TYPE,
        outboxId: emailResult.record?.id || null,
        error: emailResult.error || emailResult.reason || "not-sent",
      });
    }

    return {
      ...emailResult,
      hasRecipient: true,
    };
  } catch (error) {
    console.error("SUBSCRIPTION_ACTIVATED_EMAIL_DISPATCH_FAILED", {
      subscriptionRequestId: normalizedRequestId,
      hasRecipient: true,
      messageType: SUBSCRIPTION_ACTIVATED_MESSAGE_TYPE,
      error: error?.message || "dispatch-threw",
    });

    return {
      sent: false,
      hasRecipient: true,
      error: error?.message || String(error),
    };
  }
}
