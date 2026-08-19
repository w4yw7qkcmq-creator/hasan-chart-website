const { createCorrelationId } = require("./structured-log");
const { recordDecision } = require("./decision-record");
const { normalizeReasonCode, REASON_CODES } = require("./reason-taxonomy");
const { classifyBlockReason, FAILURE_ATTRIBUTION } = require("./failure-attribution");
const { getMetricsAggregator } = require("./metrics-aggregator");
const { getSourceHealthEngine } = require("./source-health");
const { computeConfidence, evaluateConfidencePolicy } = require("./confidence-engine");
const { observeAnomaly, observeSilentFailure } = require("./anomaly-detector");
const { openOrUpdateIncident, INCIDENT_TYPES, SEVERITY } = require("./incident-engine");
const { auditPublishedRecord } = require("./post-publish-auditor");
const { reconcileDelivery } = require("./delivery-reconciliation");
const { updateHeartbeat, getHeartbeat } = require("./heartbeat");
const { getCircuitBreakerRegistry } = require("./circuit-breaker");
const { flushObservability } = require("./decision-persistence");
const {
  isPhase3AutonomyEnabled,
  isPhase3AutoQuarantineEnabled,
  isPhase3DiagnosticsOnly,
} = require("./feature-flags");
const { SLO_THRESHOLDS_MS, ANOMALY_THRESHOLDS } = require("./config");

let lastTelegramPollAt = null;
let lastTelegramPollSuccessAt = null;
let lastRssPollAt = null;
let lastRssPollSuccessAt = null;
const pipelineStallWindow = [];

function isEnabled(options = {}) {
  return isPhase3AutonomyEnabled(options) || isPhase3DiagnosticsOnly(options) || options.forcePhase3Diagnostics === true;
}

function ensureCorrelationId(input = {}) {
  return input.correlationId || createCorrelationId();
}

function observeCandidateReceived(publication = {}, options = {}) {
  if (!isEnabled(options)) return null;
  const correlationId = ensureCorrelationId(publication);
  getMetricsAggregator().recordNormalized(publication.eventType);
  getSourceHealthEngine().recordSample(
    {
      messagesReceived: 1,
      economicCandidates: publication.publicationType === "RELEASE" ? 1 : 0,
      attribution: FAILURE_ATTRIBUTION.EXPECTED_NO_DATA,
    },
    publication.sourceType,
    publication.sourceId
  );
  return correlationId;
}

function observeEvaluationBlocked(publication = {}, evaluation = {}, options = {}) {
  if (!isEnabled(options)) return null;
  const correlationId = ensureCorrelationId(publication);
  const reasonCode = normalizeReasonCode(evaluation.reason);
  const confidence = computeConfidence(options.confidence || {});
  const attribution = classifyBlockReason(reasonCode, evaluation.stage);

  const healthSample = {
    duplicateBlocks: reasonCode === REASON_CODES.DUPLICATE_BLOCKED ? 1 : 0,
    copyBlocks: reasonCode === REASON_CODES.SOURCE_COPY_SIMILARITY_TOO_HIGH ? 1 : 0,
    attribution,
  };

  if (attribution === FAILURE_ATTRIBUTION.SOURCE_CAUSED) {
    if (evaluation.stage === "fact_integrity" || evaluation.stage === "copy_similarity") {
      healthSample.invalidStructure = 1;
    } else {
      healthSample.parseFailure = 1;
    }
  } else {
    healthSample.parseFailure = 0;
  }

  getSourceHealthEngine().recordSample(healthSample, publication.sourceType, publication.sourceId);

  recordDecision({
    correlationId,
    candidateId: publication.metadata?.candidateId,
    eventKey: evaluation.eventKey || publication.eventKey,
    eventType: publication.eventType,
    eventFamily: publication.eventFamily,
    sourceType: publication.sourceType,
    sourceId: publication.sourceId,
    sourceMessageId: publication.metadata?.rawMessageId,
    sourceLink: publication.sourceLink,
    receivedAt: publication.receivedAt,
    reasonCode,
    confidence,
    duplicateStatus: reasonCode === REASON_CODES.DUPLICATE_BLOCKED ? "blocked" : null,
    qualityStatus: evaluation.stage === "editorial" ? "blocked" : null,
    metadata: { stage: evaluation.stage, attribution },
    latency: options.latency,
  });

  observeAnomaly({ reasonCode, sourceId: publication.sourceId, eventType: publication.eventType });
  return correlationId;
}

