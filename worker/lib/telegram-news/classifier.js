const {
  detectPromotionSignals,
  hasRealNewsContent,
  isPromotionOnly,
  stripPromotionalContent,
} = require("./promo-filter");
const { extractFactsFromTelegramPost } = require("./extractor");

const PUBLISHABLE = new Set([
  "economic_release",
  "breaking_news",
  "market_update",
  "official_statement",
  "pre_event_alert",
]);

const AUTO_SKIP = new Set([
  "promotion",
  "subscription_offer",
  "broker_ad",
  "channel_announcement",
  "link_only",
  "analysis_or_opinion",
]);

function detectPreEventAlert(text) {
  const value = String(text || "");
  const minutesMatch = value.match(/(?:ب(?:اقي|عد)\s*)?(\d+)\s*د(?:قيقة|قائق)/i);
  if (!minutesMatch && !/minutes?\s*(?:until|before|to)/i.test(value)) {
    return null;
  }
  const minutes = minutesMatch ? Number(minutesMatch[1]) : null;
  const eventMatch = value.match(
    /(?:خبر|حدث|إصدار|صدور)\s+(.{4,80}?)(?:\.|$|\n)|(?:on|for)\s+([A-Za-z\s]{4,60})/i
  );
  const eventName = (eventMatch?.[1] || eventMatch?.[2] || "").trim();
  return { minutes, eventName: eventName || null };
}

function classifyTelegramPost(post) {
  const rawText = post.rawText || "";
  const cleaned = stripPromotionalContent(rawText);
  const promoSignals = detectPromotionSignals(rawText);
  const newsSignals = [];

  if (/السابق|المتوقع|الحالي|previous|forecast|actual/i.test(cleaned)) {
    newsSignals.push("structured_triple");
  }
  if (/صدر\s*الآن|breaking|عاجل/i.test(cleaned)) {
    newsSignals.push("release_now");
  }
  if (/fed|fomc|powell|باول|قرار\s*الفائدة|cpi|nfp|gdp|pmi|ism/i.test(cleaned)) {
    newsSignals.push("macro_event");
  }
  if (/gold|الذهب|oil|نفط|bitcoin|btc|nasdaq|dow|s&p|دولار|yen|ين/i.test(cleaned)) {
    newsSignals.push("market_move");
  }
  if (/ترامب|trump|iran|إيران|israel|إسرائيل|war|حرب|sanctions|عقوبات/i.test(cleaned)) {
    newsSignals.push("geopolitical");
  }

  const facts = extractFactsFromTelegramPost({ ...post, rawText: cleaned });
  const preEvent = detectPreEventAlert(cleaned);

  let classification = "unclear";
  let confidence = 0.4;
  const reasons = [];

  if (/^https?:\/\/\S+\s*$/i.test(cleaned.trim()) || cleaned.length < 12) {
    classification = "link_only";
    confidence = 0.95;
    reasons.push("link_or_empty");
  } else if (/pinned a photo|pinned a message|اختبار|test post/i.test(cleaned)) {
    classification = "unclear";
    confidence = 0.9;
    reasons.push("non_news_channel_action");
  } else if (isPromotionOnly(rawText)) {
    if (/exness|\bxm\b|one\.exness|broker|وسيط|افتح\s*حساب/i.test(rawText)) {
      classification = "broker_ad";
    } else if (/اشتراك|100\s*\$|75\s*\$|vip|قناة\s*خاصة|توصيات\s*مدفوعة/i.test(rawText)) {
      classification = "subscription_offer";
    } else if (/حصاد|توصياتنا|قناة\s*المضاربات|انضم|اشترك/i.test(rawText)) {
      classification = "channel_announcement";
    } else {
      classification = "promotion";
    }
    confidence = 0.92;
    reasons.push("promotion_detected");
  } else if (preEvent && (preEvent.minutes || /دق/i.test(cleaned))) {
    classification = "pre_event_alert";
    confidence = preEvent.eventName ? 0.88 : 0.55;
    reasons.push(preEvent.eventName ? "pre_event_named" : "pre_event_vague");
  } else if (facts.isStructuredTriple) {
    classification = "economic_release";
    confidence = 0.95;
    reasons.push("structured_economic");
  } else if (facts.isPlainFedNews || /official|statement|تصريح|بيان|press conference|مؤتمر\s*صحفي/i.test(cleaned)) {
    classification = "official_statement";
    confidence = 0.82;
    reasons.push("official_statement");
  } else if (/تحليل|r\s*\/o\b|our view|في\s*رأينا|opinion|توقعات\s*شخصية/i.test(cleaned) && !newsSignals.length) {
    classification = "analysis_or_opinion";
    confidence = 0.8;
    reasons.push("exclusive_analysis");
  } else if (newsSignals.includes("geopolitical") || newsSignals.includes("market_move") || /عاجل|breaking/i.test(cleaned)) {
    classification = /عاجل|breaking|صدر\s*الآن/i.test(cleaned) ? "breaking_news" : "market_update";
    confidence = 0.78;
    reasons.push("market_news");
  } else if (hasRealNewsContent(cleaned)) {
    classification = "market_update";
    confidence = 0.65;
    reasons.push("general_market_content");
  } else {
    classification = "unclear";
    confidence = 0.5;
    reasons.push("insufficient_news_signals");
  }

  const isPublishable = PUBLISHABLE.has(classification) && !AUTO_SKIP.has(classification);

  return {
    classification,
    isPublishable,
    confidence,
    reasons,
    detectedPromotionSignals: promoSignals,
    detectedNewsSignals: newsSignals,
    preEvent,
    cleanedText: cleaned,
    facts,
  };
}

module.exports = {
  classifyTelegramPost,
  detectPreEventAlert,
  PUBLISHABLE,
  AUTO_SKIP,
};
