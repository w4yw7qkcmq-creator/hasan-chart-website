const { hasRealNewsContent } = require("./promo-filter");

function scoreNewsValue(post, classificationResult = {}) {
  const text = classificationResult.cleanedText || post.rawText || "";
  const classification = classificationResult.classification || null;

  if (classification === "pre_event_alert" && classificationResult.preEvent?.eventName) {
    return { score: 85, publishable: true, factors: ["pre_event_alert"] };
  }

  if (classification === "economic_release") {
    return { score: 92, publishable: true, factors: ["economic_release"] };
  }

  let score = 0;
  const factors = [];

  if (/صدر\s*الآن|السابق|المتوقع|الحالي|breaking|عاجل/i.test(text)) {
    score += 25;
    factors.push("clear_event");
  }

  if (/fed|fomc|cpi|nfp|gdp|pmi|ism|powell|ترامب|trump|iran|gold|الذهب|oil|نفط|bitcoin|dollar|دولار/i.test(text)) {
    score += 20;
    factors.push("market_relevance");
  }

  if (/\d+(?:\.\d+)?%|\d+[KMB]|-?\d+(?:\.\d+)?/i.test(text)) {
    score += 15;
    factors.push("has_numbers");
  }

  if (/(?:said|states|according|صر[ّ]?ح|أعلن|according to|وكالة|Reuters|Bloomberg)/i.test(text)) {
    score += 10;
    factors.push("attributed_statement");
  }

  if (["official_statement", "breaking_news"].includes(classification)) {
    score += 15;
    factors.push("high_confidence_classification");
  }

  if (classificationResult.detectedNewsSignals?.includes("geopolitical")) {
    score += 15;
    factors.push("geopolitical_relevance");
  }

  if (classificationResult.detectedNewsSignals?.includes("release_now")) {
    score += 10;
    factors.push("breaking_release");
  }

  const wordCount = text.split(/\s+/).filter(Boolean).length;

  if (
    classification === "market_update" &&
    factors.includes("attributed_statement") &&
    factors.includes("market_relevance")
  ) {
    score += 10;
    factors.push("market_statement");
  }

  if (classification === "market_update" && factors.includes("market_relevance") && wordCount >= 12) {
    score += 5;
    factors.push("market_update_substance");
  }

  if (wordCount >= 12 && wordCount <= 180) {
    score += 10;
    factors.push("readable_length");
  } else if (wordCount < 8) {
    score -= 20;
    factors.push("too_short");
  } else if (wordCount > 250) {
    score -= 10;
    factors.push("too_long");
  }

  if (/^(?::+|\.+|تابعونا|أخبار\s*عاجلة\s*قريبًا)/i.test(text.trim())) {
    score -= 30;
    factors.push("vague_opener");
  }

  if (/حصاد|توصيات|vip|اشتراك|exness|broker/i.test(text)) {
    score -= 40;
    factors.push("promo_hint");
  }

  if (!hasRealNewsContent(text) && !classificationResult.facts?.isStructuredTriple) {
    score -= 25;
    factors.push("weak_news_content");
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    publishable: score >= 45,
    factors,
  };
}

module.exports = {
  scoreNewsValue,
};
