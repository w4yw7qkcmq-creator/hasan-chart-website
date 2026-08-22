/**
 * Canonical email outbox sender + processor (shared by website ESM and worker CJS).
 */

const { blockProductionTestRecipientSend } = require("./email-outbox-guard.cjs");
const { syncCampaignRecipientFromOutbox } = require("./email-campaign/delivery-sync.cjs");

const EMAIL_OUTBOX_TABLE = "email_outbox";
const EMAIL_MESSAGES_TABLE = "email_messages";
const DEFAULT_FROM = "HasaN CharT World <support@hasanchartworld.com>";
const DEFAULT_REPLY_TO = "support@hasanchartworld.com";
const RESEND_API_URL = "https://api.resend.com/emails";
const PROVIDER_IDEMPOTENCY_PREFIX = "hcw-outbox/";
const VIP_STATUS_EMAIL_MESSAGE_TYPE = "vip_signal_status";

const RESEND_TAG_NAME_PATTERN = /^[a-z0-9_-]{1,64}$/i;
const RESEND_TAG_VALUE_MAX = 256;

function isEmailQueueWorkerEnabled(env = process.env) {
  const value = String(env.EMAIL_QUEUE_WORKER_ENABLED || "")
    .trim()
    .toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function getEmailQueueConfig(overrides = {}, env = process.env) {
  const batchSize = Number(env.EMAIL_QUEUE_BATCH_SIZE || 25);
  const maxRuntimeMs = Number(env.EMAIL_QUEUE_MAX_RUNTIME_MS || 50000);
  const staleProcessingMinutes = Number(env.EMAIL_QUEUE_STALE_PROCESSING_MINUTES || 15);
  const rateLimitPerSecond = Number(env.EMAIL_QUEUE_RATE_LIMIT_PER_SECOND || 3);

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
  if (atIndex <= 0 || atIndex === normalized.length - 1) return null;
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
    providerIdempotencyKey: meta.providerIdempotencyKey || null,
    claimedCount: meta.claimedCount ?? null,
    releasedPending: meta.releasedPending ?? null,
    markedFailed: meta.markedFailed ?? null,
    finalizedSent: meta.finalizedSent ?? null,
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
  if (attemptNumber <= 1) return 60 * 1000;
  if (attemptNumber === 2) return 5 * 60 * 1000;
  if (attemptNumber === 3) return 15 * 60 * 1000;
  return 60 * 60 * 1000;
}

function buildProviderIdempotencyKey(outboxId) {
  const id = String(outboxId || "").trim();
  if (!id) {
    throw new Error("outboxId is required for provider idempotency key");
  }
  return `${PROVIDER_IDEMPOTENCY_PREFIX}${id}`.slice(0, 256);
}

function sanitizeResendTagValue(value, fallback = "unknown") {
  const normalized = String(value || fallback)
    .trim()
    .replace(/[^\w.-]/g, "_")
    .slice(0, RESEND_TAG_VALUE_MAX);
  return normalized || fallback;
}

function sanitizeResendTagName(name) {
  const normalized = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .slice(0, 64);
  if (!normalized || !RESEND_TAG_NAME_PATTERN.test(normalized)) {
    return null;
  }
  return normalized;
}

function buildOutboxResendTags(row = {}) {
  const tags = [];
  const messageType = sanitizeResendTagValue(row.message_type, "general");
  tags.push({ name: "message_type", value: messageType });

  if (row.id) {
    tags.push({ name: "outbox_id", value: sanitizeResendTagValue(row.id) });
  }

  const metadata =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? row.metadata
      : {};
  const campaignId = metadata.campaignId || metadata.campaign_id || null;
  if (campaignId) {
    tags.push({
      name: "campaign_id",
      value: sanitizeResendTagValue(campaignId),
    });
  }

  return tags.filter((tag) => sanitizeResendTagName(tag.name));
}

function parseResendResponseBody(resultText) {
  if (!resultText) return {};
  try {
    return JSON.parse(resultText);
  } catch {
    return { raw: resultText };
  }
}

function classifySendError(error, status) {
  const message = truncateError(error?.message || error);
  const lower = message.toLowerCase();
  const isTimeout =
    lower.includes("timeout") ||
    lower.includes("abort") ||
    lower.includes("network") ||
    lower.includes("fetch failed");
  const isUncertain = isTimeout || status === 408 || status === 504;

  return {
    message,
    isTimeout,
    isUncertain,
    isRateLimited: Number(status) === 429,
  };
}

async function sendOutboxEmailViaResend(row, deps = {}) {
  const fetchFn = deps.fetch || globalThis.fetch;
  const resendApiKey = deps.resendApiKey || process.env.RESEND_API_KEY?.trim();
  const fromEmail = deps.fromEmail || process.env.EMAIL_FROM?.trim() || DEFAULT_FROM;
  const replyToEmail =
    deps.replyToEmail || process.env.EMAIL_REPLY_TO?.trim() || DEFAULT_REPLY_TO;
  const recipientEmail = String(row?.recipient_email || "").trim().toLowerCase();
  const providerIdempotencyKey =
    row?.provider_idempotency_key || buildProviderIdempotencyKey(row?.id);

  if (!resendApiKey) {
    return {
      success: false,
      skipped: true,
      error: "Missing RESEND_API_KEY",
      providerIdempotencyKey,
    };
  }

  if (!recipientEmail) {
    return {
      success: false,
      skipped: true,
      error: "Missing recipient",
      providerIdempotencyKey,
    };
  }

  const recipientBlocked = blockProductionTestRecipientSend({
    path: deps.path || "lib/email-outbox-core.cjs::sendOutboxEmailViaResend",
    to: recipientEmail,
    env: deps.env || process.env,
  });

  if (recipientBlocked) {
    return { ...recipientBlocked, providerIdempotencyKey };
  }

  const payload = {
    from: fromEmail,
    to: [recipientEmail],
    subject: row.subject || "HasaN CharT World",
    html: row.html || "",
    text: row.text || undefined,
    reply_to: replyToEmail,
    tags: buildOutboxResendTags(row),
  };

  const headers = {
    Authorization: `Bearer ${resendApiKey}`,
    "Content-Type": "application/json",
    "Idempotency-Key": providerIdempotencyKey,
  };

  let response;
  let resultText = "";

  try {
    response = await fetchFn(RESEND_API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    resultText = await response.text().catch(() => "");
  } catch (error) {
    const classified = classifySendError(error);
    return {
      success: false,
      error: classified.message,
      uncertain: classified.isUncertain,
      timedOut: classified.isTimeout,
      providerIdempotencyKey,
      result: null,
    };
  }

  const result = parseResendResponseBody(resultText);

  if (!response.ok) {
    const classified = classifySendError(result?.message || response.statusText, response.status);
    return {
      success: false,
      error: result?.message || response.statusText || "Email provider error",
      status: response.status,
      result,
      uncertain: classified.isUncertain,
      isRateLimited: classified.isRateLimited,
      providerIdempotencyKey,
    };
  }

  return {
    success: true,
    id: result?.id || null,
    status: response.status,
    result,
    providerIdempotencyKey,
    idempotentReplay: response.status === 200 && Boolean(result?.id),
  };
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
  logEmailQueueEvent("EMAIL_QUEUE_BATCH_CLAIMED", { claimedCount: rows.length });
  return rows;
}

async function releaseStaleProcessingEmails(supabase, options = {}) {
  const config = getEmailQueueConfig(options);
  const { data, error } = await supabase.rpc("release_stale_email_outbox_processing", {
    p_stale_minutes: config.staleProcessingMinutes,
  });

  if (error) {
    throw new Error(error.message || "Failed to release stale processing rows");
  }

  const releasedPending = Number(data?.releasedPending || 0);
  const markedFailed = Number(data?.markedFailed || 0);
  const finalizedSent = Number(data?.finalizedSent || 0);

  if (releasedPending > 0 || markedFailed > 0 || finalizedSent > 0) {
    logEmailQueueEvent("EMAIL_QUEUE_STALE_ROWS_RELEASED", {
      releasedPending,
      markedFailed,
      finalizedSent,
    });
  }

  return { releasedPending, markedFailed, finalizedSent };
}

async function persistProviderIdempotencyKey(supabase, { outboxId, providerIdempotencyKey }) {
  const { error } = await supabase
    .from(EMAIL_OUTBOX_TABLE)
    .update({
      provider_idempotency_key: providerIdempotencyKey,
      updated_at: new Date().toISOString(),
    })
    .eq("id", outboxId)
    .in("status", ["processing", "accepted"]);

  if (error) {
    throw new Error(error.message || "Failed to persist provider idempotency key");
  }
}

async function markEmailAccepted(
  supabase,
  { outboxId, resendId, providerIdempotencyKey } = {}
) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from(EMAIL_OUTBOX_TABLE)
    .update({
      status: "accepted",
      accepted_at: now,
      resend_id: resendId,
      provider_idempotency_key: providerIdempotencyKey,
      provider_submission_state: "accepted",
      error: null,
      updated_at: now,
    })
    .eq("id", outboxId)
    .in("status", ["processing", "accepted"]);

  if (error) {
    throw new Error(error.message || "Failed to mark email as accepted");
  }
}

async function markEmailSent(supabase, { outboxId, resendId = null } = {}) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from(EMAIL_OUTBOX_TABLE)
    .update({
      status: "sent",
      sent_at: now,
      resend_id: resendId,
      provider_submission_state: "accepted",
      error: null,
      claimed_at: null,
      updated_at: now,
    })
    .eq("id", outboxId)
    .in("status", ["processing", "accepted"]);

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
      provider_submission_state: "none",
      error: truncateError(failureError),
      claimed_at: null,
    })
    .eq("id", outboxId)
    .in("status", ["processing", "accepted"]);

  if (error) {
    throw new Error(error.message || "Failed to mark email as failed");
  }
}

