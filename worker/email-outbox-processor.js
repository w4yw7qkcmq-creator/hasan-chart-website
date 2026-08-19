const EMAIL_OUTBOX_TABLE = "email_outbox";
const DEFAULT_FROM = "HasaN CharT World <support@hasanchartworld.com>";
const DEFAULT_REPLY_TO = "support@hasanchartworld.com";
const VIP_STATUS_EMAIL_MESSAGE_TYPE = "vip_signal_status";
const { blockProductionTestRecipientSend } = require("../lib/email-recipient-guard.cjs");

function extractVipDeliveryLink(metadata = {}) {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const deliveryId = metadata.vipDeliveryId || metadata.vip_delivery_id || null;
  const idempotencyKey =
    metadata.vipDeliveryIdempotencyKey || metadata.vip_delivery_idempotency_key || null;

  if (!deliveryId && !idempotencyKey) {
    return null;
  }

  return { deliveryId, idempotencyKey };
}

async function syncVipStatusDeliveryFromOutbox(
  supabase,
  row,
  { outcome, providerMessageId = null, errorCode = null } = {}
) {
  if (!supabase || !row) {
    return { synced: false, reason: "missing-input" };
  }

  if (String(row.message_type || "").trim() !== VIP_STATUS_EMAIL_MESSAGE_TYPE) {
    return { synced: false, reason: "not-vip-status-email" };
  }

  const link = extractVipDeliveryLink(row.metadata);
  if (!link) {
    return { synced: false, reason: "missing-vip-delivery-link" };
  }

  const patch = { updated_at: new Date().toISOString() };

  if (outcome === "sent") {
    Object.assign(patch, {
      status: "delivered",
      delivered_at: new Date().toISOString(),
      failed_at: null,
      error_code: null,
      error_message_safe: null,
      provider_message_id: providerMessageId || row.provider_message_id || null,
    });
  } else if (outcome === "skipped") {
    Object.assign(patch, {
      status: "unavailable",
      error_code: errorCode || "outbox-skipped",
      error_message_safe: String(errorCode || "outbox-skipped").slice(0, 200),
    });
  } else if (outcome === "failed") {
    Object.assign(patch, {
      status: "failed",
      failed_at: new Date().toISOString(),
      error_code: errorCode || "outbox-failed",
      error_message_safe: String(errorCode || "outbox-failed").slice(0, 200),
    });
  } else {
    return { synced: false, reason: "unknown-outcome" };
  }

  let query = supabase.from("vip_signal_status_deliveries").update(patch);

  if (link.deliveryId) {
    query = query.eq("id", link.deliveryId);
  } else {
    query = query.eq("idempotency_key", link.idempotencyKey);
  }

  const { error } = await query;

  if (error) {
    return { synced: false, reason: error.message || "update-failed" };
  }

  return { synced: true, outcome, deliveryId: link.deliveryId || null };
}

function isEmailQueueWorkerEnabled() {
  const value = String(process.env.EMAIL_QUEUE_WORKER_ENABLED || "")
    .trim()
    .toLowerCase();

  return value === "1" || value === "true" || value === "yes";
}

function getEmailQueueConfig(overrides = {}) {
  const batchSize = Number(process.env.EMAIL_QUEUE_BATCH_SIZE || 25);
  const maxRuntimeMs = Number(process.env.EMAIL_QUEUE_MAX_RUNTIME_MS || 50000);
  const staleProcessingMinutes = Number(
    process.env.EMAIL_QUEUE_STALE_PROCESSING_MINUTES || 15
  );
  const rateLimitPerSecond = Number(
    process.env.EMAIL_QUEUE_RATE_LIMIT_PER_SECOND || 3
  );

  return {
    batchSize:
      Number.isFinite(batchSize) && batchSize > 0
        ? Math.min(Math.floor(batchSize), 100)
        : 25,
    maxRuntimeMs:
      Number.isFinite(maxRuntimeMs) && maxRuntimeMs > 0
        ? Math.floor(maxRuntimeMs)
        : 50000,
    staleProcessingMinutes:
      Number.isFinite(staleProcessingMinutes) && staleProcessingMinutes > 0
        ? Math.floor(staleProcessingMinutes)
        : 15,
    rateLimitPerSecond:
      Number.isFinite(rateLimitPerSecond) && rateLimitPerSecond > 0
        ? Math.min(Math.floor(rateLimitPerSecond), 10)
        : 3,
    ...overrides,
  };
}

