const { computeNextAttemptAt, DEFAULT_MAX_ATTEMPTS } = require("./price-alert-retry-processor");

const CHANNELS = Object.freeze(["site", "push", "email"]);

function buildIdempotencyKey(alertId, channel) {
  return `price_alert:${String(alertId).trim()}:${channel}`;
}

function normalizeAlertId(alertId) {
  const normalized = String(alertId || "").trim();
  return /^\d+$/.test(normalized) ? Number(normalized) : null;
}

async function getDeliveryAttempt(supabase, alertId, channel) {
  const numericId = normalizeAlertId(alertId);
  if (!numericId) return { data: null, error: null };

  const { data, error } = await supabase
    .from("price_alert_delivery_attempts")
    .select("id, alert_id, channel, status, attempt_count, sent_at, idempotency_key")
    .eq("alert_id", numericId)
    .eq("channel", channel)
    .maybeSingle();

  return { data, error };
}

async function beginChannelDelivery(supabase, { alertId, channel }) {
  const numericId = normalizeAlertId(alertId);
  if (!numericId || !CHANNELS.includes(channel)) {
    return { proceed: false, reason: "invalid_args", skipped: true };
  }

  const existing = await getDeliveryAttempt(supabase, numericId, channel);
  if (existing.error) {
    return { proceed: false, reason: existing.error.message, error: existing.error };
  }

  if (existing.data?.status === "sent") {
    return {
      proceed: false,
      skipped: true,
      reason: "already_sent",
      attempt: existing.data,
      idempotencyKey: existing.data.idempotency_key,
    };
  }

  const idempotencyKey = buildIdempotencyKey(numericId, channel);
  const now = new Date().toISOString();

  if (existing.data?.id) {
    const { data, error } = await supabase
      .from("price_alert_delivery_attempts")
      .update({
        status: "pending",
        attempt_count: (existing.data.attempt_count || 0) + 1,
        updated_at: now,
      })
      .eq("id", existing.data.id)
      .neq("status", "sent")
      .select("id, alert_id, channel, status, attempt_count, idempotency_key")
      .maybeSingle();

    if (error) return { proceed: false, reason: error.message, error };
    if (!data) {
      return {
        proceed: false,
        skipped: true,
        reason: "already_sent",
        idempotencyKey,
      };
    }
    return { proceed: true, attempt: data, idempotencyKey, resumed: true };
  }

  const { data, error } = await supabase
    .from("price_alert_delivery_attempts")
    .insert({
      alert_id: numericId,
      channel,
      idempotency_key: idempotencyKey,
      status: "pending",
      attempt_count: 1,
      updated_at: now,
    })
    .select("id, alert_id, channel, status, attempt_count, idempotency_key")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      const retry = await getDeliveryAttempt(supabase, numericId, channel);
      if (retry.data?.status === "sent") {
        return { proceed: false, skipped: true, reason: "already_sent", attempt: retry.data, idempotencyKey };
      }
      return beginChannelDelivery(supabase, { alertId: numericId, channel });
    }
    return { proceed: false, reason: error.message, error };
  }

  return { proceed: true, attempt: data, idempotencyKey, resumed: false };
}

async function finalizeChannelDelivery(
  supabase,
  { alertId, channel, status, errorCodeSafe = null, providerMessageId = null, attemptCount = null, maxAttempts = DEFAULT_MAX_ATTEMPTS }
) {
  const numericId = normalizeAlertId(alertId);
  if (!numericId) return { ok: false, reason: "invalid_alert_id" };

  const now = new Date().toISOString();
  const payload = {
    status,
    last_error_code_safe: errorCodeSafe,
    provider_message_id: providerMessageId,
    updated_at: now,
    claimed_by: null,
    claimed_at: null,
    ...(status === "sent"
      ? { sent_at: now, terminal_at: now, next_attempt_at: null }
      : {}),
    ...(status === "failed"
      ? {
          status: "retryable_failed",
          next_attempt_at: computeNextAttemptAt(attemptCount || 1),
          max_attempts: maxAttempts,
        }
      : {}),
    ...(status === "skipped" ? { terminal_at: now, next_attempt_at: null } : {}),
  };

  const { data, error } = await supabase
    .from("price_alert_delivery_attempts")
    .update(payload)
    .eq("alert_id", numericId)
    .eq("channel", channel)
    .select("id, status, sent_at, next_attempt_at")
    .maybeSingle();

  if (error) return { ok: false, reason: error.message, error };
  return { ok: true, attempt: data };
}

module.exports = {
  CHANNELS,
  buildIdempotencyKey,
  beginChannelDelivery,
  finalizeChannelDelivery,
  getDeliveryAttempt,
};
