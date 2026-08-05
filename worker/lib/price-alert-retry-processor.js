const { getInstanceId } = require("./price-alert-distributed-lock");

const DEFAULT_MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 15_000;
const MAX_BACKOFF_MS = 300_000;

function computeNextAttemptAt(attemptCount) {
  const exponent = Math.max(0, (attemptCount || 1) - 1);
  const delayMs = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** exponent);
  return new Date(Date.now() + delayMs).toISOString();
}

async function listRetryableAttempts(supabase, limit = 20) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("price_alert_delivery_attempts")
    .select(
      "id, alert_id, channel, status, attempt_count, max_attempts, next_attempt_at, idempotency_key, last_error_code_safe"
    )
    .in("status", ["failed", "retryable_failed"])
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`)
    .order("next_attempt_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) return { attempts: [], error };
  return { attempts: data || [], error: null };
}

async function claimDeliveryAttempt(supabase, attemptId, ownerId = getInstanceId()) {
  const { data, error } = await supabase.rpc("claim_price_alert_delivery_attempt", {
    p_attempt_id: attemptId,
    p_owner_id: ownerId,
    p_claim_ttl_seconds: 120,
  });
  if (error) return { claimed: false, reason: error.message, error };
  return { claimed: Boolean(data?.claimed), ...data };
}

async function releaseDeliveryAttemptClaim(supabase, attemptId, ownerId = getInstanceId()) {
  const { data, error } = await supabase.rpc("release_price_alert_delivery_attempt_claim", {
    p_attempt_id: attemptId,
    p_owner_id: ownerId,
  });
  if (error) return { released: false, reason: error.message };
  return { released: Boolean(data?.released) };
}

async function markAttemptRetryScheduled(
  supabase,
  { attemptId, attemptCount, maxAttempts, errorCodeSafe }
) {
  const exhausted = attemptCount >= maxAttempts;
  const payload = {
    status: exhausted ? "terminal_failed" : "retryable_failed",
    attempt_count: attemptCount,
    last_error_code_safe: errorCodeSafe || null,
    next_attempt_at: exhausted ? null : computeNextAttemptAt(attemptCount),
    terminal_at: exhausted ? new Date().toISOString() : null,
    claimed_by: null,
    claimed_at: null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("price_alert_delivery_attempts")
    .update(payload)
    .eq("id", attemptId);

  return { ok: !error, error, exhausted };
}

async function markAttemptSent(supabase, attemptId, providerMessageId = null) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("price_alert_delivery_attempts")
    .update({
      status: "sent",
      sent_at: now,
      terminal_at: now,
      next_attempt_at: null,
      claimed_by: null,
      claimed_at: null,
      provider_message_id: providerMessageId,
      updated_at: now,
    })
    .eq("id", attemptId);

  return { ok: !error, error };
}

async function processRetryableDeliveries(supabase, { deliverChannel, limit = 10 } = {}) {
  const ownerId = getInstanceId();
  const stats = {
    scanned: 0,
    claimed: 0,
    retried: 0,
    succeeded: 0,
    rescheduled: 0,
    terminal: 0,
    contended: 0,
  };

  const { attempts, error } = await listRetryableAttempts(supabase, limit);
  if (error) {
    return { ok: false, reason: error.message, stats };
  }

  stats.scanned = attempts.length;

  for (const attempt of attempts) {
    const maxAttempts = attempt.max_attempts || DEFAULT_MAX_ATTEMPTS;
    if ((attempt.attempt_count || 0) >= maxAttempts) {
      await markAttemptRetryScheduled(supabase, {
        attemptId: attempt.id,
        attemptCount: attempt.attempt_count || maxAttempts,
        maxAttempts,
        errorCodeSafe: "max_attempts_exceeded",
      });
      stats.terminal += 1;
      continue;
    }

    const claim = await claimDeliveryAttempt(supabase, attempt.id, ownerId);
    if (!claim.claimed) {
      if (claim.reason === "contended") stats.contended += 1;
      continue;
    }
    stats.claimed += 1;

    try {
      const result = await deliverChannel({
        alertId: attempt.alert_id,
        channel: attempt.channel,
        attemptId: attempt.id,
      });

      if (result?.sent) {
        await markAttemptSent(supabase, attempt.id, result.providerMessageId || null);
        stats.succeeded += 1;
      } else if (result?.skipped && result?.reason === "already_sent") {
        await markAttemptSent(supabase, attempt.id, null);
        stats.succeeded += 1;
      } else {
        const nextCount = (attempt.attempt_count || 0) + 1;
        const scheduled = await markAttemptRetryScheduled(supabase, {
          attemptId: attempt.id,
          attemptCount: nextCount,
          maxAttempts,
          errorCodeSafe: result?.errorCodeSafe || result?.reason || "retry_failed",
        });
        stats.rescheduled += 1;
        if (scheduled.exhausted) stats.terminal += 1;
      }
      stats.retried += 1;
    } catch (err) {
      const nextCount = (attempt.attempt_count || 0) + 1;
      await markAttemptRetryScheduled(supabase, {
        attemptId: attempt.id,
        attemptCount: nextCount,
        maxAttempts,
        errorCodeSafe: err?.message || "retry_exception",
      });
      stats.rescheduled += 1;
    } finally {
      await releaseDeliveryAttemptClaim(supabase, attempt.id, ownerId);
    }
  }

  return { ok: true, stats };
}

module.exports = {
  DEFAULT_MAX_ATTEMPTS,
  computeNextAttemptAt,
  listRetryableAttempts,
  claimDeliveryAttempt,
  releaseDeliveryAttemptClaim,
  markAttemptRetryScheduled,
  markAttemptSent,
  processRetryableDeliveries,
};
