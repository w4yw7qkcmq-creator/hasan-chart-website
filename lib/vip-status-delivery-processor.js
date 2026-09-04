import { getSiteUrl } from "./email.js";
import { buildEmailLayout } from "./email.js";
import { enqueueEmail } from "./email-outbox-shared.js";
import { dispatchSiteNotification } from "./site-notification-dispatch.js";
import { sendTargetedPushNotification } from "./push-notifications.js";
import { mapVipStatusEmailDeliveryOutcome } from "./transactional-email-dispatch-result.js";
import { normalizeVipSignalType } from "./vip-subscriber-notify.js";
import {
  buildStatusDeliveryIdempotencyKey,
  buildVipStatusPushTag,
  buildVipStatusSiteNotificationKey,
} from "./vip-status-delivery-keys.js";
import { buildVipStatusNotificationCopy } from "./vip-recommendation-status-copy.js";
import { buildVipStatusUpdateEmailContent } from "./vip-status-delivery-email-content.js";
import { calculateVipStatusRetryDelay } from "./vip-status-delivery-config.js";
import { MAX_VIP_STATUS_DELIVERY_ATTEMPTS } from "./vip-status-delivery-keys.js";
import { syncVipStatusEventDeliverySummary } from "./vip-status-event-summary-sync.js";

const SIGNAL_SELECT =
  "id, signal_type, coin, entry, targets, stop_loss, notes, status, trade_status, created_at";

export function buildVipStatusDeliveryContext(signal, eventType) {
  const normalizedSignalType = normalizeVipSignalType(signal?.signal_type);
  const signalPagePath = normalizedSignalType === "futures" ? "/vip-futures" : "/vip-spot";
  const signalPageUrl = `${getSiteUrl()}${signalPagePath}`;
  const copy = buildVipStatusNotificationCopy(eventType, {
    ...signal,
    signal_type: normalizedSignalType,
  });
  const emailContent = buildVipStatusUpdateEmailContent({
    eventType,
    signal: { ...signal, signal_type: normalizedSignalType },
    copy,
  });

  return {
    signal: { ...signal, signal_type: normalizedSignalType },
    eventType,
    copy,
    signalPagePath,
    signalPageUrl,
    emailContent,
  };
}

async function finalizeDelivery(supabase, row, patch) {
  if (!row?.id) return;
  await supabase
    .from("vip_signal_status_deliveries")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", row.id);

  if (row.signal_id && row.event_type) {
    await syncVipStatusEventDeliverySummary(supabase, {
      signalId: row.signal_id,
      eventType: row.event_type,
    });
  }
}

async function markRetryableFailure(supabase, row, { errorCode, errorMessage, retryable = true }) {
  const attempts = Number(row.attempt_count) || 0;
  const maxAttempts = MAX_VIP_STATUS_DELIVERY_ATTEMPTS;

  if (!retryable || attempts >= maxAttempts) {
    await finalizeDelivery(supabase, row, {
      status: "failed",
      failed_at: new Date().toISOString(),
      processing_started_at: null,
      processing_worker_id: null,
      error_code: errorCode || "delivery-failed",
      error_message_safe: String(errorMessage || "delivery-failed").slice(0, 200),
      next_retry_at: null,
    });
    return { outcome: "failed", retryScheduled: false };
  }

  const nextRetryAt = new Date(Date.now() + calculateVipStatusRetryDelay(attempts)).toISOString();
  await finalizeDelivery(supabase, row, {
    status: "failed",
    failed_at: new Date().toISOString(),
    processing_started_at: null,
    processing_worker_id: null,
    error_code: errorCode || "delivery-failed",
    error_message_safe: String(errorMessage || "delivery-failed").slice(0, 200),
    next_retry_at: nextRetryAt,
  });
  return { outcome: "failed", retryScheduled: true };
}