function checkSourceQuarantine(publication = {}, options = {}) {
  if (!isPhase3AutoQuarantineEnabled(options)) return { allowed: true };
  const health = getSourceHealthEngine();
  if (health.inStartupGrace()) return { allowed: true };
  if (health.isQuarantined(publication.sourceType, publication.sourceId)) {
    openOrUpdateIncident({
      type: INCIDENT_TYPES.SOURCE_QUARANTINED,
      severity: SEVERITY.WARNING,
      affectedSource: publication.sourceId,
      autoAction: "block_publication",
    });
    return { allowed: false, reason: REASON_CODES.SOURCE_QUARANTINED };
  }
  return { allowed: true };
}

function observePublicationResult(publication = {}, result = {}, options = {}) {
  if (!isEnabled(options)) return null;
  const correlationId = ensureCorrelationId(publication);
  const reasonCode = result.blocked
    ? normalizeReasonCode(result.reason)
    : result.published || result.dryRun
      ? REASON_CODES.PUBLISHED
      : REASON_CODES.DELIVERY_FAILED;

  if (reasonCode === REASON_CODES.PUBLISHED) {
    getMetricsAggregator().recordPublicationAllowed();
    updateHeartbeat({
      lastSuccessfulPublicationAt: new Date().toISOString(),
      lastEconomicPublicationAt:
        publication.publicationType === "RELEASE" ? new Date().toISOString() : options.lastEconomicPublicationAt,
    });
  }

  const attribution =
    reasonCode === REASON_CODES.PUBLISHED
      ? FAILURE_ATTRIBUTION.EXPECTED_NO_DATA
      : classifyBlockReason(reasonCode, result.stage);

  getSourceHealthEngine().recordSample(
    {
      parseSuccess: reasonCode === REASON_CODES.PUBLISHED ? 1 : 0,
      parseFailure: attribution === FAILURE_ATTRIBUTION.SOURCE_CAUSED && result.blocked ? 1 : 0,
      duplicateBlocks: reasonCode === REASON_CODES.DUPLICATE_BLOCKED ? 1 : 0,
      attribution,
    },
    publication.sourceType,
    publication.sourceId
  );

  const confidence = computeConfidence(options.confidence || {});

  recordDecision({
    correlationId,
    candidateId: publication.metadata?.candidateId,
    eventKey: result.eventKey || publication.eventKey,
    eventType: publication.eventType,
    eventFamily: publication.eventFamily,
    sourceType: publication.sourceType,
    sourceId: publication.sourceId,
    sourceMessageId: publication.metadata?.rawMessageId,
    sourceLink: publication.sourceLink,
    receivedAt: publication.receivedAt,
    reasonCode,
    confidence,
    publicationId: result.publicationRecord?.id || null,
    deliveryResult: {
      telegramSent: result.telegramSent,
      siteInserted: result.siteInserted,
      partial: result.partial,
    },
    imageStatus: publication.imagePolicy || publication.metadata?.imagePolicy,
    aiUsed: publication.metadata?.aiUsed === true,
    latency: options.latency,
    metadata: { attribution },
  });

  observeAnomaly({
    reasonCode,
    sourceId: publication.sourceId,
    eventType: publication.eventType,
    latencyMs: options.latency?.totalMs,
  });

  if (reasonCode === REASON_CODES.PUBLISHED && result.publicationRecord) {
    const audit = auditPublishedRecord({
      publication,
      publicationRecord: result.publicationRecord,
      canonicalFacts: publication.facts,
      requiredImage: publication.imagePolicy === "REQUIRED" || publication.metadata?.imagePolicy === "REQUIRED",
    });
    if (!audit.ok && options.gateway && isPhase3AutonomyEnabled(options)) {
      reconcileDelivery(result.publicationRecord, options.gateway, { correlationId }).catch(() => {});
    }
  }

  return reasonCode;
}

function observeCycleStart() {
  updateHeartbeat({ lastCycleStartedAt: new Date().toISOString() });
}

