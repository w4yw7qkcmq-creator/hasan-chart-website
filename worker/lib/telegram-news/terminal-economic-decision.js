const { recordDecision } = require("../news-intelligence/autonomy/decision-record");
const { createCorrelationId } = require("../news-intelligence/autonomy/structured-log");
const { getEventFamily } = require("../news-intelligence/event-registry");
const { DECISION_OUTCOMES, REASON_CODES, normalizeReasonCode } = require("../news-intelligence/autonomy/reason-taxonomy");
const { resolveCountryCode } = require("../economic-releases/country-resolver");

const terminalDecisionKeys = new Set();

function buildTerminalDecisionKey(input = {}) {
  return [
    input.sourceId || input.sourceChannel || "unknown",
    input.sourceMessageId || "unknown",
    input.eventType || input.eventKey || "none",
    normalizeReasonCode(input.reasonCode || input.reason) || "UNKNOWN",
  ].join("|");
}

function mapPipelineReasonToCode(reason) {
  const value = String(reason || "").trim();
  const map = {
    TELEGRAM_NON_ECONOMIC_SKIPPED: REASON_CODES.TELEGRAM_NON_ECONOMIC_SKIPPED,
    TELEGRAM_PROMOTION_SKIPPED: REASON_CODES.SOURCE_POLICY_BLOCKED,
    TELEGRAM_POST_CLASSIFICATION_UNCLEAR: REASON_CODES.PARSER_INCOMPLETE,
    TELEGRAM_NEWS_LOW_VALUE: REASON_CODES.LOW_VALUE_SKIPPED,
    PRE_EVENT_ALERT_MISSING_EVENT_NAME: REASON_CODES.PARSER_INCOMPLETE,
    MULTI_STORY_UNCLEAR: REASON_CODES.MULTI_STORY_UNCLEAR,
    source_conflict: REASON_CODES.FACT_INTEGRITY_FAILED,
    FINAL_MESSAGE_FACT_MISMATCH: REASON_CODES.FACT_INTEGRITY_FAILED,
    FINAL_ATOMIC_PUBLISH_REJECTED: REASON_CODES.QUALITY_GATE_BLOCKED,
    PHASE2_EDITORIAL_BLOCKED: REASON_CODES.QUALITY_GATE_BLOCKED,
    QUALITY_GATE_BLOCKED: REASON_CODES.QUALITY_GATE_BLOCKED,
    MISSING_CANONICAL_EVENT: REASON_CODES.MISSING_CANONICAL_EVENT,
    CANONICAL_EVENT_UNRESOLVED: REASON_CODES.CANONICAL_EVENT_UNRESOLVED,
    duplicate_skip: REASON_CODES.DUPLICATE_BLOCKED,
    DUPLICATE_BLOCKED: REASON_CODES.DUPLICATE_BLOCKED,
    gateway_blocked: REASON_CODES.GATEWAY_BLOCKED,
    db_insert_failed: REASON_CODES.DELIVERY_FAILED,
    skip_publish: REASON_CODES.PARSER_INCOMPLETE,
    telegram_template_incomplete: REASON_CODES.PARSER_INCOMPLETE,
  };

  if (map[value]) {
    return map[value];
  }

  return normalizeReasonCode(value) || REASON_CODES.QUALITY_GATE_BLOCKED;
}

function isEconomicShapedCandidate(input = {}) {
  if (input.newsType === "economic") {
    return true;
  }
  if (input.facts?.isStructuredTriple || input.facts?.isEconomic) {
    return true;
  }
  if (input.classification?.classification === "economic_release") {
    return true;
  }
  return Boolean(input.facts?.previous || input.facts?.forecast || input.facts?.actual);
}

function recordTelegramTerminalDecision(input = {}, options = {}) {
  const reasonCode = mapPipelineReasonToCode(input.reasonCode || input.reason);
  const sourceId = input.sourceId || input.sourceChannel || input.post?.sourceChannel || null;
  const sourceMessageId = input.sourceMessageId || input.post?.sourceMessageId || null;
  const eventType = input.eventType || input.facts?.canonicalEventKey || input.facts?.eventType || null;
  const dedupeKey = buildTerminalDecisionKey({ sourceId, sourceMessageId, eventType, reasonCode });

  if (terminalDecisionKeys.has(dedupeKey) && options.force !== true) {
    return null;
  }
  terminalDecisionKeys.add(dedupeKey);

  const decision =
    reasonCode === REASON_CODES.PUBLISHED ? DECISION_OUTCOMES.PUBLISHED : DECISION_OUTCOMES.BLOCKED;

  return recordDecision({
    correlationId: input.correlationId || createCorrelationId("news"),
    eventKey: input.eventKey || null,
    eventType,
    eventFamily: getEventFamily(eventType),
    sourceType: input.sourceType || "telegram_economic",
    sourceId,
    sourceMessageId,
    sourceLink:
      input.sourceLink ||
      input.post?.sourceUrl ||
      (sourceId && sourceMessageId ? `telegram:${sourceId}/${sourceMessageId}` : null),
    receivedAt: input.receivedAt || input.post?.sourcePublishedAt || null,
    reasonCode,
    decision,
    importance: input.importance || "HIGH",
    qualityStatus: decision === DECISION_OUTCOMES.PUBLISHED ? "published" : "blocked",
    imageStatus: input.imageStatus || null,
    metadata: {
      stage: input.stage || "telegram_pipeline",
      subReason: input.subReason || input.reason || null,
      country: input.country || resolveCountryCode(`${input.facts?.title || ""}\n${input.post?.rawText || ""}`),
      titlePreview: String(input.facts?.title || input.title || "").slice(0, 120),
      classification: input.classification?.classification || null,
      ...(input.metadata || {}),
    },
    latency: input.latency || null,
  });
}

function recordTelegramEconomicExitIfNeeded(input = {}, options = {}) {
  if (!isEconomicShapedCandidate(input) && !options.forceEconomic) {
    if (input.requireObservabilityForSkip) {
      return recordTelegramTerminalDecision(
        {
          ...input,
          reasonCode: REASON_CODES.TELEGRAM_NON_ECONOMIC_SKIPPED,
          importance: "MEDIUM",
        },
        options
      );
    }
    return null;
  }

  return recordTelegramTerminalDecision(input, options);
}

function resetTelegramTerminalDecisionsForTests() {
  terminalDecisionKeys.clear();
}

module.exports = {
  buildTerminalDecisionKey,
  mapPipelineReasonToCode,
  isEconomicShapedCandidate,
  recordTelegramTerminalDecision,
  recordTelegramEconomicExitIfNeeded,
  resetTelegramTerminalDecisionsForTests,
};