function extractRecipientDomain(email) {
  const normalized = String(email || "").trim().toLowerCase();
  const atIndex = normalized.indexOf("@");

  if (atIndex <= 0 || atIndex === normalized.length - 1) {
    return null;
  }

  return normalized.slice(atIndex + 1);
}

function truncateError(error) {
  return String(error || "unknown error").trim().slice(0, 500);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logEmailQueueEvent(event, meta = {}) {
  const payload = {
    level: meta.level || "info",
    event,
    timestamp: new Date().toISOString(),
    outboxId: meta.outboxId || null,
    messageType: meta.messageType || null,
    recipientDomain: meta.recipientDomain || null,
    attempts: meta.attempts ?? null,
    status: meta.status || null,
    durationMs: meta.durationMs ?? null,
    resendId: meta.resendId || null,
    claimedCount: meta.claimedCount ?? null,
    releasedPending: meta.releasedPending ?? null,
    markedFailed: meta.markedFailed ?? null,
    error: meta.error || null,
    summary: meta.summary || null,
  };

  const line = JSON.stringify(payload);

  if (payload.level === "error") {
    console.error(line);
    return;
  }

  console.log(line);
}

function calculateRetryDelay(attempts, options = {}) {
  if (options.retryAfterSeconds && Number.isFinite(Number(options.retryAfterSeconds))) {
    return Math.max(Number(options.retryAfterSeconds), 60) * 1000;
  }

  const attemptNumber = Math.max(1, Number(attempts) || 1);

  if (options.isRateLimited) {
    return Math.max(60 * 1000, calculateRetryDelay(attemptNumber));
  }

  if (attemptNumber <= 1) {
    return 60 * 1000;
  }

  if (attemptNumber === 2) {
    return 5 * 60 * 1000;
  }

  if (attemptNumber === 3) {
    return 15 * 60 * 1000;
  }

  return 60 * 60 * 1000;
}

async function claimPendingEmailBatch(supabase, options = {}) {
  const config = getEmailQueueConfig(options);
  const { data, error } = await supabase.rpc("claim_email_outbox_batch", {
    p_limit: config.batchSize,
  });

  if (error) {
    throw new Error(error.message || "Failed to claim email outbox batch");
  }

  const rows = Array.isArray(data) ? data : [];

  logEmailQueueEvent("EMAIL_QUEUE_BATCH_CLAIMED", {
    claimedCount: rows.length,
  });

  return rows;
}

async function releaseStaleProcessingEmails(supabase, options = {}) {
  const config = getEmailQueueConfig(options);
  const { data, error } = await supabase.rpc(
    "release_stale_email_outbox_processing",
    {
      p_stale_minutes: config.staleProcessingMinutes,
    }
  );

  if (error) {
    throw new Error(error.message || "Failed to release stale processing rows");
  }

  const releasedPending = Number(data?.releasedPending || 0);
  const markedFailed = Number(data?.markedFailed || 0);

  if (releasedPending > 0 || markedFailed > 0) {
    logEmailQueueEvent("EMAIL_QUEUE_STALE_ROWS_RELEASED", {
      releasedPending,
      markedFailed,
    });
  }

  return {
    releasedPending,
    markedFailed,
  };
}

async function markEmailSent(supabase, { outboxId, resendId = null } = {}) {
  const { error } = await supabase
    .from(EMAIL_OUTBOX_TABLE)
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      resend_id: resendId,
      error: null,
    })
    .eq("id", outboxId)
    .eq("status", "processing");

  if (error) {
    throw new Error(error.message || "Failed to mark email as sent");
  }
}

async function markEmailFailed(supabase, { outboxId, error: failureError } = {}) {
  const { error } = await supabase
    .from(EMAIL_OUTBOX_TABLE)
    .update({
      status: "failed",
      failed_at: new Date().toISOString(),
      error: truncateError(failureError),
    })
    .eq("id", outboxId)
    .eq("status", "processing");

  if (error) {
    throw new Error(error.message || "Failed to mark email as failed");
  }
}

async function markEmailRetryScheduled(
  supabase,
  { outboxId, error: failureError, scheduledAt } = {}
) {
  const { error } = await supabase
    .from(EMAIL_OUTBOX_TABLE)
    .update({
      status: "pending",
      claimed_at: null,
      scheduled_at: scheduledAt,
      error: truncateError(failureError),
    })
    .eq("id", outboxId)
    .eq("status", "processing");

  if (error) {
    throw new Error(error.message || "Failed to schedule email retry");
  }
}

