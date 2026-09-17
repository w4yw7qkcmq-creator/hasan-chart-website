/**
 * Deterministic general-news artwork category classifier for General Prebuilt V2 routing.
 * Does not infer factual claims or guess market direction without explicit source semantics.
 */

const {
  CATEGORY_ARTWORK_COUNTS,
  ROUTING_FALLBACK_CATEGORY,
} = require("./general-prebuilt-artwork-manifest");

const ROUTING_TAXONOMY = Object.keys(CATEGORY_ARTWORK_COUNTS);

const DIRECTIONAL_CATEGORIES = new Set([
  "oil-up",
  "oil-down",
  "global-markets-up",
  "global-markets-down",
]);

const OIL_TERMS = /\b(oil|crude|brent|wti|petroleum)\b/i;
const OIL_UP_TERMS =
  /\b(rise|rises|rising|rally|rallies|gain|gains|gained|jump|jumps|jumped|climb|climbs|surge|surges|soar|soars|higher|advances|advanced|climbs?)\b|ارتفاع النفط|صعود النفط|قفزة بأسعار النفط|يرتفع النفط|ارتفعت أسعار النفط/i;
const OIL_DOWN_TERMS =
  /\b(fall|falls|falling|drop|drops|dropped|decline|declines|declined|slide|slides|retreat|retreats|lower|retreats)\b|انخفاض النفط|هبوط النفط|تراجع أسعار النفط|ينخفض النفط|تراجع النفط/i;

const EQUITY_UP_TERMS =
  /\b(risk-on|rally|rallies|rallying|gain|gains|jump|jumps|surge|surges|positive sentiment|stocks rise|equities rise|market rally)\b/i;
const EQUITY_DOWN_TERMS =
  /\b(risk-off|selloff|sell-off|selling pressure|stocks fall|equities fall|market decline|decline|plunge|plunges|tumble|tumbles)\b/i;

const STRUCTURED_ECONOMIC_RELEASE_HINT =
  /\b(actual|forecast|previous|consensus|beat|miss)\b.*\b(\d|\%)/i;

