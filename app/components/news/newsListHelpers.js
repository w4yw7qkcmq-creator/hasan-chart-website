import { detectNewsCategory } from "../../../lib/news-images";
import { getRelatedAssetsFromNews } from "../asset-hub/getRelatedAssetsFromNews";

export const NEWS_LIST_FILTERS = [
  { key: "all", label: "الكل" },
  { key: "crypto", label: "العملات الرقمية" },
  { key: "forex", label: "الفوركس" },
  { key: "gold-commodities", label: "الذهب والسلع" },
  { key: "stocks", label: "الأسهم والمؤشرات" },
  { key: "economy", label: "الاقتصاد الأمريكي" },
  { key: "oil-energy", label: "النفط والطاقة" },
];

export const NEWS_HUB_LINKS = [
  { label: "الأخبار الاقتصادية", href: "/economic-news" },
  { label: "الكريبتو", href: "/crypto" },
  { label: "الفوركس", href: "/forex" },
  { label: "الذهب", href: "/gold" },
  { label: "النفط", href: "/oil" },
  { label: "الأسهم", href: "/stocks" },
  { label: "الأصول", href: "/assets" },
];

const CATEGORY_MARKET_LABELS = {
  crypto: "العملات الرقمية",
  commodities: "السلع والطاقة",
  stocks: "الأسهم والمؤشرات",
  economy: "الاقتصاد الأمريكي",
  geopolitics: "الجيوسياسية",
  markets: "الأسواق المالية",
};

/**
 * @param {Record<string, unknown>} item
 */
export function isMetalsNews(item) {
  const text = `${item?.title || ""} ${item?.content || ""} ${item?.topic_cluster || ""}`.toLowerCase();
  return /gold|silver|xau|xag|platinum|copper|metal|precious|ذهب|فضة|معادن|نحاس/.test(text);
}

/**
 * @param {Record<string, unknown>} item
 */
export function isForexNews(item) {
  const text = `${item?.title || ""} ${item?.content || ""} ${item?.topic_cluster || ""}`.toLowerCase();
  return /forex|eurusd|gbpusd|usdjpy|usdchf|audusd|nzdusd|usdcad|eur\/usd|gbp\/usd|فوركس|اليورو|الجنيه|الين|الدولار/.test(
    text
  );
}

/**
 * @param {Record<string, unknown>} item
 */
export function isOilEnergyNews(item) {
  const text = `${item?.title || ""} ${item?.content || ""} ${item?.topic_cluster || ""}`.toLowerCase();
  return /oil|brent|crude|opec|wti|natural gas|energy|نفط|أوبك|طاقة|هرمز/.test(text);
}

/**
 * @param {Record<string, unknown>} item
 */
export function isGoldCommoditiesNews(item) {
  const text = `${item?.title || ""} ${item?.content || ""} ${item?.topic_cluster || ""}`.toLowerCase();
  return (
    isMetalsNews(item) ||
    /commodit|silver|xag|سلع|ذهب|فضة/.test(text)
  );
}

/**
 * @param {Record<string, unknown>} item
 * @param {string} filterKey
 */
export function matchesNewsListFilter(item, filterKey) {
  if (filterKey === "all") return true;
  if (filterKey === "crypto") return detectNewsCategory(item) === "crypto";
  if (filterKey === "forex") return isForexNews(item);
  if (filterKey === "gold-commodities") return isGoldCommoditiesNews(item);
  if (filterKey === "stocks") return detectNewsCategory(item) === "stocks";
  if (filterKey === "economy") return detectNewsCategory(item) === "economy";
  if (filterKey === "oil-energy") return isOilEnergyNews(item);
  return true;
}

/**
 * @param {Record<string, unknown>} item
 */
export function getNewsCardAssets(item) {
  return getRelatedAssetsFromNews(item, { maxItems: 5 })
    .filter((asset) => asset.kind === "asset")
    .map((asset) => asset.symbol)
    .slice(0, 4);
}

/**
 * @param {Record<string, unknown>} item
 */
export function getNewsMarketLabel(item) {
  const relatedAssets = getRelatedAssetsFromNews(item, { maxItems: 3 });
  const marketAsset = relatedAssets.find((asset) => asset.kind === "market");

  if (marketAsset) {
    return marketAsset.name;
  }

  const primaryAsset = relatedAssets.find((asset) => asset.kind === "asset");
  if (primaryAsset) {
    return primaryAsset.name;
  }

  const category = detectNewsCategory(item);
  if (category === "commodities" && isMetalsNews(item)) {
    return "الذهب والمعادن";
  }

  return CATEGORY_MARKET_LABELS[category] || CATEGORY_MARKET_LABELS.markets;
}

/**
 * @param {Array<Record<string, unknown>>} items
 * @param {number} [limit]
 */
export function getHighImpactNews(items = [], limit = 4) {
  const highImpact = items.filter((item) => String(item.impact_level || "").toUpperCase() === "HIGH");
  if (highImpact.length > 0) {
    return highImpact.slice(0, limit);
  }

  const importantByTopic = items.filter((item) => {
    const text = `${item?.title || ""} ${item?.content || ""}`.toLowerCase();
    return /عاجل|هام|urgent|breaking|فيدرالي|bitcoin|btc|gold|xau|oil|nasdaq|تضخم|cpi|فائدة/.test(
      text
    );
  });

  if (importantByTopic.length > 0) {
    return importantByTopic.slice(0, limit);
  }

  return items.slice(0, limit);
}

/**
 * @param {Record<string, unknown>} item
 * @param {string} query
 * @param {(item: Record<string, unknown>) => string} getTitle
 */
export function matchesNewsSearch(item, query, getTitle) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (!normalizedQuery) return true;

  const haystack = `${getTitle(item)} ${item?.title || ""} ${item?.content || ""} ${item?.slug || ""}`.toLowerCase();
  return haystack.includes(normalizedQuery);
}