async function markEmailSkipped(supabase, { outboxId, error: skipReason } = {}) {
  const { error } = await supabase
    .from(EMAIL_OUTBOX_TABLE)
    .update({
      status: "skipped",
      skipped_at: new Date().toISOString(),
      error: truncateError(skipReason),
    })
    .eq("id", outboxId)
    .eq("status", "processing");

  if (error) {
    throw new Error(error.message || "Failed to mark email as skipped");
  }
}

async function sendOutboxEmailViaResend(row) {
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail = process.env.EMAIL_FROM?.trim() || DEFAULT_FROM;
  const replyToEmail = process.env.EMAIL_REPLY_TO?.trim() || DEFAULT_REPLY_TO;
  const recipientEmail = String(row?.recipient_email || "")
    .trim()
    .toLowerCase();

  if (!resendApiKey) {
    return {
      success: false,
      skipped: true,
      error: "Missing RESEND_API_KEY",
    };
  }

  if (!recipientEmail) {
    return {
      success: false,
      skipped: true,
      error: "Missing recipient",
    };
  }

  const recipientBlocked = blockProductionTestRecipientSend({
    path: "worker/email-outbox-processor.js::sendOutboxEmailViaResend",
    to: recipientEmail,
  });

  if (recipientBlocked) {
    return recipientBlocked;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [recipientEmail],
      subject: row.subject || "HasaN CharT World",
      html: row.html || "",
      text: row.text || undefined,
      reply_to: replyToEmail,
    }),
  });

  const resultText = await response.text().catch(() => "");
  let result = {};

  try {
    result = resultText ? JSON.parse(resultText) : {};
  } catch {
    result = { raw: resultText };
  }

  if (!response.ok) {
    return {
      success: false,
      error: result?.message || response.statusText || "Email provider error",
      status: response.status,
      result,
    };
  }

  return {
    success: true,
    id: result?.id || null,
    status: response.status,
    result,
  };
}

async function handleProcessingFailure(supabase, row, sendResult) {
  const attempts = Number(row.attempts) || 0;
  const maxAttempts = Number(row.max_attempts) || 5;
  const failureError =
    sendResult?.error || sendResult?.result?.message || "Email send failed";
  const isRateLimited = Number(sendResult?.status) === 429;
  const retryAfterSeconds = Number(sendResult?.result?.retry_after || 0);

  if (attempts >= maxAttempts) {
    await markEmailFailed(supabase, {
      outboxId: row.id,
      error: failureError,
    });

    await syncVipStatusDeliveryFromOutbox(supabase, row, {
      outcome: "failed",
      errorCode: truncateError(failureError),
    });

    logEmailQueueEvent("EMAIL_QUEUE_MESSAGE_FAILED", {
      level: "error",
      outboxId: row.id,
      messageType: row.message_type,
      recipientDomain: extractRecipientDomain(row.recipient_email),
      attempts,
      status: "failed",
      error: truncateError(failureError),
    });

    return "failed";
  }

  const delayMs = calculateRetryDelay(attempts, {
    isRateLimited,
    retryAfterSeconds,
  });
  const scheduledAt = new Date(Date.now() + delayMs).toISOString();

  await markEmailRetryScheduled(supabase, {
    outboxId: row.id,
    error: failureError,
    scheduledAt,
  });

  logEmailQueueEvent("EMAIL_QUEUE_MESSAGE_RETRY_SCHEDULED", {
    outboxId: row.id,
    messageType: row.message_type,
    recipientDomain: extractRecipientDomain(row.recipient_email),
    attempts,
    status: "pending",
    error: truncateError(failureError),
  });

  return "retry";
}

