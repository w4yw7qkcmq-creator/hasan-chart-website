const { classifyTelegramPost } = require("./classifier");
const { scoreNewsValue } = require("./quality-gate");
const { isOfficialHighImpactTelegramPost } = require("./source-policy");
const {
  stripPromotionalContent,
  stripPromotionalFooter,
  isPromotionOnly,
  detectPromotionSignals,
} = require("./promo-filter");

function prepareTelegramPost(post, stats = {}) {
  const rawText = post.rawText || "";
  const promoSignalsBefore = detectPromotionSignals(rawText);
  let cleanedText = stripPromotionalFooter(rawText);
  let promoFooterRemoved = cleanedText !== rawText.trim();

  if (promoFooterRemoved) {
    stats.promoFootersRemoved = (stats.promoFootersRemoved || 0) + 1;
  }

  if (isPromotionOnly(rawText)) {
    stats.promoOnlySkipped = (stats.promoOnlySkipped || 0) + 1;
    return {
      skip: true,
      reason: "TELEGRAM_PROMOTION_SKIPPED",
      logReason: promoSignalsBefore.slice(0, 3).join("|") || "promotion_only",
      classification: classifyTelegramPost({ ...post, rawText: cleanedText }),
      promoFooterRemoved,
      newsValue: { score: 0, publishable: false, factors: ["promotion_only"] },
    };
  }

  cleanedText = stripPromotionalContent(cleanedText);
  const classification = classifyTelegramPost({ ...post, rawText: cleanedText });
  const newsValue = scoreNewsValue({ ...post, rawText: cleanedText }, classification);

  if (!isOfficialHighImpactTelegramPost(classification)) {
    stats.nonEconomicSkipped = (stats.nonEconomicSkipped || 0) + 1;
    return {
      skip: true,
      reason: "TELEGRAM_NON_ECONOMIC_SKIPPED",
      logReason: classification.classification,
      classification,
      promoFooterRemoved,
      newsValue,
    };
  }

  if (!classification.isPublishable) {
    if (classification.classification === "unclear") {
      stats.unclearSkipped = (stats.unclearSkipped || 0) + 1;
    }
    return {
      skip: true,
      reason:
        classification.classification === "unclear"
          ? "TELEGRAM_POST_CLASSIFICATION_UNCLEAR"
          : `TELEGRAM_POST_CLASSIFICATION_${classification.classification.toUpperCase()}`,
      logReason: classification.reasons.join("|"),
      classification,
      promoFooterRemoved,
      newsValue,
    };
  }

  if (classification.classification === "pre_event_alert" && !classification.preEvent?.eventName) {
    stats.preEventMissingName = (stats.preEventMissingName || 0) + 1;
    return {
      skip: true,
      reason: "PRE_EVENT_ALERT_MISSING_EVENT_NAME",
      logReason: "missing_event_name",
      classification,
      promoFooterRemoved,
      newsValue,
    };
  }

  if (!newsValue.publishable) {
    stats.lowValueSkipped = (stats.lowValueSkipped || 0) + 1;
    return {
      skip: true,
      reason: "TELEGRAM_NEWS_LOW_VALUE",
      logReason: newsValue.factors.join("|"),
      classification,
      promoFooterRemoved,
      newsValue,
    };
  }

  if (promoFooterRemoved) {
    stats.promoFootersRemoved = stats.promoFootersRemoved || 0;
  }

  return {
    skip: false,
    post: { ...post, rawText: cleanedText },
    classification,
    promoFooterRemoved,
    newsValue,
    reason: promoFooterRemoved ? "TELEGRAM_PROMO_FOOTER_REMOVED" : "ready",
  };
}

module.exports = {
  prepareTelegramPost,
};
