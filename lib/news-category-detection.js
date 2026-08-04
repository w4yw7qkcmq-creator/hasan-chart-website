/**
 * Heuristic news category/tag detection for list rows (title-first; optional content).
 */

export function detectNewsCategoryFromItem(item = {}) {
  const text = `${item.title || ""} ${item.content || ""}`.toLowerCase();

  if (/bitcoin|btc|crypto|ethereum/.test(text)) return "crypto";
  if (/gold|oil|silver|commodit|نفط|ذهب/.test(text)) return "commodities";
  if (/nasdaq|dow|s&p|stock|earnings|أسهم/.test(text)) return "stocks";
  if (/fed|inflation|cpi|pmi|gdp|jobs|فيدرالي|تضخم/.test(text)) return "economy";
  if (/iran|israel|war|ukraine|russia|gaza|جيوسياس/.test(text)) return "geopolitics";

  return "stocks";
}

export function matchesNewsTag(item = {}, tag = "") {
  const normalizedTag = String(tag || "").trim().toLowerCase();
  if (!normalizedTag) return false;

  const text = `${item.title || ""} ${item.content || ""} ${item.slug || ""}`.toLowerCase();

  const tagPatterns = {
    bitcoin: /bitcoin|btc|بيتكوين/,
    crypto: /crypto|ethereum|كريبتو|عملات رقمية/,
    gold: /gold|xau|ذهب/,
    oil: /oil|brent|crude|نفط/,
    fed: /fed|federal|فيدرالي|الفيدرالي/,
    inflation: /inflation|cpi|تضخم/,
    forex: /forex|usd|eur|gbp|jpy|فوركس|دولار|يورو/,
    stocks: /stocks|nasdaq|dow|s&p|earnings|أسهم|ناسداك/,
  };

  const pattern = tagPatterns[normalizedTag] || new RegExp(normalizedTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  return pattern.test(text);
}

export function filterNewsByCategory(items = [], category = "") {
  const key = String(category || "").trim();
  if (!key || key === "all") return items;
  return items.filter((item) => detectNewsCategoryFromItem(item) === key);
}

export function filterNewsByTag(items = [], tag = "") {
  return items.filter((item) => matchesNewsTag(item, tag));
}

export function filterNewsBySearch(items = [], query = "", { minLength = 2 } = {}) {
  const normalized = String(query || "").trim().toLowerCase();
  if (normalized.length < minLength) return items;
  return items.filter((item) => {
    const haystack = `${item.title || ""} ${item.slug || ""}`.toLowerCase();
    return haystack.includes(normalized);
  });
}
