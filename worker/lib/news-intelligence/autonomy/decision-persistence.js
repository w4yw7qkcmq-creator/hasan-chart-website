const { logAutonomyEvent } = require("./structured-log");
const { drainPendingDecisions } = require("./decision-record");
const { flushIncidents } = require("./incident-persistence");
const { flushSourceHealthStates } = require("./source-health-persistence");
const { flushWorkerTelemetrySnapshot } = require("./worker-telemetry-persistence");

async function flushDecisionRecords(supabase, limit = 100) {
  if (!supabase) return { flushed: 0, skipped: true };
  const batch = drainPendingDecisions(limit);
  if (!batch.length) return { flushed: 0 };

  const rows = batch.map((record) => ({
    correlation_id: record.correlationId,
    candidate_id: record.candidateId,
    event_key: record.eventKey,
    event_type: record.eventType,
    event_family: record.eventFamily,
    source_type: record.sourceType,
    source_id: record.sourceId,
    source_ref_hash: record.sourceRefHash,
    received_at: record.receivedAt,
    normalized_at: record.normalizedAt,
    decision_at: record.decisionAt,
    decision: record.decision,
    reason_code: record.reasonCode,
    importance: record.importance,
    confidence: record.confidence || {},
    duplicate_status: record.duplicateStatus,
    quality_status: record.qualityStatus,
    image_status: record.imageStatus,
    ai_used: record.aiUsed,
    aggregation_state: record.aggregationState,
    publication_id: record.publicationId,
    delivery_result: record.deliveryResult,
    latency: record.latency,
    metadata: record.metadata || {},
  }));

  try {
    const { error } = await supabase.from("news_decision_records").insert(rows);
    if (error) throw error;
    return { flushed: rows.length };
  } catch (error) {
    logAutonomyEvent("NEWS_DECISION_FLUSH_FAILED", { error: error.message, batchSize: rows.length });
    return { flushed: 0, error: error.message, nonBlocking: true };
  }
}

async function flushObservability(supabase) {
  const [decisions, incidents, sourceHealth, telemetry] = await Promise.all([
    flushDecisionRecords(supabase),
    flushIncidents(supabase),
    flushSourceHealthStates(supabase),
    flushWorkerTelemetrySnapshot(supabase),
  ]);
  return { decisions, incidents, sourceHealth, telemetry, nonBlocking: true };
}

module.exports = {
  flushDecisionRecords,
  flushObservability,
};