function observeCycleEnd(durationMs, stats = {}) {
  const funnel = stats.funnel || require("../../news-ingestion/cycle-funnel").getCycleFunnel();
  pipelineStallWindow.push({
    at: Date.now(),
    eligible: (funnel.rssEligible || 0) + (funnel.telegramCandidates || 0),
    editorialEvaluated: funnel.editorialEvaluated || 0,
    published: funnel.publicationsSuccess || 0,
    newObserved: (funnel.rssNew || 0) + (funnel.telegramNew || 0),
  });
  if (pipelineStallWindow.length > ANOMALY_THRESHOLDS.pipelineStallWindowCycles) {
    pipelineStallWindow.shift();
  }

  updateHeartbeat({
    lastCycleCompletedAt: new Date().toISOString(),
    lastCycleDurationMs: durationMs,
    lastErrorAt: stats.lastErrorSafe ? new Date().toISOString() : null,
    lastSuccessfulPublicationAt:
      funnel.publicationsSuccess > 0 || funnel.rssPublished > 0 || funnel.telegramPublished > 0
        ? new Date().toISOString()
        : undefined,
  });
  detectSilentFailures();
  syncSourceHealthCounts();
}

function observeTelegramPoll(meta = {}) {
  const now = new Date().toISOString();
  lastTelegramPollAt = Date.now();
  lastTelegramPollSuccessAt = Date.now();
  updateHeartbeat({
    lastTelegramPollAt: now,
    lastTelegramPollSuccessAt: now,
    lastTelegramPollOk: meta.ok !== false,
  });
}

function observeRssPoll(success = true, sourceId = null, meta = {}) {
  const now = new Date().toISOString();
  lastRssPollAt = Date.now();
  updateHeartbeat({ lastRssPollAt: now, lastRssPollOk: success !== false });
  if (success !== false) {
    lastRssPollSuccessAt = Date.now();
    updateHeartbeat({ lastRssPollSuccessAt: now });
    getSourceHealthEngine().recordSample(
      {
        fetchSuccess: 1,
        zeroArticleCycles: meta.zeroArticles ? 1 : 0,
        attribution: FAILURE_ATTRIBUTION.EXPECTED_NO_DATA,
      },
      "rss",
      sourceId
    );
  } else {
    getMetricsAggregator().recordRssFetchFailure();
    getSourceHealthEngine().recordSample(
      { fetchFailure: 1, attribution: FAILURE_ATTRIBUTION.NETWORK_CAUSED },
      "rss",
      sourceId
    );
  }
}

function observeParseSuccess(sourceType, sourceId) {
  getSourceHealthEngine().recordSample(
    { parseSuccess: 1, numericExtractionSuccess: 1, attribution: FAILURE_ATTRIBUTION.EXPECTED_NO_DATA },
    sourceType,
    sourceId
  );
}

function observeParseFailure(sourceType, sourceId) {
  getMetricsAggregator().recordTelegramParseFailure(sourceId);
  getSourceHealthEngine().recordSample(
    { parseFailure: 1, attribution: FAILURE_ATTRIBUTION.SOURCE_CAUSED },
    sourceType,
    sourceId
  );
}

function observeAiSkipped() {
  getMetricsAggregator().recordAiSkipped();
}

function observeAiFailure() {
  getMetricsAggregator().recordAiFailure();
}

function syncSourceHealthCounts() {
  const sources = getSourceHealthEngine().getAllSources();
  getMetricsAggregator().setSourceHealthCounts({
    degraded: sources.filter((s) => s.state === "DEGRADED").length,
    quarantined: sources.filter((s) => s.state === "QUARANTINED").length,
  });
}

