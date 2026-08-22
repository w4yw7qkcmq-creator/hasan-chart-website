const EMAIL_OUTBOX_TABLE = "email_outbox";

function countByStatus(rows, status) {
  return rows.filter((row) => row.status === status).length;
}

function computeOldestPendingAgeMs(rows) {
  const pending = rows.filter((row) => row.status === "pending");
  if (!pending.length) return null;

  const oldest = pending.reduce((min, row) => {
    const ts = new Date(row.scheduled_at || row.created_at).getTime();
    return ts < min ? ts : min;
  }, Infinity);

  return Date.now() - oldest;
}

function computeRecentThroughput(rows, windowMs = 60 * 60 * 1000) {
  const cutoff = Date.now() - windowMs;
  return rows.filter((row) => {
    if (row.status !== "sent" || !row.sent_at) return false;
    return new Date(row.sent_at).getTime() >= cutoff;
  }).length;
}

export async function fetchEmailOutboxMetrics(supabase, { sampleLimit = 5000 } = {}) {
  const safeLimit = Math.min(Math.max(Number(sampleLimit) || 5000, 100), 10000);

  const { data, error } = await supabase
    .from(EMAIL_OUTBOX_TABLE)
    .select(
      "id, status, attempts, max_attempts, scheduled_at, created_at, sent_at, accepted_at, claimed_at, failed_at, skipped_at, provider_submission_state, error, updated_at"
    )
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) {
    throw new Error(error.message || "Failed to load email outbox metrics");
  }

  const rows = data || [];
  const now = Date.now();
  const staleCutoffMs = 15 * 60 * 1000;

  const staleProcessing = rows.filter((row) => {
    if (row.status !== "processing" && row.status !== "accepted") return false;
    if (!row.claimed_at) return false;
    return now - new Date(row.claimed_at).getTime() >= staleCutoffMs;
  }).length;

  const retryPending = rows.filter((row) => {
    if (row.status !== "pending") return false;
    return Number(row.attempts) > 0;
  }).length;

  const recentFailures = rows
    .filter((row) => row.status === "failed")
    .slice(0, 20)
    .map((row) => ({
      id: row.id,
      error: row.error || null,
      failedAt: row.failed_at || null,
      attempts: row.attempts,
    }));

  return {
    counts: {
      pending: countByStatus(rows, "pending"),
      processing: countByStatus(rows, "processing"),
      accepted: countByStatus(rows, "accepted"),
      sent: countByStatus(rows, "sent"),
      failed: countByStatus(rows, "failed"),
      skipped: countByStatus(rows, "skipped"),
      retryPending,
      staleProcessing,
      uncertain: rows.filter((row) => row.provider_submission_state === "uncertain").length,
    },
    oldestPendingAgeMs: computeOldestPendingAgeMs(rows),
    throughputLastHour: computeRecentThroughput(rows),
    recentFailures,
    sampleSize: rows.length,
    sampledAt: new Date().toISOString(),
  };
}

export async function fetchOutboxRowDeliveryStatus(supabase, outboxId) {
  const { data: outbox, error: outboxError } = await supabase
    .from(EMAIL_OUTBOX_TABLE)
    .select("id, status, resend_id, recipient_email, subject, message_type, sent_at, accepted_at, error")
    .eq("id", outboxId)
    .maybeSingle();

  if (outboxError) {
    throw new Error(outboxError.message || "Failed to load outbox row");
  }

  if (!outbox) {
    return null;
  }

  let message = null;
  if (outbox.resend_id) {
    const { data } = await supabase
      .from("email_messages")
      .select("id, status, delivered_at, bounced_at, complained_at, failed_at, outbox_id, resend_id")
      .eq("resend_id", outbox.resend_id)
      .maybeSingle();
    message = data || null;
  }

  if (!message) {
    const { data } = await supabase
      .from("email_messages")
      .select("id, status, delivered_at, bounced_at, complained_at, failed_at, outbox_id, resend_id")
      .eq("outbox_id", outboxId)
      .maybeSingle();
    message = data || null;
  }

  return {
    outbox,
    analytics: message,
    operationalStatus: outbox.status,
    deliveryStatus: message?.status || null,
  };
}