export async function processVipStatusSiteDelivery(
  supabase,
  row,
  ctx,
  deps = {}
) {
  const { signal, eventType, copy, signalPagePath } = ctx;
  const email = String(row.user_email || "").trim().toLowerCase();
  const siteKey = buildVipStatusSiteNotificationKey(signal.id, eventType, email);
  const dispatchSite = deps.dispatchSiteNotification || dispatchSiteNotification;

  const siteResult = await dispatchSite(supabase, {
    preset: "vip_signal",
    userEmail: email,
    title: copy.title,
    message: copy.message,
    notificationKey: siteKey,
    type: copy.siteType,
    url: signalPagePath,
    metadata: {
      signalId: signal.id,
      signalType: signal.signal_type,
      coin: signal.coin,
      eventType: copy.eventTypeKey,
      notification_key: siteKey,
    },
  });

  if (siteResult?.error) {
    return markRetryableFailure(supabase, row, {
      errorCode: "site-failed",
      errorMessage: siteResult.error?.message || "site-failed",
    });
  }

  if (siteResult?.skipped) {
    await finalizeDelivery(supabase, row, {
      status: "skipped",
      processing_started_at: null,
      processing_worker_id: null,
      error_message_safe: siteResult.reason || "skipped",
    });
    return { outcome: "skipped" };
  }

  if (siteResult?.data?.id) {
    await finalizeDelivery(supabase, row, {
      status: "delivered",
      delivered_at: new Date().toISOString(),
      processing_started_at: null,
      processing_worker_id: null,
      provider_message_id: String(siteResult.data.id),
    });
    return { outcome: "delivered" };
  }

  await finalizeDelivery(supabase, row, {
    status: "skipped",
    processing_started_at: null,
    processing_worker_id: null,
    error_message_safe: "notification-not-created",
  });
  return { outcome: "skipped" };
}

export async function processVipStatusPushDelivery(
  supabase,
  row,
  ctx,
  deps = {}
) {
  const { signal, eventType, copy, signalPageUrl } = ctx;
  const email = String(row.user_email || "").trim().toLowerCase();
  const dispatchPush = deps.sendTargetedPushNotification || sendTargetedPushNotification;

  const pushResult = await dispatchPush({
    supabase,
    email,
    title: copy.title,
    body: copy.message,
    url: signalPageUrl,
    type: copy.siteType,
    notificationKey: copy.notificationKey,
    tag: buildVipStatusPushTag(signal.id, eventType),
    successLogTag: "VIP_STATUS_PUSH_SENT",
    meta: { signalId: signal.id, eventType, coin: signal.coin },
  });

  if ((pushResult?.sent || 0) > 0) {
    await finalizeDelivery(supabase, row, {
      status: "delivered",
      delivered_at: new Date().toISOString(),
      processing_started_at: null,
      processing_worker_id: null,
      provider_message_id: pushResult?.messageId || null,
    });
    return { outcome: "delivered" };
  }

  const unavailable =
    pushResult?.skipReason === "expired" ||
    pushResult?.skipReason === "no-subscription" ||
    (pushResult?.skipped || 0) > 0;

  if (unavailable) {
    await finalizeDelivery(supabase, row, {
      status: "unavailable",
      processing_started_at: null,
      processing_worker_id: null,
      error_code: pushResult?.skipReason || "push-unavailable",
      error_message_safe: String(
        pushResult?.skipReason || "push-unavailable"
      ).slice(0, 200),
    });
    return { outcome: "unavailable" };
  }

  return markRetryableFailure(supabase, row, {
    errorCode: pushResult?.skipReason || "push-not-sent",
    errorMessage: pushResult?.skipReason || "push-not-sent",
    retryable: true,
  });
}

async function loadLinkedOutboxRow(supabase, outboxId) {
  if (!outboxId) return null;
  const { data, error } = await supabase
    .from("email_outbox")
    .select("id, status, sent_at, resend_id")
    .eq("id", outboxId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message || "Failed to load linked email outbox row");
  }
  return data || null;
}

async function finalizeDeliveredFromSentOutbox(supabase, row, outbox) {
  await finalizeDelivery(supabase, row, {
    status: "delivered",
    delivered_at: outbox.sent_at || new Date().toISOString(),
    provider_message_id: outbox.resend_id || outbox.id,
    processing_started_at: null,
    processing_worker_id: null,
    error_code: null,
    error_message_safe: null,
    failed_at: null,
  });
  return { outcome: "delivered", reconciled: true, outboxId: outbox.id };
}