function detectSilentFailures() {
  if (getSourceHealthEngine().inStartupGrace()) return;

  const now = Date.now();
  const heartbeat = getHeartbeat();
  const checks = [];

  const lastRssPollMs = heartbeat.lastRssPollAt ? new Date(heartbeat.lastRssPollAt).getTime() : lastRssPollAt;
  const lastTelegramPollMs = heartbeat.lastTelegramPollAt
    ? new Date(heartbeat.lastTelegramPollAt).getTime()
    : lastTelegramPollAt;

  if (lastRssPollMs && now - lastRssPollMs > ANOMALY_THRESHOLDS.pollSilenceMs) {
    checks.push({ silent: true, kind: "rss_poll_stopped", lastRssPollAt: heartbeat.lastRssPollAt });
  }
  if (lastTelegramPollMs && now - lastTelegramPollMs > ANOMALY_THRESHOLDS.pollSilenceMs) {
    checks.push({ silent: true, kind: "telegram_poll_stopped", lastTelegramPollAt: heartbeat.lastTelegramPollAt });
  }
  if (heartbeat.lastCycleStartedAt && !heartbeat.lastCycleCompletedAt) {
    const started = new Date(heartbeat.lastCycleStartedAt).getTime();
    if (now - started > ANOMALY_THRESHOLDS.cycleIncompleteMs) {
      checks.push({ silent: true, kind: "cycle_incomplete", startedAt: heartbeat.lastCycleStartedAt });
    }
  }

  if (pipelineStallWindow.length >= ANOMALY_THRESHOLDS.pipelineStallWindowCycles) {
    const eligibleSum = pipelineStallWindow.reduce((sum, entry) => sum + entry.eligible, 0);
    const publishedSum = pipelineStallWindow.reduce((sum, entry) => sum + entry.published, 0);
    const newSum = pipelineStallWindow.reduce((sum, entry) => sum + entry.newObserved, 0);
    if (
      eligibleSum >= ANOMALY_THRESHOLDS.pipelineStallEligibleMin &&
      publishedSum <= ANOMALY_THRESHOLDS.pipelineStallPublicationMax
    ) {
      checks.push({
        silent: true,
        kind: "publication_pipeline_stall",
        eligibleSum,
        publishedSum,
        newObservedSum: newSum,
        windowCycles: pipelineStallWindow.length,
      });
    } else if (newSum === 0 && eligibleSum === 0) {
      checks.push({ silent: false, kind: "quiet_market", newObservedSum: newSum });
    }
  }

  for (const check of checks) {
    if (check.kind === "publication_pipeline_stall") {
      openOrUpdateIncident({
        type: INCIDENT_TYPES.NEWS_PUBLICATION_PIPELINE_STALL,
        severity: SEVERITY.HIGH,
        evidenceSummary: check,
      });
      continue;
    }
    if (check.kind === "quiet_market") {
      continue;
    }
    observeSilentFailure(check);
  }
}

function evaluateLatencySlo(latency = {}) {
  const breaches = [];
  if (latency.ingestToNormalized > SLO_THRESHOLDS_MS.ingestToNormalized) breaches.push("ingestToNormalized");
  if (latency.normalizedToEditorial > SLO_THRESHOLDS_MS.normalizedToEditorial) breaches.push("normalizedToEditorial");
  if (latency.editorialToPublication > SLO_THRESHOLDS_MS.editorialToPublication) breaches.push("editorialToPublication");
  if (latency.totalMs > SLO_THRESHOLDS_MS.totalIngestToPublication) breaches.push("totalIngestToPublication");
  if (breaches.length >= 3) {
    openOrUpdateIncident({
      type: INCIDENT_TYPES.LATENCY_DEGRADATION,
      severity: SEVERITY.WARNING,
      evidenceSummary: { breaches, latency },
    });
  }
  return breaches;
}

function getBreaker(name) {
  return getCircuitBreakerRegistry().get(name);
}

async function flushObservabilityBatch(supabase) {
  return flushObservability(supabase);
}

function resetPhase3IntegrationForTests() {
  lastTelegramPollAt = null;
  lastTelegramPollSuccessAt = null;
  lastRssPollAt = null;
  lastRssPollSuccessAt = null;
  pipelineStallWindow.length = 0;
}

module.exports = {
  isEnabled,
  observeCandidateReceived,
  observeEvaluationBlocked,
  checkSourceQuarantine,
  observePublicationResult,
  observeCycleStart,
  observeCycleEnd,
  observeTelegramPoll,
  observeRssPoll,
  observeParseSuccess,
  observeParseFailure,
  observeAiSkipped,
  observeAiFailure,
  detectSilentFailures,
  evaluateLatencySlo,
  getBreaker,
  flushObservability: flushObservabilityBatch,
  computeConfidence,
  evaluateConfidencePolicy,
  resetPhase3IntegrationForTests,
};
