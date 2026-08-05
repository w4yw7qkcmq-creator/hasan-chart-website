const crypto = require("crypto");
const {
  claimJob,
  completeJob,
  extendClaim,
  failJob,
  getJob,
  persistWorkerRun,
  promoteReservation,
  RESULT_VERSION,
  DEFAULT_MAX_ATTEMPTS,
} = require("./instant-analysis-job-store");

const RETRYABLE_ERRORS = new Set([
  "OKX_TIMEOUT",
  "OPENAI_TIMEOUT",
  "MARKET_FETCH_FAILED",
  "FETCH_TIMEOUT",
  "ECONNRESET",
  "ETIMEDOUT",
]);

const TERMINAL_ERRORS = new Set([
  "INSUFFICIENT_MARKET_DATA",
  "INVALID_CURRENT_PRICE",
  "STALE_CANDLES",
  "MALFORMED_CANDLES",
  "INVALID_AI_JSON",
  "INVALID_AI_SCHEMA",
  "BUDGET_EXCEEDED",
  "SYMBOL_INVALID",
  "INVALID_TIMEFRAME",
]);

function mapAnalysisErrorCode(error) {
  const raw = String(error?.code || error?.message || error || "ANALYSIS_FAILED")
    .trim()
    .slice(0, 120)
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, "_");

  if (raw.includes("TIMEOUT") && raw.includes("OPENAI")) return "OPENAI_TIMEOUT";
  if (raw.includes("TIMEOUT") && (raw.includes("OKX") || raw.includes("MARKET"))) return "OKX_TIMEOUT";
  if (raw.includes("INSUFFICIENT")) return "INSUFFICIENT_MARKET_DATA";
  if (raw.includes("STALE")) return "STALE_CANDLES";
  if (raw.includes("MALFORMED")) return "MALFORMED_CANDLES";
  if (raw.includes("INVALID_AI")) return "INVALID_AI_JSON";
  if (raw.includes("BUDGET")) return "BUDGET_EXCEEDED";
  if (raw.includes("INVALID_CURRENT_PRICE")) return "INVALID_CURRENT_PRICE";

  return raw || "ANALYSIS_FAILED";
}

function isTerminalFailure(code, attemptCount, maxAttempts = DEFAULT_MAX_ATTEMPTS) {
  if (TERMINAL_ERRORS.has(code)) return true;
  if (attemptCount >= maxAttempts) return true;
  return !RETRYABLE_ERRORS.has(code);
}

async function waitForReservationPromotion(supabase, requestId, jobId, maxMs = 20_000) {
  if (!requestId) return true;
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    const promoted = await promoteReservation(supabase, requestId, jobId);
    if (promoted.ok) return true;
    if (promoted.code === "REQUEST_NOT_FOUND") {
      await new Promise((resolve) => setTimeout(resolve, 250));
      continue;
    }
    return false;
  }
  return false;
}

async function processInstantAnalysisJob({
  supabase,
  jobId,
  symbol,
  executionTimeframe,
  requestId = null,
  ownerId,
  openaiApiKey,
  fetchCandles,
  fetchPrice,
  authMode = "machine",
  deploymentId = null,
  buildCommit = null,
  markJobCompleted,
  markJobFailed,
}) {
  const receivedAt = new Date().toISOString();
  let claimedAt = null;
  let startedAt = null;
  let candlesCount = 0;
  let aiCalls = 0;
  let terminalStatus = "failed";
  let errorCodeSafe = null;
  const jobStartedAt = Date.now();

  try {
    if (!(await waitForReservationPromotion(supabase, requestId, jobId))) {
      errorCodeSafe = "RESERVATION_NOT_CONFIRMED";
      terminalStatus = "failed";
      return;
    }

    const claim = await claimJob(supabase, jobId, ownerId);
    if (!claim.claimed) {
      errorCodeSafe = claim.reason || "NOT_CLAIMED";
      return;
    }
    claimedAt = new Date().toISOString();

    await extendClaim(supabase, jobId, ownerId);
    startedAt = new Date().toISOString();

    const { runInstantAnalysisV2 } = require("./instant-analysis-v2/pipeline");
    const { normalizeV2ToV1Legacy } = require("./instant-analysis-v2/normalize-v1");

    const v2Result = await runInstantAnalysisV2({
      symbol,
      analysisId: jobId,
      fetchCandles,
      fetchPrice,
      openaiApiKey,
      executionTimeframe,
    });

    candlesCount = Number(v2Result?.meta?.candlesCount || v2Result?.candles?.length || 0);
    aiCalls = Number(v2Result?.meta?.aiCalls || 1);

    const analysis = normalizeV2ToV1Legacy(v2Result);
    const completed = await completeJob(supabase, jobId, ownerId, analysis);
    if (!completed.ok) {
      errorCodeSafe = completed.code || "COMPLETE_REJECTED";
      return;
    }

    terminalStatus = "completed";
    if (typeof markJobCompleted === "function") {
      markJobCompleted(Date.now() - jobStartedAt);
    }
  } catch (error) {
    errorCodeSafe = mapAnalysisErrorCode(error);
    const jobRow = await getJob(supabase, jobId);
    const attemptCount = Number(jobRow?.attempt_count || 1);
    const terminal = isTerminalFailure(errorCodeSafe, attemptCount);
    terminalStatus = terminal ? "failed" : "queued";

    await failJob(supabase, jobId, ownerId, errorCodeSafe, { terminal });
    if (typeof markJobFailed === "function") {
      markJobFailed(errorCodeSafe);
    }
  } finally {
    const completedAt = new Date().toISOString();
    await persistWorkerRun(supabase, {
      run_id: crypto.randomUUID(),
      job_id: jobId,
      worker_instance: ownerId,
      deployment_id: deploymentId,
      received_at: receivedAt,
      claimed_at: claimedAt,
      started_at: startedAt,
      completed_at: completedAt,
      duration_ms: Date.now() - jobStartedAt,
      status: terminalStatus,
      auth_mode: authMode,
      candles_count: candlesCount,
      market_provider: "okx",
      ai_calls: aiCalls,
      result_version: terminalStatus === "completed" ? RESULT_VERSION : null,
      error_code_safe: errorCodeSafe,
      build_commit: buildCommit,
    });
  }
}

module.exports = {
  mapAnalysisErrorCode,
  isTerminalFailure,
  processInstantAnalysisJob,
  waitForReservationPromotion,
};
