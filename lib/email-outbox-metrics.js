const EMAIL_OUTBOX_TABLE = "email_outbox";
const STALE_PROCESSING_MS = 15 * 60 * 1000;

async function countWhere(supabase, apply) {
  let query = supabase.from(EMAIL_OUTBOX_TABLE).select("id", { count: "exact", head: true });
  query = apply(query);
  const { count, error } = await query;
  if (error) throw new Error(error.message || "Failed to count email outbox rows");
  return count || 0;
}

function formatDurationMs(ms) {
  if (ms == null || ms < 0) return "—";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec} ثانية`;
  if (sec < 3600) return `${Math.floor(sec / 60)} دقيقة`;
  return `${Math.floor(sec / 3600)} ساعة`;
}

export async function fetchEmailOutboxMetrics(supabase, { sampleLimit = 5000 } = {}) {
  void sampleLimit;
  const now = Date.now();
  const staleCutoffIso = new Date(now - STALE_PROCESSING_MS).toISOString();
  const throughputCutoffIso = new Date(now - 60 * 60 * 1000).toISOString();

  const [
    pending,
    processing,
    accepted,
    sent,
    failed,
    skipped,
    uncertain,
    retryPending,
    staleProcessing,
    throughputLastHour,
    totalSample,
    oldestPendingRow,
    recentFailureRows,
  ] = await Promise.all([
    countWhere(supabase, (q) => q.eq("status", "pending")),
    countWhere(supabase, (q) => q.eq("status", "processing")),
    countWhere(supabase, (q) => q.eq("status", "accepted")),
    countWhere(supabase, (q) => q.eq("status", "sent")),
    countWhere(supabase, (q) => q.eq("status", "failed")),
    countWhere(supabase, (q) => q.eq("status", "skipped")),
    countWhere(supabase, (q) => q.eq("provider_submission_state", "uncertain")),
    countWhere(supabase, (q) => q.eq("status", "pending").gt("attempts", 0)),
    countWhere(supabase, (q) =>
      q.in("status", ["processing", "accepted"]).lt("claimed_at", staleCutoffIso)
    ),
    countWhere(supabase, (q) => q.eq("status", "sent").gte("sent_at", throughputCutoffIso)),
    countWhere(supabase, (q) => q),
    supabase
      .from(EMAIL_OUTBOX_TABLE)
      .select("scheduled_at, created_at")
      .eq("status", "pending")
      .order("scheduled_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from(EMAIL_OUTBOX_TABLE)
      .select("id, error, failed_at, attempts")
      .eq("status", "failed")
      .order("failed_at", { ascending: false, nullsFirst: false })
      .limit(20),
  ]);

  if (oldestPendingRow.error) {
    throw new Error(oldestPendingRow.error.message || "Failed to load oldest pending row");
  }
  if (recentFailureRows.error) {
    throw new Error(recentFailureRows.error.message || "Failed to load recent failures");
  }

  let oldestPendingAgeMs = null;
  if (oldestPendingRow.data) {
    const ts = new Date(
      oldestPendingRow.data.scheduled_at || oldestPendingRow.data.created_at
    ).getTime();
    if (Number.isFinite(ts)) oldestPendingAgeMs = now - ts;
  }

  const recentFailures = (recentFailureRows.data || []).map((row) => ({
    id: row.id,
    error: row.error || null,
    failedAt: row.failed_at || null,
    attempts: row.attempts,
  }));

  return {
    counts: {
      pending,
      processing,
      accepted,
      sent,
      failed,
      skipped,
      retryPending,
      staleProcessing,
      uncertain,
    },
    oldestPendingAgeMs,
    throughputLastHour,
    recentFailures,
    sampleSize: totalSample,
    sampledAt: new Date().toISOString(),
  };
}

export { formatDurationMs };

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
