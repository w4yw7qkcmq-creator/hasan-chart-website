const { randomBytes } = require("node:crypto");
const { getInstanceId } = require("./price-alert-distributed-lock");

function createRunId() {
  return `par-${Date.now()}-${randomBytes(4).toString("hex")}`;
}

function buildCycleTelemetryRow({
  runId,
  startedAt,
  completedAt,
  durationMs,
  status,
  stats = {},
  lock = {},
  buildCommit = null,
  errorCodeSafe = null,
  triggerSource = null,
  deploymentId = null,
  processStartedAt = null,
}) {
  return {
    run_id: runId,
    worker_instance: getInstanceId(),
    started_at: startedAt,
    completed_at: completedAt,
    duration_ms: durationMs,
    status,
    alerts_fetched: stats.alertsFetched || 0,
    alerts_evaluated: stats.alertsEvaluated || 0,
    alerts_triggered: stats.alertsTriggered || 0,
    alerts_claimed: stats.alertsClaimed || 0,
    alerts_completed: stats.alertsCompleted || 0,
    site_sent: stats.siteSent || 0,
    push_sent: stats.pushSent || 0,
    push_failed: stats.pushFailed || 0,
    email_queued: stats.emailQueued || 0,
    email_failed: stats.emailFailed || 0,
    duplicate_claims: stats.duplicateClaims || 0,
    lock_acquired: Boolean(lock.acquired),
    lock_contended: Boolean(lock.contended),
    stale_prices: stats.stalePrices || 0,
    retries_processed: stats.retriesProcessed || 0,
    error_code_safe: errorCodeSafe,
    build_commit: buildCommit || process.env.RAILWAY_GIT_COMMIT_SHA || null,
    trigger_source: triggerSource,
    deployment_id: deploymentId || process.env.RAILWAY_DEPLOYMENT_ID || null,
    process_started_at: processStartedAt,
  };
}

async function persistCycleTelemetry(getSupabaseClient, row) {
  const client = getSupabaseClient?.();
  if (!client) {
    console.warn("PRICE_ALERT_TELEMETRY_SKIP", JSON.stringify({ reason: "supabase_unavailable" }));
    return { ok: false, reason: "supabase_unavailable" };
  }

  try {
    const { error } = await client.from("price_alert_worker_runs").insert(row);
    if (error) {
      const reason =
        /relation .* does not exist/i.test(error.message) ? "table_missing" : "insert_failed";
      console.warn(
        "PRICE_ALERT_TELEMETRY_PERSIST_FAILED",
        JSON.stringify({ reason, message: error.message })
      );
      return { ok: false, reason };
    }
    return { ok: true };
  } catch (error) {
    console.warn(
      "PRICE_ALERT_TELEMETRY_PERSIST_FAILED",
      JSON.stringify({ reason: "exception", message: error.message })
    );
    return { ok: false, reason: error.message };
  }
}

async function cleanupOldRuns(getSupabaseClient, retentionDays = 90) {
  const client = getSupabaseClient?.();
  if (!client) return { ok: false, reason: "supabase_unavailable" };
  const { data, error } = await client.rpc("cleanup_price_alert_worker_runs", {
    p_retention_days: retentionDays,
  });
  if (error) return { ok: false, reason: error.message };
  return { ok: true, ...data };
}

module.exports = {
  createRunId,
  buildCycleTelemetryRow,
  persistCycleTelemetry,
  cleanupOldRuns,
};
