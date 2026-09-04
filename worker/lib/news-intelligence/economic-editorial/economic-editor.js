const { logPhase2Event, PHASE2_EVENTS } = require("./observability-v2");
const {
  buildSingleStructuredOutput,
  buildFamilyStructuredOutput,
  formatSingleEditorial,
  formatFamilyEditorial,
} = require("./arabic-formatter");
const { validateQualityGateV2, BLOCK_REASONS } = require("./quality-gate-v2");
const { validateNumericTokenIntegrity } = require("./numeric-integrity");
const { resolveVisualPriority } = require("./interpretation-registry");
const { getEventFamily } = require("../event-registry");
const { buildScheduledBucket } = require("../../telegram-news/fingerprint");
const { interpretEventFamily } = require("./deterministic-interpretation");
const { maybeEnhanceWithAi } = require("./ai-editor");

const EDITORIAL_VERSION = "phase2-v3";

function buildStructuredInputFromPublication(publication = {}) {
  const facts = publication.facts || {};
  return {
    eventType: publication.eventType,
    eventFamily: publication.eventFamily || getEventFamily(publication.eventType),
    country: publication.country || facts.countryCode || "US",
    actual: facts.actual ?? publication.actual,
    forecast: facts.forecast ?? publication.forecast,
    previous: facts.previous ?? publication.previous,
    unit: facts.unit ?? publication.unit,
    releaseTime: publication.releaseDate || publication.releaseTime,
    importance: publication.importance,
    canonicalDisplayName: facts.canonicalDisplayName || publication.canonicalDisplayName || null,
    sourceReading: facts.sourceReading || publication.sourceReading || null,
    sourceReadingRaw: facts.sourceReadingRaw || publication.sourceReadingRaw || null,
    publishedReading: facts.publishedReading || publication.publishedReading || null,
    canonicalEventId: facts.canonicalEventId || publication.eventType || null,
    telegramStructuredEconomic: publication.sourceType === "telegram_economic",
    canonicalFacts: {
      actual: facts.actual ?? publication.actual,
      forecast: facts.forecast ?? publication.forecast,
      previous: facts.previous ?? publication.previous,
      unit: facts.unit ?? publication.unit,
    },
  };
}

async function composeSingleEditorial(structuredEvent, options = {}) {
  const startedAt = Date.now();
  logPhase2Event(PHASE2_EVENTS.ECONOMIC_EDITOR_STARTED, {
    eventType: structuredEvent.eventType,
    mode: "single",
  });

  const structured = buildSingleStructuredOutput(structuredEvent);
  const aiMeta = {
    aiUsed: false,
    aiReason: structured.interpretation ? "source_reading_preserved" : "source_reading_absent",
  };

  logPhase2Event(PHASE2_EVENTS.ECONOMIC_AI_EDITOR_SKIPPED, {
    eventType: structuredEvent.eventType,
    reason: aiMeta.aiReason,
  });

  const body = formatSingleEditorial(structured);
  const quality = validateQualityGateV2({
    structured,
    body,
    structuredEvent,
    rawSourceText: options.rawSourceText || null,
    telegramStructuredEconomic: structuredEvent.telegramStructuredEconomic === true,
  });
  if (!quality.ok) {
    logPhase2Event(PHASE2_EVENTS.QUALITY_GATE_BLOCKED, { reason: quality.reason, eventType: structuredEvent.eventType });
    return { ok: false, blocked: true, reason: quality.reason, stage: "quality_gate", quality, detail: quality.detail };
  }

  const numeric = validateNumericTokenIntegrity(body, structuredEvent.canonicalFacts || structuredEvent, {
    structuredEvent,
  });
  if (!numeric.ok) {
    logPhase2Event(PHASE2_EVENTS.HALLUCINATED_NUMERIC_TOKEN, { reason: numeric.reason, token: numeric.token });
    return { ok: false, blocked: true, reason: numeric.reason, stage: "numeric_integrity", numeric };
  }

  logPhase2Event(PHASE2_EVENTS.QUALITY_GATE_PASSED, { eventType: structuredEvent.eventType });

  const latencyMs = Date.now() - startedAt;
  logPhase2Event(PHASE2_EVENTS.ECONOMIC_EDITOR_COMPLETED, {
    eventType: structuredEvent.eventType,
    mode: "single",
    aiUsed: false,
    latencyMs,
  });

  return {
    ok: true,
    structured,
    body,
    deterministic: null,
    aiMeta,
    image: null,
    imageMeta: {
      source: "deferred_to_gateway",
      visualPriority: structured.visualPriority || resolveVisualPriority(structuredEvent.eventType),
    },
    visualPriority: structured.visualPriority || resolveVisualPriority(structuredEvent.eventType),
    editorialVersion: EDITORIAL_VERSION,
    latency: {
      totalMs: latencyMs,
      deterministicMs: latencyMs,
      aiMs: 0,
      imageMs: 0,
    },
  };
}