async function processSingleOutboxEmail(
  supabase,
  row,
  { sendOutboxEmail = sendOutboxEmailViaResend } = {}
) {
  const startedAt = Date.now();
  const sendResult = await sendOutboxEmail(row);

  if (sendResult?.success) {
    await markEmailSent(supabase, {
      outboxId: row.id,
      resendId: sendResult.id || null,
    });

    await syncVipStatusDeliveryFromOutbox(supabase, row, {
      outcome: "sent",
      providerMessageId: sendResult.id || null,
    });

    logEmailQueueEvent("EMAIL_QUEUE_MESSAGE_SENT", {
      outboxId: row.id,
      messageType: row.message_type,
      recipientDomain: extractRecipientDomain(row.recipient_email),
      attempts: row.attempts,
      status: "sent",
      durationMs: Date.now() - startedAt,
      resendId: sendResult.id || null,
    });

    return "sent";
  }

  if (sendResult?.skipped) {
    await markEmailSkipped(supabase, {
      outboxId: row.id,
      error: sendResult.error || "skipped",
    });

    await syncVipStatusDeliveryFromOutbox(supabase, row, {
      outcome: "skipped",
      errorCode: sendResult.error || "skipped",
    });

    logEmailQueueEvent("EMAIL_QUEUE_MESSAGE_SKIPPED", {
      outboxId: row.id,
      messageType: row.message_type,
      recipientDomain: extractRecipientDomain(row.recipient_email),
      attempts: row.attempts,
      status: "skipped",
      durationMs: Date.now() - startedAt,
      error: truncateError(sendResult.error),
    });

    return "skipped";
  }

  return handleProcessingFailure(supabase, row, sendResult);
}

async function processEmailOutboxBatch(supabase, options = {}) {
  const config = getEmailQueueConfig(options);
  const startedAt = Date.now();
  const sendOutboxEmail = options.sendOutboxEmail || sendOutboxEmailViaResend;
  const sleepFn = options.sleep || sleep;
  const minIntervalMs = Math.ceil(1000 / config.rateLimitPerSecond);
  let lastSendAt = 0;

  const summary = {
    claimed: 0,
    sent: 0,
    retried: 0,
    failed: 0,
    skipped: 0,
    stoppedByRuntime: false,
    durationMs: 0,
  };

  while (Date.now() - startedAt < config.maxRuntimeMs) {
    const batch = await claimPendingEmailBatch(supabase, {
      batchSize: config.batchSize,
    });

    if (!batch.length) {
      break;
    }

    summary.claimed += batch.length;

    for (const row of batch) {
      if (Date.now() - startedAt >= config.maxRuntimeMs) {
        summary.stoppedByRuntime = true;
        break;
      }

      if (lastSendAt > 0) {
        const elapsed = Date.now() - lastSendAt;
        const waitMs = minIntervalMs - elapsed;

        if (waitMs > 0) {
          await sleepFn(waitMs);
        }
      }

      const outcome = await processSingleOutboxEmail(supabase, row, {
        sendOutboxEmail,
      });

      if (outcome === "sent") {
        summary.sent += 1;
      } else if (outcome === "retry") {
        summary.retried += 1;
      } else if (outcome === "failed") {
        summary.failed += 1;
      } else if (outcome === "skipped") {
        summary.skipped += 1;
      }

      lastSendAt = Date.now();
    }

    if (summary.stoppedByRuntime) {
      break;
    }
  }

  summary.durationMs = Date.now() - startedAt;
  return summary;
}

async function runEmailQueueCron(supabase, options = {}) {
  if (!options.skipCronStartLog) {
    logEmailQueueEvent("EMAIL_QUEUE_CRON_STARTED");
  }

  if (!isEmailQueueWorkerEnabled()) {
    logEmailQueueEvent("EMAIL_QUEUE_WORKER_SKIPPED");
    return {
      success: true,
      skipped: true,
      reason: "EMAIL_QUEUE_WORKER_DISABLED",
    };
  }

  const staleSummary = await releaseStaleProcessingEmails(supabase, options);
  const batchSummary = await processEmailOutboxBatch(supabase, options);
  const summary = {
    ...batchSummary,
    staleReleasedPending: staleSummary.releasedPending,
    staleMarkedFailed: staleSummary.markedFailed,
  };

  if (!options.skipCronFinishedLog) {
    logEmailQueueEvent("EMAIL_QUEUE_CRON_FINISHED", { summary });
  }

  return {
    success: true,
    skipped: false,
    summary,
  };
}

module.exports = {
  isEmailQueueWorkerEnabled,
  getEmailQueueConfig,
  extractRecipientDomain,
  logEmailQueueEvent,
  calculateRetryDelay,
  claimPendingEmailBatch,
  releaseStaleProcessingEmails,
  markEmailSent,
  markEmailFailed,
  markEmailRetryScheduled,
  markEmailSkipped,
  sendOutboxEmailViaResend,
  processSingleOutboxEmail,
  processEmailOutboxBatch,
  runEmailQueueCron,
};
