const { normalizeReasonCode, DECISION_OUTCOMES, mapBlockedToOutcome } = require("./reason-taxonomy");
const { logAutonomyEvent, hashSourceRef } = require("./structured-log");
const { getMetricsAggregator } = require("./metrics-aggregator");

const MAX_IN_MEMORY = 5000;
const pendingFlush = [];
let memoryRecords = [];

function buildDecisionRecord(input = {}) {
  const reasonCode = normalizeReasonCode(input.reasonCode || input.reason);
  const decision =
    input.decision ||
    (reasonCode === "PUBLISHED" ? DECISION_OUTCOMES.PUBLISHED : mapBlockedToOutcome(reasonCode));

  return {
    correlationId: input.correlationId,
    candidateId: input.candidateId || null,
    eventKey: input.eventKey || null,
    eventType: input.eventType || null,
    eventFamily: input.eventFamily || null,
    sourceType: input.sourceType || null,
    sourceId: input.sourceId || null,
    sourceRefHash: hashSourceRef(input.sourceMessageId || input.sourceLink || input.sourceRef),
    receivedAt: input.receivedAt || null,
    normalizedAt: input.normalizedAt || null,
    decisionAt: input.decisionAt || new Date().toISOString(),
    decision,
    reasonCode,
    importance: input.importance || null,
    confidence: input.confidence || {},
    duplicateStatus: input.duplicateStatus || null,
    qualityStatus: input.qualityStatus || null,
    imageStatus: input.imageStatus || null,
    aiUsed: input.aiUsed === true,
    aggregationState: input.aggregationState || null,
    publicationId: input.publicationId || null,
    deliveryResult: input.deliveryResult || null,
    latency: input.latency || null,
    metadata: input.metadata || {},
  };
}

function recordDecision(input = {}, options = {}) {
  const record = buildDecisionRecord(input);
  if (!record.correlationId || !record.reasonCode) {
    return null;
  }

  memoryRecords.push(record);
  if (memoryRecords.length > MAX_IN_MEMORY) {
    memoryRecords = memoryRecords.slice(-MAX_IN_MEMORY);
  }

  pendingFlush.push(record);
  getMetricsAggregator().recordDecision(record);

  logAutonomyEvent("NEWS_DECISION_RECORDED", {
    correlationId: record.correlationId,
    eventKey: record.eventKey,
    sourceId: record.sourceId,
    reasonCode: record.reasonCode,
    decision: record.decision,
    latencyMs: record.latency?.totalMs || null,
    severity: record.decision === DECISION_OUTCOMES.PUBLISHED ? "INFO" : "WARNING",
  });

  if (typeof options.onRecord === "function") {
    options.onRecord(record);
  }

  return record;
}

function drainPendingDecisions(limit = 100) {
  if (!pendingFlush.length) return [];
  const batch = pendingFlush.splice(0, limit);
  return batch;
}

function getRecentDecisions(filter = {}) {
  return memoryRecords.filter((record) => {
    if (filter.eventKey && record.eventKey !== filter.eventKey) return false;
    if (filter.sourceId && record.sourceId !== filter.sourceId) return false;
    if (filter.reasonCode && record.reasonCode !== filter.reasonCode) return false;
    return true;
  });
}

function resetDecisionRecordsForTests() {
  memoryRecords = [];
  pendingFlush.length = 0;
}

module.exports = {
  buildDecisionRecord,
  recordDecision,
  drainPendingDecisions,
  getRecentDecisions,
  resetDecisionRecordsForTests,
};