async function composeFamilyEditorial(family, children, options = {}) {
  const startedAt = Date.now();
  logPhase2Event(PHASE2_EVENTS.ECONOMIC_EDITOR_STARTED, {
    eventFamily: family,
    mode: "family",
    childCount: children.length,
  });

  const familyInterpretation = interpretEventFamily(children);
  const structured = buildFamilyStructuredOutput(family, children, familyInterpretation);
  let aiMeta = { aiUsed: false, aiReason: "family_deterministic" };

  const aiResult = await maybeEnhanceWithAi(structured, familyInterpretation, { eventFamily: family, children }, options);
  if (aiResult.aiUsed) {
    structured.interpretation = aiResult.enhancements?.interpretation || structured.interpretation;
    structured.marketImpact = aiResult.enhancements?.marketImpact || structured.marketImpact;
    aiMeta = aiResult;
    logPhase2Event(PHASE2_EVENTS.ECONOMIC_AI_EDITOR_USED, { eventFamily: family });
  } else {
    logPhase2Event(PHASE2_EVENTS.ECONOMIC_AI_EDITOR_SKIPPED, { eventFamily: family, reason: aiResult.aiReason });
  }

  const body = formatFamilyEditorial(structured);
  const canonicalFacts = children.reduce(
    (acc, child) => {
      acc[child.eventType] = child.canonicalFacts || {
        actual: child.actual,
        forecast: child.forecast,
        previous: child.previous,
      };
      return acc;
    },
    {}
  );

  const quality = validateQualityGateV2({
    structured,
    body,
    structuredEvent: { eventFamily: family, children, canonicalFacts },
    rawSourceText: options.rawSourceText || null,
    isFamily: true,
  });
  if (!quality.ok) {
    logPhase2Event(PHASE2_EVENTS.QUALITY_GATE_BLOCKED, { reason: quality.reason, eventFamily: family });
    return { ok: false, blocked: true, reason: quality.reason, stage: "quality_gate", quality };
  }

  const numeric = validateNumericTokenIntegrity(body, canonicalFacts, {
    isFamily: true,
    facts: canonicalFacts,
    structuredEvent: { eventFamily: family, children },
  });
  if (!numeric.ok) {
    logPhase2Event(PHASE2_EVENTS.HALLUCINATED_NUMERIC_TOKEN, { reason: numeric.reason, token: numeric.token });
    return { ok: false, blocked: true, reason: numeric.reason, stage: "numeric_integrity", numeric };
  }

  logPhase2Event(PHASE2_EVENTS.QUALITY_GATE_PASSED, { eventFamily: family });

  const latencyMs = Date.now() - startedAt;
  logPhase2Event(PHASE2_EVENTS.ECONOMIC_EDITOR_COMPLETED, {
    eventFamily: family,
    mode: "family",
    aiUsed: aiMeta.aiUsed,
    latencyMs,
  });

  return {
    ok: true,
    structured,
    body,
    deterministic: familyInterpretation,
    aiMeta,
    image: null,
    imageMeta: { source: "deferred_to_gateway", visualPriority: structured.visualPriority },
    visualPriority: structured.visualPriority,
    editorialVersion: EDITORIAL_VERSION,
    familyPublicationKey: `${children[0]?.country || "US"}:${family}:${buildScheduledBucket(children[0]?.releaseTime)}`,
    latency: {
      totalMs: latencyMs,
      deterministicMs: aiResult.deterministicMs || latencyMs,
      aiMs: aiResult.aiMs || 0,
      imageMs: 0,
    },
  };
}

module.exports = {
  EDITORIAL_VERSION,
  buildStructuredInputFromPublication,
  composeSingleEditorial,
  composeFamilyEditorial,
  BLOCK_REASONS,
};
