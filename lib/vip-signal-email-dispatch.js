import { getSiteUrl } from "./email.js";
import { dispatchTemplateTransactionalEmail } from "./template-transactional-email.js";

const VIP_SIGNAL_MESSAGE_TYPE = "vip_signal";

function normalizeRecipientEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeEmailHash(email) {
  return normalizeRecipientEmail(email).replace(/[^a-z0-9]/g, "").slice(0, 24);
}

export function buildVipSignalIdempotencyKey(signalId, recipientEmail) {
  const normalizedSignalId = String(signalId || "").trim();
  const emailHash = normalizeEmailHash(recipientEmail);

  if (!normalizedSignalId) {
    throw new Error("signalId is required for VIP signal email idempotency");
  }

  if (!emailHash) {
    throw new Error("recipientEmail is required for VIP signal email idempotency");
  }

  return `vip_signal:${normalizedSignalId}:${emailHash}`;
}

function mapVipSignalDispatchResult(dispatchResult) {
  if (!dispatchResult) {
    return {
      sent: false,
      queued: false,
      duplicate: false,
      mode: null,
      messageType: VIP_SIGNAL_MESSAGE_TYPE,
    };
  }

  if (dispatchResult.mode === "outbox") {
    const queued = Boolean(dispatchResult.enqueued || dispatchResult.duplicate);

    return {
      sent: dispatchResult.success === true && queued,
      queued: Boolean(dispatchResult.enqueued),
      duplicate: Boolean(dispatchResult.duplicate),
      mode: "outbox",
      messageType: VIP_SIGNAL_MESSAGE_TYPE,
      record: dispatchResult.record || null,
      error: dispatchResult.error || null,
    };
  }

  return {
    sent: dispatchResult.success !== false,
    queued: false,
    duplicate: false,
    mode: "direct",
    messageType: VIP_SIGNAL_MESSAGE_TYPE,
    error: dispatchResult.error || null,
  };
}

export async function dispatchVipSignalEmail(
  {
    signalId,
    recipientEmail,
    signalType,
    coin,
    subject,
    title,
    content,
    actionText,
    actionUrl,
  },
  deps = {}
) {
  const normalizedEmail = normalizeRecipientEmail(recipientEmail);
  const normalizedSignalId = String(signalId || "").trim();
  const hasRecipient = Boolean(normalizedEmail);

  if (!normalizedSignalId || !hasRecipient) {
    return {
      sent: false,
      queued: false,
      duplicate: false,
      hasRecipient,
      reason: !normalizedSignalId ? "missing-signal-id" : "missing-recipient-email",
    };
  }

  const dispatchResult = await dispatchTemplateTransactionalEmail(
    {
      idempotencyKey: buildVipSignalIdempotencyKey(normalizedSignalId, normalizedEmail),
      recipientEmail: normalizedEmail,
      messageType: VIP_SIGNAL_MESSAGE_TYPE,
      recordId: normalizedSignalId,
      subject,
      title,
      content,
      actionText: actionText || "فتح صفحة التوصيات",
      actionUrl: actionUrl || `${getSiteUrl()}/vip-spot`,
      metadata: {
        source: "vip_signal",
        signalId: normalizedSignalId,
        signalType: signalType || null,
        coin: coin || null,
        userEmail: normalizedEmail,
      },
    },
    deps
  );

  return {
    ...mapVipSignalDispatchResult(dispatchResult),
    hasRecipient: true,
  };
}