export async function processVipStatusEmailDelivery(
  supabase,
  row,
  ctx,
  deps = {}
) {
  const { signal, eventType, copy, signalPageUrl, emailContent } = ctx;
  const email = String(row.user_email || "").trim().toLowerCase();
  const enqueueFn = deps.enqueueEmail || enqueueEmail;

  if (!email.includes("@")) {
    await finalizeDelivery(supabase, row, {
      status: "unavailable",
      processing_started_at: null,
      processing_worker_id: null,
      error_code: "invalid-email",
    });
    return { outcome: "unavailable" };
  }

  if (
    row.provider_message_id &&
    (row.error_code === "outbox-queued" || row.status === "pending" || row.status === "failed")
  ) {
    const linkedOutbox = await loadLinkedOutboxRow(supabase, row.provider_message_id);
    if (linkedOutbox?.status === "sent") {
      return finalizeDeliveredFromSentOutbox(supabase, row, linkedOutbox);
    }

    await finalizeDelivery(supabase, row, {
      status: "pending",
      processing_started_at: null,
      processing_worker_id: null,
      error_code: "outbox-queued",
      error_message_safe: "awaiting-email-worker",
    });
    return { outcome: "queued", outboxId: row.provider_message_id };
  }

  const emailKey = buildStatusDeliveryIdempotencyKey(signal.id, eventType, email, "email");
  const html = buildEmailLayout({
    title: copy.title,
    content: emailContent,
    actionText: "فتح صفحة التوصيات",
    actionUrl: signalPageUrl,
  });

  try {
    const enqueueResult = await enqueueFn({
      idempotencyKey: emailKey,
      recipientEmail: email,
      subject: copy.subject,
      html,
      messageType: "vip_signal_status",
      metadata: {
        source: "vip_signal_status",
        signalId: signal.id,
        eventType,
        coin: signal.coin,
        userEmail: email,
        vipDeliveryId: row.id,
        vipDeliveryIdempotencyKey: emailKey,
      },
    });

    const mapped = mapVipStatusEmailDeliveryOutcome({
      success: true,
      mode: "outbox",
      enqueued: Boolean(enqueueResult?.enqueued),
      duplicate: Boolean(enqueueResult?.duplicate),
      record: enqueueResult?.record || null,
    });

    if (mapped.duplicate) {
      const duplicateOutboxId = mapped.outboxId || mapped.providerMessageId || null;
      const linkedOutbox = duplicateOutboxId
        ? await loadLinkedOutboxRow(supabase, duplicateOutboxId)
        : null;
      if (linkedOutbox?.status === "sent") {
        return finalizeDeliveredFromSentOutbox(supabase, row, linkedOutbox);
      }

      await finalizeDelivery(supabase, row, {
        status: "pending",
        processing_started_at: null,
        processing_worker_id: null,
        provider_message_id: duplicateOutboxId,
        error_code: "outbox-duplicate",
        error_message_safe: "duplicate-outbox-enqueue",
      });
      return { outcome: "duplicate", outboxId: duplicateOutboxId };
    }

    if (mapped.queued) {
      await finalizeDelivery(supabase, row, {
        status: "pending",
        processing_started_at: null,
        processing_worker_id: null,
        provider_message_id: mapped.outboxId || null,
        error_code: "outbox-queued",
        error_message_safe: "awaiting-email-worker",
      });
      return { outcome: "queued", outboxId: mapped.outboxId };
    }

    return markRetryableFailure(supabase, row, {
      errorCode: mapped.errorCode || "enqueue-failed",
      errorMessage: mapped.errorCode || "enqueue-failed",
    });
  } catch (err) {
    return markRetryableFailure(supabase, row, {
      errorCode: "enqueue-error",
      errorMessage: err?.message || "enqueue-error",
    });
  }
}

export async function processVipStatusDeliveryRow(
  supabase,
  row,
  ctx,
  deps = {}
) {
  const channel = String(row.channel || "").trim();

  if (channel === "site") {
    return processVipStatusSiteDelivery(supabase, row, ctx, deps);
  }
  if (channel === "push") {
    return processVipStatusPushDelivery(supabase, row, ctx, deps);
  }
  if (channel === "email") {
    return processVipStatusEmailDelivery(supabase, row, ctx, deps);
  }

  await finalizeDelivery(supabase, row, {
    status: "failed",
    error_code: "unknown-channel",
    processing_started_at: null,
    processing_worker_id: null,
  });
  return { outcome: "failed" };
}

export async function loadVipSignalForDelivery(supabase, signalId) {
  const { data, error } = await supabase
    .from("vip_signals")
    .select(SIGNAL_SELECT)
    .eq("id", signalId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to load VIP signal");
  }
  if (!data?.id) {
    throw new Error("signal_not_found");
  }
  return data;
}
