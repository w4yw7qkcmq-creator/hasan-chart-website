const { getInstanceId } = require("./price-alert-distributed-lock");

const DEFAULT_CLAIM_TTL_SECONDS = 120;
const DEFAULT_MAX_ATTEMPTS = 3;
const RESULT_VERSION = "2.0";
const MAX_RESULT_BYTES = 512_000;

const recoveryMetrics = {
  jobsRecoveredAfterRestart: 0,
  staleClaimsRecovered: 0,
  duplicateClaimsRejected: 0,
  wrongOwnerRejected: 0,
};

function getRecoveryMetrics() {
  return { ...recoveryMetrics };
}

function resetRecoveryMetricsForTests() {
  for (const key of Object.keys(recoveryMetrics)) {
    recoveryMetrics[key] = 0;
  }
}

function truncateResult(result) {
  const serialized = JSON.stringify(result ?? {});
  if (Buffer.byteLength(serialized, "utf8") <= MAX_RESULT_BYTES) {
    return result;
  }
  return {
    truncated: true,
    version: RESULT_VERSION,
    error: "RESULT_TOO_LARGE",
  };
}

async function createJob(supabase, { jobId, symbol, executionTimeframe, requestId = null }) {
  const { data, error } = await supabase.rpc("create_instant_analysis_job", {
    p_job_id: jobId,
    p_symbol: symbol,
    p_execution_timeframe: executionTimeframe || null,
    p_request_id: requestId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: Boolean(data?.ok), ...data };
}

async function claimJob(supabase, jobId, ownerId = getInstanceId()) {
  const { data, error } = await supabase.rpc("claim_instant_analysis_job", {
    p_job_id: jobId,
    p_owner_id: ownerId,
    p_claim_ttl_seconds: DEFAULT_CLAIM_TTL_SECONDS,
  });
  if (error) return { claimed: false, reason: error.message };
  if (!data?.claimed && data?.reason === "contended") {
    recoveryMetrics.duplicateClaimsRejected += 1;
  }
  return { claimed: Boolean(data?.claimed), ...data };
}

async function extendClaim(supabase, jobId, ownerId = getInstanceId()) {
  const { data, error } = await supabase.rpc("extend_instant_analysis_job_claim", {
    p_job_id: jobId,
    p_owner_id: ownerId,
    p_claim_ttl_seconds: DEFAULT_CLAIM_TTL_SECONDS,
  });
  if (error) return { extended: false, reason: error.message };
  return { extended: Boolean(data?.extended) };
}

async function completeJob(supabase, jobId, ownerId, result) {
  const safeResult = truncateResult(result);
  const { data, error } = await supabase.rpc("complete_instant_analysis_job", {
    p_job_id: jobId,
    p_owner_id: ownerId,
    p_result: safeResult,
    p_result_version: RESULT_VERSION,
  });
  if (error) return { ok: false, error: error.message };
  if (!data?.ok) {
    recoveryMetrics.wrongOwnerRejected += 1;
  }
  return { ok: Boolean(data?.ok), ...data };
}

async function failJob(supabase, jobId, ownerId, errorCode, { terminal = false } = {}) {
  const { data, error } = await supabase.rpc("fail_instant_analysis_job", {
    p_job_id: jobId,
    p_owner_id: ownerId,
    p_error_code: errorCode,
    p_terminal: terminal,
  });
  if (error) return { ok: false, error: error.message };
  if (!data?.ok) {
    recoveryMetrics.wrongOwnerRejected += 1;
  }
  return { ok: Boolean(data?.ok), ...data };
}

async function getJob(supabase, jobId) {
  const { data, error } = await supabase.rpc("get_instant_analysis_job", {
    p_job_id: jobId,
  });
  if (error) return { found: false, error: error.message };
  return data || { found: false };
}

async function recoverStaleJobs(supabase) {
  const { data, error } = await supabase.rpc("recover_stale_instant_analysis_jobs", {
    p_claim_ttl_seconds: DEFAULT_CLAIM_TTL_SECONDS,
  });
  if (error) return { ok: false, error: error.message };
  recoveryMetrics.staleClaimsRecovered += Number(data?.requeued || 0) + Number(data?.timed_out || 0);
  recoveryMetrics.jobsRecoveredAfterRestart += Number(data?.requeued || 0);
  return { ok: true, ...data };
}

async function persistWorkerRun(supabase, row) {
  const { error } = await supabase.from("instant_analysis_worker_runs").insert(row);
  if (error) {
    console.warn(
      "INSTANT_ANALYSIS_TELEMETRY_PERSIST_FAILED",
      JSON.stringify({ reason: error.message?.slice(0, 120) })
    );
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

async function promoteReservation(supabase, requestId, jobId) {
  if (!requestId) return { ok: true, skipped: true };
  const { data, error } = await supabase.rpc("promote_instant_analysis_reservation", {
    p_request_id: requestId,
    p_job_id: jobId,
  });
  if (error) return { ok: false, code: error.message };
  return { ok: Boolean(data?.ok), ...data };
}

function jobRowToStatusPayload(job) {
  if (!job?.found) return null;
  const status = job.status;
  const payload = {
    id: job.job_id,
    status: status === "claimed" ? "processing" : status,
    symbol: job.symbol,
  };
  if (status === "completed" && job.analysis_result) {
    payload.result = job.analysis_result;
    payload.completedAt = job.completed_at;
  }
  if (status === "failed" || status === "timed_out") {
    payload.error = job.error_code_safe || "ANALYSIS_FAILED";
    payload.failedAt = job.failed_at || job.completed_at;
  }
  if (status === "queued" || status === "claimed" || status === "processing") {
    payload.createdAt = job.created_at;
  }
  return payload;
}

module.exports = {
  DEFAULT_CLAIM_TTL_SECONDS,
  DEFAULT_MAX_ATTEMPTS,
  RESULT_VERSION,
  getRecoveryMetrics,
  resetRecoveryMetricsForTests,
  createJob,
  claimJob,
  extendClaim,
  completeJob,
  failJob,
  getJob,
  recoverStaleJobs,
  persistWorkerRun,
  promoteReservation,
  jobRowToStatusPayload,
};
