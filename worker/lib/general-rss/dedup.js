const { normalizeTitle } = require("./market-relevance");

const ENTITY_PATTERNS = [
  { entity: "iran", pattern: /\biran\b|tehran|إيران|ايران|طهران/i },
  { entity: "israel", pattern: /\bisrael\b|gaza|إسرائيل|اسرائيل|غزة/i },
  { entity: "trump", pattern: /\btrump\b|ترامب/i },
  { entity: "oil", pattern: /\boil\b|crude|brent|wti|النفط|برنت/i },
  { entity: "gold", pattern: /\bgold\b|xau|الذهب/i },
  { entity: "bitcoin", pattern: /\bbitcoin\b|\bbtc\b|البيتكوين|بيتكوين/i },
  { entity: "crypto_etf", pattern: /crypto etf|bitcoin etf|spot etf|etf approval|صندوق etf/i },
  { entity: "fed", pattern: /\bfed\b|fomc|federal reserve|الفيدرالي/i },
  { entity: "powell", pattern: /\bpowell\b|باول/i },
  { entity: "warsh", pattern: /\bwarsh\b|وارش/i },
  { entity: "barkin", pattern: /\bbarkin\b|بارkin/i },
  { entity: "nvidia", pattern: /\bnvidia\b|إنفيديا|انفيديا/i },
  { entity: "apple", pattern: /\bapple\b|آبل|ابل/i },
  { entity: "tesla", pattern: /\btesla\b|تسلا/i },
  { entity: "hormuz", pattern: /hormuz|هرمز|strait of hormuz/i },
  { entity: "ukraine", pattern: /\bukraine\b|kyiv|أوكرانيا|اوكرانيا/i },
  { entity: "russia", pattern: /\brussia\b|moscow|روسيا/i },
];

const EVENT_PATTERNS = [
  { type: "price_move", pattern: /surge|jump|fall|drop|plunge|rally|selloff|liquidation|reaction|price|هبوط|ارتفاع|تصحيح/i },
  { type: "attack", pattern: /attack|missile|airstrike|strike|drone|shell|هجوم|ضرب|صاروخ/i },
  { type: "statement", pattern: /says|said|states|warns|signals|comments|remarks|comments|صر[ّ]?ح|أعلن|قال/i },
  { type: "earnings", pattern: /earnings|eps|revenue|guidance|profit|results|أرباح|إيرادات/i },
  { type: "policy", pattern: /rate decision|sanctions|tariff|approval|decision|policy|قرار|عقوبات|تعرفة/i },
  { type: "negotiation", pattern: /talks|deal|agreement|negotiation|ceasefire|negotiations|مفاوضات|اتفاق|وقف/i },
  { type: "shipping", pattern: /tanker|shipping|port|vessel|maritime|hormuz|red sea|ناقلة|ممر|موانئ/i },
];

function extractEntities(text = "") {
  const value = String(text || "");
  return ENTITY_PATTERNS.filter((entry) => entry.pattern.test(value)).map((entry) => entry.entity);
}

function extractEventTypes(text = "") {
  const value = String(text || "");
  return EVENT_PATTERNS.filter((entry) => entry.pattern.test(value)).map((entry) => entry.type);
}

const CATALYST_PATTERNS = [
  { catalyst: "sanctions_escalation", pattern: /sanction|tariff|embargo|export ban|import ban|عقوب/i },
  { catalyst: "shipping_disruption", pattern: /hormuz|shipping|tanker|vessel|maritime|strait|lane|red sea|ممر|ناقل|موانئ/i },
  { catalyst: "price_move", pattern: /surge|jump|fall|drop|plunge|rally|retreat|slide|rebound|هبوط|ارتفاع|تراجع|تصحيح/i },
  { catalyst: "attack_escalation", pattern: /attack|missile|airstrike|strike|drone|shell|هجوم|ضرب|صاروخ/i },
  { catalyst: "negotiation", pattern: /talks|deal|agreement|negotiation|ceasefire|مفاوضات|اتفاق|وقف/i },
  { catalyst: "policy_decision", pattern: /rate decision|rate cut|rate hike|approval|decision|policy|قرار|فائدة/i },
];

function extractCatalysts(text = "") {
  const value = String(text || "");
  return CATALYST_PATTERNS.filter((entry) => entry.pattern.test(value)).map((entry) => entry.catalyst);
}

function normalizeActionKey(text = "") {
  const value = normalizeTitle(text);
  const actions = [];
  if (/sanction|tariff|embargo|عقوب/i.test(value)) actions.push("sanctions");
  if (/fall|drop|retreat|decline|slide|plunge|هبوط|تراجع/i.test(value)) actions.push("price_fall");
  if (/surge|jump|rally|rise|climb|ارتفاع|قفز/i.test(value)) actions.push("price_rise");
  if (/attack|missile|strike|drone|airstrike|هجوم|ضرب/i.test(value)) actions.push("attack");
  if (/close|closure|block|shutdown|إغلاق|اغلاق|إقفال/i.test(value)) actions.push("closure");
  if (/talks|deal|agreement|negotiation|مفاوضات|اتفاق/i.test(value)) actions.push("negotiation");
  if (/warn|threat|signal|حذر|تهديد/i.test(value)) actions.push("warning");
  return actions.sort().join("+") || value.slice(0, 48);
}