async function markEmailRetryScheduled(
  supabase,
  { outboxId, error: failureError, scheduledAt, providerSubmissionState = "none" } = {}
) {
  const { error } = await supabase
    .from(EMAIL_OUTBOX_TABLE)
    .update({
      status: "pending",
      claimed_at: null,
      scheduled_at: scheduledAt,
      provider_submission_state: providerSubmissionState,
      error: truncateError(failureError),
    })
    .eq("id", outboxId)
    .in("status", ["processing", "accepted"]);

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
      provider_submission_state: "none",
      error: truncateError(skipReason),
      claimed_at: null,
    })
    .eq("id", outboxId)
    .in("status", ["processing", "accepted"]);

  if (error) {
    throw new Error(error.message || "Failed to mark email as skipped");
  }
}

async function markEmailUncertain(supabase, { outboxId, error: uncertainError } = {}) {
  const { error } = await supabase
    .from(EMAIL_OUTBOX_TABLE)
    .update({
      status: "pending",
      claimed_at: null,
      scheduled_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      provider_submission_state: "uncertain",
      error: truncateError(uncertainError || "provider acceptance uncertain"),
    })
    .eq("id", outboxId)
    .in("status", ["processing", "accepted"]);

  if (error) {
    throw new Error(error.message || "Failed to mark email as uncertain");
  }
}