function normalizeInput(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function sanitizeGeneralNewsClassificationText(text = "") {
  return String(text || "")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\bt\.me\/\S+/gi, " ")
    .replace(/#[\p{L}\p{N}_-]+/gu, " ")
    .replace(/@\w+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesIranUsContext(text) {
  const hasIran = /\biran\b|\biranian\b|\btehran\b/.test(text);
  const hasUs = /\b(united states|u\.s\.|us\b|america|american|washington)\b/.test(text);
  if (hasIran && hasUs) {
    return true;
  }
  if (hasIran && /\b(us sanctions|u\.s\. sanctions|american sanctions|washington sanctions|sanctions on iran)\b/.test(text)) {
    return true;
  }
  if (hasIran && hasUs && /\b(military|diplomacy|sanctions|threats|negotiations)\b/.test(text)) {
    return true;
  }
  return false;
}

function includesHormuzShipping(text) {
  return (
    /\bstrait of hormuz\b/.test(text) ||
    (/\bhormuz\b/.test(text) && /\b(shipping|tanker|tankers|route|routes)\b/.test(text)) ||
    (/\b(shipping disruption|maritime|tanker)\b/.test(text) && /\b(oil|energy|supply)\b/.test(text))
  );
}

function includesFedGeneral(text) {
  if (/\b(fomc|interest rate decision|rate decision|cme fedwatch)\b/i.test(text)) {
    return false;
  }
  return /\b(federal reserve|fed chair|fed officials|monetary policy|central bank)\b/i.test(text);
}

function includesChinaMarkets(text) {
  return /\b(china|chinese|beijing|shanghai|pboc|yuan|renminbi)\b/i.test(text);
}

function includesCrypto(text) {
  return /\b(bitcoin|btc|ethereum|eth|crypto|cryptocurrency|digital assets?|blockchain)\b/i.test(text);
}

function includesGold(text) {
  return /\b(gold|xau|precious metals?|bullion)\b/i.test(text);
}

function includesUsd(text) {
  return /\b(us dollar|dollar|usd|dxy|greenback|forex|fx markets?)\b/i.test(text);
}

function includesUsEconomy(text) {
  return /\b(us economy|u\.s\. economy|american economy|united states economy)\b/i.test(text);
}

function includesGeopolitics(text) {
  if (includesIranUsContext(text)) {
    return false;
  }
  return /\b(geopolitic|diplomatic|sanctions|summit|nato|un security|foreign policy|global tensions)\b/i.test(
    text
  );
}

function classifyOilDirection(text) {
  const hasOil = OIL_TERMS.test(text);
  if (!hasOil) {
    return null;
  }
  const up = OIL_UP_TERMS.test(text);
  const down = OIL_DOWN_TERMS.test(text);
  if (up && !down) {
    return "oil-up";
  }
  if (down && !up) {
    return "oil-down";
  }
  return null;
}

function classifyEquityDirection(text) {
  const hasMarket =
    /\b(global markets?|stock markets?|equities|wall street|s&p|nasdaq|dow)\b/i.test(text) ||
    /\b(risk-on|risk-off)\b/i.test(text);
  if (!hasMarket) {
    return null;
  }
  const up = EQUITY_UP_TERMS.test(text);
  const down = EQUITY_DOWN_TERMS.test(text);
  if (up && !down) {
    return "global-markets-up";
  }
  if (down && !up) {
    return "global-markets-down";
  }
  return null;
}

/**
 * @param {string} sourceText
 * @param {{ allowStructuredEconomic?: boolean }} [options]
 * @returns {{ category: string|null, reason: string, confidence: 'high'|'medium'|'low', directional: boolean }}
 */
function resolveIranUsRoutingVariant(text) {
  const normalized = normalizeInput(text);
  if (/negotiat|diplomacy|diplomatic talks|peace talks|begin talks|resume talks/.test(normalized)) {
    return "diplomatic";
  }
  if (/\b(sanctions?|policy|measures against iran|sanctions on iran)\b/.test(normalized)) {
    return "sanctions";
  }
  if (
    /\b(military|strike|air strike|airstrike|aircraft|fighter|missile|threat|escalation|attack|naval|war|exchange threats)\b/.test(
      normalized
    )
  ) {
    return "military";
  }
  return "general";
}

function classifyGeneralNewsArtworkCategory(sourceText, options = {}) {
  const text = normalizeInput(sanitizeGeneralNewsClassificationText(sourceText));
  if (!text) {
    return {
      category: ROUTING_FALLBACK_CATEGORY,
      reason: "empty_source",
      confidence: "low",
      directional: false,
    };
  }

  if (!options.allowStructuredEconomic && STRUCTURED_ECONOMIC_RELEASE_HINT.test(text)) {
    return {
      category: null,
      reason: "structured_numeric_release_deferred_to_fast_lane",
      confidence: "high",
      directional: false,
    };
  }

  if (includesHormuzShipping(text)) {
    return { category: "hormuz-shipping", reason: "hormuz_shipping", confidence: "high", directional: false };
  }

  if (includesIranUsContext(text)) {
    return {
      category: "iran-us",
      reason: "iran_us_context",
      confidence: "high",
      directional: false,
      iranUsVariant: resolveIranUsRoutingVariant(text),
    };
  }

  const oilDirection = classifyOilDirection(text);
  if (oilDirection) {
    return { category: oilDirection, reason: "explicit_oil_direction", confidence: "high", directional: true };
  }
  if (OIL_TERMS.test(text)) {
    return {
      category: ROUTING_FALLBACK_CATEGORY,
      reason: "oil_direction_ambiguous",
      confidence: "medium",
      directional: false,
    };
  }

  if (includesGold(text)) {
    return { category: "gold", reason: "gold_keywords", confidence: "high", directional: false };
  }

  if (includesUsd(text)) {
    return { category: "usd", reason: "usd_keywords", confidence: "high", directional: false };
  }

  if (includesFedGeneral(text)) {
    return { category: "fed-general", reason: "fed_general_commentary", confidence: "high", directional: false };
  }

  if (includesChinaMarkets(text)) {
    return { category: "china-markets", reason: "china_markets", confidence: "high", directional: false };
  }

  if (includesCrypto(text)) {
    return { category: "crypto", reason: "crypto_keywords", confidence: "high", directional: false };
  }

  const equityDirection = classifyEquityDirection(text);
  if (equityDirection) {
    return {
      category: equityDirection,
      reason: "explicit_equity_direction",
      confidence: "high",
      directional: true,
    };
  }

  if (includesUsEconomy(text)) {
    return { category: "us-economy", reason: "us_economy", confidence: "medium", directional: false };
  }

  if (includesGeopolitics(text)) {
    return { category: "geopolitics", reason: "geopolitics", confidence: "medium", directional: false };
  }

  return {
    category: ROUTING_FALLBACK_CATEGORY,
    reason: "general_economic_fallback",
    confidence: "low",
    directional: false,
  };
}

function isDirectionalCategory(category) {
  return DIRECTIONAL_CATEGORIES.has(category);
}

module.exports = {
  ROUTING_TAXONOMY,
  DIRECTIONAL_CATEGORIES,
  ROUTING_FALLBACK_CATEGORY,
  sanitizeGeneralNewsClassificationText,
  classifyGeneralNewsArtworkCategory,
  resolveIranUsRoutingVariant,
  isDirectionalCategory,
  classifyOilDirection,
  classifyEquityDirection,
};