function buildRssEventFingerprint(item = {}) {
  const text = `${item.title || ""} ${item.contentSnippet || ""} ${item.summary || ""}`;
  const entities = extractEntities(text).sort();
  const events = extractEventTypes(text).sort();
  const catalysts = extractCatalysts(text).sort();
  const actionKey = normalizeActionKey(text);
  const normalized = normalizeTitle(item.title || text);

  if (entities.length && (events.length || catalysts.length)) {
    return `${entities.join("+")}|${events.join("+")}|${catalysts.join("+")}|${actionKey}`;
  }

  if (!entities.length && !events.length) {
    return normalized.slice(0, 80) || null;
  }

  return `${entities.join("+")}|${events.join("+")}|${catalysts.join("+")}|${normalized.slice(0, 60)}`;
}

function buildRssDuplicateKey(item = {}) {
  const text = `${item.title || ""} ${item.contentSnippet || ""} ${item.summary || ""}`;
  const entities = extractEntities(text).sort();
  const events = extractEventTypes(text).sort();
  const catalysts = extractCatalysts(text).sort();
  const actionKey = normalizeActionKey(text);
  return `${entities.join("+")}::${events.join("+")}::${catalysts.join("+")}::${actionKey}`;
}

function tokenOverlapRatio(a = "", b = "") {
  const wordsA = new Set(normalizeTitle(a).split(" ").filter((word) => word.length > 3));
  const wordsB = new Set(normalizeTitle(b).split(" ").filter((word) => word.length > 3));
  if (!wordsA.size || !wordsB.size) {
    return 0;
  }
  const common = [...wordsA].filter((word) => wordsB.has(word)).length;
  return common / Math.min(wordsA.size, wordsB.size);
}

function areTitlesNearDuplicate(titleA = "", titleB = "") {
  const normalizedA = normalizeTitle(titleA);
  const normalizedB = normalizeTitle(titleB);
  if (!normalizedA || !normalizedB) {
    return false;
  }

  if (
    normalizedA.includes(normalizedB.slice(0, 30)) ||
    normalizedB.includes(normalizedA.slice(0, 30))
  ) {
    return true;
  }

  return tokenOverlapRatio(titleA, titleB) >= 0.78;
}

function evaluateRssDuplicate(item = {}, publishedItems = [], recentTitles = []) {
  const fingerprint = buildRssEventFingerprint(item);
  const duplicateKey = buildRssDuplicateKey(item);
  const title = item.title || "";
  const link = item.link || "";

  if (link && publishedItems.some((published) => published.link === link)) {
    return {
      duplicate: true,
      reason: "same_source_link",
      fingerprint,
      duplicateKey,
    };
  }

  const sameFingerprint = publishedItems.find((published) => {
    const publishedFingerprint = published.rssEventFingerprint || buildRssEventFingerprint(published);
    return publishedFingerprint && fingerprint && publishedFingerprint === fingerprint;
  });

  if (sameFingerprint) {
    return {
      duplicate: true,
      reason: "same_event_fingerprint",
      fingerprint,
      duplicateKey,
    };
  }

  for (const recentTitle of recentTitles) {
    if (areTitlesNearDuplicate(title, recentTitle)) {
      const recentKey = buildRssDuplicateKey({ title: recentTitle });
      if (recentKey && duplicateKey && recentKey === duplicateKey) {
        return {
          duplicate: true,
          reason: "near_duplicate_same_event",
          fingerprint,
          duplicateKey,
        };
      }

      if (tokenOverlapRatio(title, recentTitle) >= 0.9) {
        return {
          duplicate: true,
          reason: "near_duplicate_title",
          fingerprint,
          duplicateKey,
        };
      }
    }
  }

  return {
    duplicate: false,
    reason: null,
    fingerprint,
    duplicateKey,
  };
}

function isDistinctMarketDevelopment(current = {}, previous = {}) {
  const currentKey = buildRssDuplicateKey(current);
  const previousKey = buildRssDuplicateKey(previous);
  if (!currentKey || !previousKey) {
    return true;
  }
  return currentKey !== previousKey;
}

module.exports = {
  extractEntities,
  extractEventTypes,
  extractCatalysts,
  normalizeActionKey,
  buildRssEventFingerprint,
  buildRssDuplicateKey,
  evaluateRssDuplicate,
  areTitlesNearDuplicate,
  isDistinctMarketDevelopment,
  tokenOverlapRatio,
};