async function upsertEmailMessageFromOutbox(supabase, row, resendId) {
  if (!resendId || !supabase) return;

  const sentAt = new Date().toISOString();
  const { error } = await supabase.from(EMAIL_MESSAGES_TABLE).upsert(
    {
      resend_id: resendId,
      outbox_id: row.id,
      recipient_email: String(row.recipient_email || "").trim().toLowerCase(),
      subject: row.subject || null,
      message_type: row.message_type || "general",
      status: "sent",
      sent_at: sentAt,
      last_event_at: sentAt,
      updated_at: sentAt,
    },
    { onConflict: "resend_id" }
  );

  if (error) {
    logEmailQueueEvent("EMAIL_OUTBOX_ANALYTICS_UPSERT_FAILED", {
      level: "error",
      outboxId: row.id,
      resendId,
      error: error.message || String(error),
    });
  }
}

function extractVipDeliveryLink(metadata = {}) {
  if (!metadata || typeof metadata !== "object") return null;
  const deliveryId = metadata.vipDeliveryId || metadata.vip_delivery_id || null;
  const idempotencyKey =
    metadata.vipDeliveryIdempotencyKey || metadata.vip_delivery_idempotency_key || null;
  if (!deliveryId && !idempotencyKey) return null;
  return { deliveryId, idempotencyKey };
}

