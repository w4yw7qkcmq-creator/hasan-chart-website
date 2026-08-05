const crypto = require("crypto");
const { getInstanceId } = require("./news-worker-distributed-lock");

const RETENTION_DAYS = 90;
let lastPersistedRun = null;
let telemetryPersistFailures = 0;

function createRunId() {
  return `nwr-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function sanitizeErrorCode(error) {
  const value = String(error || "").trim();
  if (!value) return null;
  return value.replace(/https?:\/\/\S+/g, "[url]").slice(0, 120);
}

function buildCycleTelemetryRow({ runId, startedAt, completedAt, stats = {}, status, lock = {}, buildCommit }) {
  return {
    run_id: runId,
    worker_instance: getInstanceId(),
    started_at: startedAt,
    completed_at: completedAt,
    duration_ms: stats.cycleDurationMs ?? (completedAt && startedAt ? new Date(completedAt) - new Date(startedAt) : null),
    status,
    fetched_count: stats.fetched || 0,
    accepted_count: stats.eligible || 0,
    rejected_count:
      (stats.rejectedFilter || 0) +
      (stats.rejectedDuplicate || 0) +
      (stats.rejectedLowImpact || 0) +
      (stats.rejectedStale || 0) +
      (stats.rss?.backlogSkipped || 0),
    duplicates_count: stats.rejectedDuplicate || stats.rss?.duplicateSkipped || 0,
    site_published_count: stats.dbInserted || 0,
    telegram_published_count: stats.telegramPublished || 0,
    ai_calls: stats.aiProcessed || 0,
    image_failures: stats.imageFailures || 0,
    lock_acquired: Boolean(lock.acquired),
    lock_contended: Boolean(lock.contended),
    error_code_safe: sanitizeErrorCode(stats.lastErrorSafe),
    build_commit: buildCommit ? String(buildCommit).slice(0, 40) : null,
  };
}

async function persistCycleTelemetry(getSupabaseClient, payload) {
  const client = getSupabaseClient?.();
  if (!client) {
    telemetryPersistFailures += 1;
    console.warn("NEWS_WORKER_TELEMETRY_SKIP", JSON.stringify({ reason: "supabase_unavailable" }));
    return { persisted: false, reason: "supabase_unavailable" };
  }

  try {
    const { error } = await client.from("news_worker_cycle_runs").insert([payload]);
    if (error) {
      telemetryPersistFailures += 1;
      console.warn(
        "NEWS_WORKER_TELEMETRY_PERSIST_FAILED",
        JSON.stringify({ reason: error.message?.slice(0, 120) || "insert_failed" })
      );
      return { persisted: false, reason: error.message };
    }
    lastPersistedRun = {
      runId: payload.run_id,
      status: payload.status,
      startedAt: payload.started_at,
      completedAt: payload.completed_at,
      durationMs: payload.duration_ms,
    };
    return { persisted: true, runId: payload.run_id };
  } catch (error) {
    telemetryPersistFailures += 1;
    console.warn(
      "NEWS_WORKER_TELEMETRY_PERSIST_FAILED",
      JSON.stringify({ reason: error.message?.slice(0, 120) || "insert_exception" })
    );
    return { persisted: false, reason: error.message };
  }
}

async function maybeCleanupOldTelemetry(getSupabaseClient) {
  const client = getSupabaseClient?.();
  if (!client) return { skipped: true };
  try {
    const { data, error } = await client.rpc("cleanup_news_worker_cycle_runs", {
      p_retention_days: RETENTION_DAYS,
    });
    if (error) {
      return { cleaned: false, reason: error.message };
    }
    return { cleaned: true, ...data };
  } catch (error) {
    return { cleaned: false, reason: error.message };
  }
}

function getTelemetrySnapshot() {
  return {
    lastPersistedRun,
    telemetryPersistFailures,
    retentionDays: RETENTION_DAYS,
  };
}

function resetTelemetryForTests() {
  lastPersistedRun = null;
  telemetryPersistFailures = 0;
}

module.exports = {
  createRunId,
  buildCycleTelemetryRow,
  persistCycleTelemetry,
  maybeCleanupOldTelemetry,
  getTelemetrySnapshot,
  resetTelemetryForTests,
  RETENTION_DAYS,
};
