const { classifyTelegramPost } = require("./classifier");
const { scoreNewsValue } = require("./quality-gate");
const { isOfficialHighImpactTelegramPost } = require("./source-policy");
const { sanitizeSourceForParsing } = require("./sanitize-source-for-parsing");
const {
  recordTelegramEconomicExitIfNeeded,
} = require("./terminal-economic-decision");
const {
  appendPipelineStage,
  buildPipelineTraceMetadata,
  createPipelineTrace,
} = require("./pipeline-trace");
const {
  stripPromotionalContent,
  stripPromotionalFooter,
  isPromotionOnly,
  detectPromotionSignals,
} = require("./promo-filter");

function buildSkipResult(post, prep) {
  recordTelegramEconomicExitIfNeeded(
    {
      post,
      facts: prep.classification?.facts,
      classification: prep.classification,
      reason: prep.reason,
      reasonCode: prep.reason,
      stage: "prepare_telegram_post",
      requireObservabilityForSkip: prep.reason === "TELEGRAM_NON_ECONOMIC_SKIPPED",
    },
    { forceEconomic: prep.classification?.facts?.isStructuredTriple === true }
  );

  return {
    skip: true,
    reason: prep.reason,
    logReason: prep.logReason,
    classification: prep.classification,
    promoFooterRemoved: prep.promoFooterRemoved,
    newsValue: prep.newsValue,
  };
}

function prepareTelegramPost(post, stats = {}) {
  const sourceRawText = post.sourceRawText || post.rawText || "";
  const sanitizedBundle =
    post.sanitizedText != null
      ? {
          sourceRawText,
          sanitizedText: post.sanitizedText,
          sourceReading: post.sourceReading || null,
          promoFooterRemoved: post.promoFooterRemoved === true,
        }
      : sanitizeSourceForParsing(sourceRawText);
  const promoSignalsBefore = detectPromotionSignals(sourceRawText);
  let cleanedText = sanitizedBundle.sanitizedText;
  let promoFooterRemoved = sanitizedBundle.promoFooterRemoved;

  if (promoFooterRemoved) {
    stats.promoFootersRemoved = (stats.promoFootersRemoved || 0) + 1;
  }

  const pipelineTrace = appendPipelineStage(createPipelineTrace("SOURCE_RECEIVED"), "SANITIZED", {
    promoFooterRemoved,
  });

  const enrichedPost = {
    ...post,
    sourceRawText: sanitizedBundle.sourceRawText,
    sanitizedText: cleanedText,
    rawText: cleanedText,
    sourceReading: sanitizedBundle.sourceReading || post.sourceReading || null,
    pipelineTrace,
  };

  if (isPromotionOnly(sourceRawText)) {
    stats.promoOnlySkipped = (stats.promoOnlySkipped || 0) + 1;
    return buildSkipResult(post, {
      skip: true,
      reason: "TELEGRAM_PROMOTION_SKIPPED",
      logReason: promoSignalsBefore.slice(0, 3).join("|") || "promotion_only",
      classification: classifyTelegramPost({ ...enrichedPost, rawText: cleanedText }),
      promoFooterRemoved,
      newsValue: { score: 0, publishable: false, factors: ["promotion_only"] },
      pipelineTrace: appendPipelineStage(pipelineTrace, "SKIPPED", { reason: "TELEGRAM_PROMOTION_SKIPPED" }),
    });
  }

  cleanedText = stripPromotionalContent(cleanedText);
  const classification = classifyTelegramPost({ ...enrichedPost, rawText: cleanedText });
  appendPipelineStage(pipelineTrace, "EVENT_DETECTED");
  appendPipelineStage(pipelineTrace, "EVENT_CLASSIFIED", { classification: classification.classification });
  const newsValue = scoreNewsValue({ ...enrichedPost, rawText: cleanedText }, classification);

  if (!isOfficialHighImpactTelegramPost(classification)) {
    stats.nonEconomicSkipped = (stats.nonEconomicSkipped || 0) + 1;
    return buildSkipResult(enrichedPost, {
      skip: true,
      reason: "TELEGRAM_NON_ECONOMIC_SKIPPED",
      logReason: classification.classification,
      classification,
      promoFooterRemoved,
      newsValue,
      pipelineTrace: appendPipelineStage(pipelineTrace, "COVERAGE_NOT_ALLOWED"),
    });
  }

  appendPipelineStage(pipelineTrace, "COVERAGE_ALLOWED");

  if (!classification.isPublishable) {
    if (classification.classification === "unclear") {
      stats.unclearSkipped = (stats.unclearSkipped || 0) + 1;
    }
    return buildSkipResult(post, {
      skip: true,
      reason:
        classification.classification === "unclear"
          ? "TELEGRAM_POST_CLASSIFICATION_UNCLEAR"
          : `TELEGRAM_POST_CLASSIFICATION_${classification.classification.toUpperCase()}`,
      logReason: classification.reasons.join("|"),
      classification,
      promoFooterRemoved,
      newsValue,
    });
  }

  if (classification.classification === "pre_event_alert" && !classification.preEvent?.eventName) {
    stats.preEventMissingName = (stats.preEventMissingName || 0) + 1;
    return buildSkipResult(post, {
      skip: true,
      reason: "PRE_EVENT_ALERT_MISSING_EVENT_NAME",
      logReason: "missing_event_name",
      classification,
      promoFooterRemoved,
      newsValue,
    });
  }

  if (!newsValue.publishable) {
    stats.lowValueSkipped = (stats.lowValueSkipped || 0) + 1;
    return buildSkipResult(post, {
      skip: true,
      reason: "TELEGRAM_NEWS_LOW_VALUE",
      logReason: newsValue.factors.join("|"),
      classification,
      promoFooterRemoved,
      newsValue,
    });
  }

  if (promoFooterRemoved) {
    stats.promoFootersRemoved = stats.promoFootersRemoved || 0;
  }

  if (classification.facts?.canonicalEventKey) {
    appendPipelineStage(pipelineTrace, "REGISTRY_MATCHED", {
      canonicalEventKey: classification.facts.canonicalEventKey,
    });
  } else if (classification.facts?.isStructuredTriple) {
    appendPipelineStage(pipelineTrace, "UNSUPPORTED_EVENT", {
      canonicalEventKey: null,
    });
  }

  return {
    skip: false,
    post: enrichedPost,
    classification,
    promoFooterRemoved,
    newsValue,
    pipelineTrace,
    reason: promoFooterRemoved ? "TELEGRAM_PROMO_FOOTER_REMOVED" : "ready",
  };
}

module.exports = {
  prepareTelegramPost,
};