async function syncVipStatusDeliveryFromOutbox(
  supabase,
  row,
  { outcome, providerMessageId = null, errorCode = null } = {}
) {
  if (!supabase || !row) return { synced: false, reason: "missing-input" };
  if (String(row.message_type || "").trim() !== VIP_STATUS_EMAIL_MESSAGE_TYPE) {
    return { synced: false, reason: "not-vip-status-email" };
  }

  const link = extractVipDeliveryLink(row.metadata);
  if (!link) return { synced: false, reason: "missing-vip-delivery-link" };

  const patch = { updated_at: new Date().toISOString() };

  if (outcome === "provider_accepted" || outcome === "sent") {
    Object.assign(patch, {
      status: "provider_accepted",
      provider_message_id: providerMessageId || row.resend_id || null,
      error_code: null,
      error_message_safe: null,
      failed_at: null,
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
  if (error) return { synced: false, reason: error.message || "update-failed" };
  return { synced: true, outcome, deliveryId: link.deliveryId || null };
}

async function finalizeProviderAccepted(supabase, row, sendResult, deps = {}) {
  const resendId = sendResult.id || row.resend_id || null;
  const providerIdempotencyKey =
    sendResult.providerIdempotencyKey || buildProviderIdempotencyKey(row.id);

  await markEmailAccepted(supabase, {
    outboxId: row.id,
    resendId,
    providerIdempotencyKey,
  });

  const upsertFn = deps.upsertEmailMessageFromOutbox || upsertEmailMessageFromOutbox;
  await upsertFn(supabase, row, resendId);

  await markEmailSent(supabase, { outboxId: row.id, resendId });

  const syncFn = deps.syncVipStatusDeliveryFromOutbox || syncVipStatusDeliveryFromOutbox;
  await syncFn(supabase, row, {
    outcome: "provider_accepted",
    providerMessageId: resendId,
  });

  const campaignSyncFn = deps.syncCampaignRecipientFromOutbox || syncCampaignRecipientFromOutbox;
  await campaignSyncFn(supabase, row, {
    outcome: "provider_accepted",
    resendId,
  });

  return resendId;
}

async function handleProcessingFailure(supabase, row, sendResult, deps = {}) {
  const attempts = Number(row.attempts) || 0;
  const maxAttempts = Number(row.max_attempts) || 5;
  const failureError =
    sendResult?.error || sendResult?.result?.message || "Email send failed";
  const syncFn = deps.syncVipStatusDeliveryFromOutbox || syncVipStatusDeliveryFromOutbox;

  if (sendResult?.uncertain) {
    await markEmailUncertain(supabase, {
      outboxId: row.id,
      error: failureError,
    });

    logEmailQueueEvent("EMAIL_QUEUE_MESSAGE_UNCERTAIN", {
      outboxId: row.id,
      messageType: row.message_type,
      providerIdempotencyKey: sendResult.providerIdempotencyKey || null,
      error: truncateError(failureError),
    });

    return "retry";
  }

  if (attempts >= maxAttempts) {
    await markEmailFailed(supabase, { outboxId: row.id, error: failureError });
    await syncFn(supabase, row, {
      outcome: "failed",
      errorCode: truncateError(failureError),
    });
    const campaignSyncFn = deps.syncCampaignRecipientFromOutbox || syncCampaignRecipientFromOutbox;
    await campaignSyncFn(supabase, row, {
      outcome: "failed",
      error: truncateError(failureError),
    });

    logEmailQueueEvent("EMAIL_QUEUE_MESSAGE_FAILED", {
      level: "error",
      outboxId: row.id,
      messageType: row.message_type,
      attempts,
      status: "failed",
      error: truncateError(failureError),
    });

    return "failed";
  }

  const delayMs = calculateRetryDelay(attempts, {
    isRateLimited: sendResult?.isRateLimited,
    retryAfterSeconds: Number(sendResult?.result?.retry_after || 0),
  });

  await markEmailRetryScheduled(supabase, {
    outboxId: row.id,
    error: failureError,
    scheduledAt: new Date(Date.now() + delayMs).toISOString(),
  });

  logEmailQueueEvent("EMAIL_QUEUE_MESSAGE_RETRY_SCHEDULED", {
    outboxId: row.id,
    messageType: row.message_type,
    attempts,
    status: "pending",
    error: truncateError(failureError),
  });

  return "retry";
}

async function processSingleOutboxEmail(
  supabase,
  row,
  { sendOutboxEmail = sendOutboxEmailViaResend, sendDeps = {}, ...deps } = {}
) {
  const startedAt = Date.now();

  if (row.resend_id && (row.status === "processing" || row.status === "accepted")) {
    const resendId = await finalizeProviderAccepted(
      supabase,
      row,
      { id: row.resend_id, providerIdempotencyKey: row.provider_idempotency_key },
      deps
    );

    logEmailQueueEvent("EMAIL_QUEUE_MESSAGE_RECONCILED", {
      outboxId: row.id,
      resendId,
      status: "sent",
      durationMs: Date.now() - startedAt,
    });

    return "sent";
  }

  const providerIdempotencyKey =
    row.provider_idempotency_key || buildProviderIdempotencyKey(row.id);

  if (!row.provider_idempotency_key) {
    await persistProviderIdempotencyKey(supabase, {
      outboxId: row.id,
      providerIdempotencyKey,
    });
  }

  const sendResult = await sendOutboxEmail(
    { ...row, provider_idempotency_key: providerIdempotencyKey },
    sendDeps
  );

  if (sendResult?.success) {
    const resendId = await finalizeProviderAccepted(supabase, row, sendResult, deps);

    logEmailQueueEvent("EMAIL_QUEUE_MESSAGE_SENT", {
      outboxId: row.id,
      messageType: row.message_type,
      recipientDomain: extractRecipientDomain(row.recipient_email),
      attempts: row.attempts,
      status: "sent",
      durationMs: Date.now() - startedAt,
      resendId,
      providerIdempotencyKey,
      idempotentReplay: Boolean(sendResult.idempotentReplay),
    });

    return "sent";
  }

  if (sendResult?.skipped) {
    await markEmailSkipped(supabase, {
      outboxId: row.id,
      error: sendResult.error || "skipped",
    });

    const syncFn = deps.syncVipStatusDeliveryFromOutbox || syncVipStatusDeliveryFromOutbox;
    await syncFn(supabase, row, {
      outcome: "skipped",
      errorCode: sendResult.error || "skipped",
    });

    logEmailQueueEvent("EMAIL_QUEUE_MESSAGE_SKIPPED", {
      outboxId: row.id,
      messageType: row.message_type,
      status: "skipped",
      durationMs: Date.now() - startedAt,
      error: truncateError(sendResult.error),
    });

    return "skipped";
  }

  return handleProcessingFailure(supabase, row, sendResult, deps);
}

async function processEmailOutboxBatch(supabase, options = {}) {
  const config = getEmailQueueConfig(options);
  const startedAt = Date.now();
  const sendOutboxEmail = options.sendOutboxEmail || sendOutboxEmailViaResend;
  const sendDeps = options.sendDeps || {};
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
    const batch = await claimPendingEmailBatch(supabase, options);
    if (!batch.length) break;

    summary.claimed += batch.length;

    for (const row of batch) {
      if (Date.now() - startedAt >= config.maxRuntimeMs) {
        summary.stoppedByRuntime = true;
        break;
      }

      if (lastSendAt > 0) {
        const waitMs = minIntervalMs - (Date.now() - lastSendAt);
        if (waitMs > 0) await sleepFn(waitMs);
      }

      const outcome = await processSingleOutboxEmail(supabase, row, {
        sendOutboxEmail,
        sendDeps,
        ...options,
      });

      if (outcome === "sent") summary.sent += 1;
      else if (outcome === "retry") summary.retried += 1;
      else if (outcome === "failed") summary.failed += 1;
      else if (outcome === "skipped") summary.skipped += 1;

      lastSendAt = Date.now();
    }

    if (summary.stoppedByRuntime) break;
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
    return { success: true, skipped: true, reason: "EMAIL_QUEUE_WORKER_DISABLED" };
  }

  const staleSummary = await releaseStaleProcessingEmails(supabase, options);
  const batchSummary = await processEmailOutboxBatch(supabase, options);
  const summary = {
    ...batchSummary,
    staleReleasedPending: staleSummary.releasedPending,
    staleMarkedFailed: staleSummary.markedFailed,
    staleFinalizedSent: staleSummary.finalizedSent,
  };

  if (!options.skipCronFinishedLog) {
    logEmailQueueEvent("EMAIL_QUEUE_CRON_FINISHED", { summary });
  }

  return { success: true, skipped: false, summary };
}

module.exports = {
  EMAIL_OUTBOX_TABLE,
  EMAIL_MESSAGES_TABLE,
  VIP_STATUS_EMAIL_MESSAGE_TYPE,
  buildProviderIdempotencyKey,
  buildOutboxResendTags,
  sanitizeResendTagValue,
  isEmailQueueWorkerEnabled,
  getEmailQueueConfig,
  extractRecipientDomain,
  logEmailQueueEvent,
  calculateRetryDelay,
  sendOutboxEmailViaResend,
  claimPendingEmailBatch,
  releaseStaleProcessingEmails,
  persistProviderIdempotencyKey,
  markEmailAccepted,
  markEmailSent,
  markEmailFailed,
  markEmailRetryScheduled,
  markEmailSkipped,
  markEmailUncertain,
  upsertEmailMessageFromOutbox,
  syncVipStatusDeliveryFromOutbox,
  syncCampaignRecipientFromOutbox,
  finalizeProviderAccepted,
  processSingleOutboxEmail,
  processEmailOutboxBatch,
  runEmailQueueCron,
};
