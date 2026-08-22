/**
 * Shared mapping from dispatchTransactionalEmail() results to delivery outcomes.
 */

export function mapTransactionalEmailDispatchResult(dispatchResult) {
  if (!dispatchResult) {
    return {
      mode: null,
      success: false,
      enqueued: false,
      duplicate: false,
      record: null,
      error: null,
      providerId: null,
    };
  }

  if (dispatchResult.mode === "outbox") {
    return {
      mode: "outbox",
      success: dispatchResult.success === true,
      enqueued: Boolean(dispatchResult.enqueued),
      duplicate: Boolean(dispatchResult.duplicate),
      record: dispatchResult.record || null,
      error: dispatchResult.error || null,
      providerId: dispatchResult.record?.provider_message_id || null,
    };
  }

  return {
    mode: "direct",
    success: dispatchResult.success !== false && dispatchResult.skipped !== true,
    enqueued: false,
    duplicate: false,
    record: null,
    error: dispatchResult.error || null,
    providerId: dispatchResult.id || dispatchResult.result?.id || null,
  };
}

/**
 * VIP status email channel — normalized delivery contract.
 */
export function mapVipStatusEmailDeliveryOutcome(dispatchResult) {
  const mapped = mapTransactionalEmailDispatchResult(dispatchResult);

  if (dispatchResult?.skipped === true) {
    return {
      delivered: false,
      queued: false,
      duplicate: false,
      unavailable: true,
      providerMessageId: null,
      outboxId: null,
      errorCode: mapped.error || "unavailable",
      failed: false,
    };
  }

  if (mapped.mode === "outbox") {
    if (mapped.duplicate) {
      return {
        delivered: false,
        queued: false,
        duplicate: true,
        unavailable: false,
        providerMessageId: mapped.providerId,
        outboxId: mapped.record?.id || null,
        errorCode: null,
        failed: false,
      };
    }

    if (mapped.success && mapped.enqueued) {
      return {
        delivered: false,
        queued: true,
        duplicate: false,
        unavailable: false,
        providerMessageId: null,
        outboxId: mapped.record?.id || null,
        errorCode: null,
        failed: false,
      };
    }

    return {
      delivered: false,
      queued: false,
      duplicate: false,
      unavailable: false,
      providerMessageId: null,
      outboxId: null,
      errorCode: mapped.error || "enqueue-failed",
      failed: true,
    };
  }

  if (mapped.mode === "direct" && mapped.success) {
    return {
      delivered: true,
      queued: false,
      duplicate: false,
      unavailable: false,
      providerMessageId: mapped.providerId,
      outboxId: null,
      errorCode: null,
      failed: false,
    };
  }

  return {
    delivered: false,
    queued: false,
    duplicate: false,
    unavailable: false,
    providerMessageId: null,
    outboxId: null,
    errorCode: mapped.error || "email-send-failed",
    failed: true,
  };
}

/** @deprecated Use mapTransactionalEmailDispatchResult — kept for vip-signal publish path. */
export function mapVipSignalDispatchResult(dispatchResult) {
  const mapped = mapTransactionalEmailDispatchResult(dispatchResult);

  if (mapped.mode === "outbox") {
    const accepted = mapped.success && (mapped.enqueued || mapped.duplicate);
    return {
      sent: accepted,
      queued: mapped.enqueued,
      duplicate: mapped.duplicate,
      mode: "outbox",
      record: mapped.record,
      error: mapped.error,
    };
  }

  return {
    sent: mapped.success,
    queued: false,
    duplicate: false,
    mode: "direct",
    error: mapped.error,
  };
}
