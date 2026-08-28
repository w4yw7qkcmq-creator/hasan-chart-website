import { NEWS_ASSET_MATCHING_INDEX } from "../../../lib/news-asset-matching-index";
import { detectNewsCategory } from "../../../lib/news-images";

/** @type {Record<string, { id: string, symbol: string, name: string, path: string, kind: "market" }>} */
const MARKET_PAGES = {
  crypto: {
    id: "market-crypto",
    symbol: "CRYPTO",
    name: "العملات الرقمية",
    path: "/crypto",
    kind: "market",
  },
  forex: {
    id: "market-forex",
    symbol: "FOREX",
    name: "الفوركس",
    path: "/forex",
    kind: "market",
  },
  metal: {
    id: "market-gold",
    symbol: "GOLD",
    name: "الذهب",
    path: "/xauusd",
    kind: "market",
  },
  energy: {
    id: "market-oil",
    symbol: "OIL",
    name: "النفط",
    path: "/oil",
    kind: "market",
  },
  indices: {
    id: "market-stocks",
    symbol: "STOCKS",
    name: "الأسهم العالمية",
    path: "/stocks",
    kind: "market",
  },
  commodities: {
    id: "market-commodities",
    symbol: "COMMODITIES",
    name: "السلع",
    path: "/commodities",
    kind: "market",
  },
};

/** @type {Record<string, string[]>} */
const COMPANION_ASSETS = {
  btc: ["eth"],
  eth: ["btc"],
  gold: ["xauusd", "silver"],
  xauusd: ["gold"],
  silver: ["gold"],
};

const CATEGORY_TO_MARKET = {
  crypto: "crypto",
  forex: "forex",
  metal: "metal",
  energy: "energy",
  indices: "indices",
};

const NEWS_CATEGORY_TO_MARKET = {
  crypto: "crypto",
  commodities: "commodities",
  stocks: "indices",
  economy: "forex",
  geopolitics: "commodities",
};

const EXPLICIT_TOPIC_PATTERNS = [
  { pattern: /bitcoin|btc|بيتكوين/i, assets: ["btc", "eth"], market: "crypto" },
  { pattern: /ethereum|eth|إيثريوم|إيثيريوم/i, assets: ["eth", "btc"], market: "crypto" },
  { pattern: /solana|\bsol\b|سولانا/i, assets: ["sol"], market: "crypto" },
  { pattern: /ripple|\bxrp\b|ريبل/i, assets: ["xrp"], market: "crypto" },
  { pattern: /gold|xau|ذهب/i, assets: ["gold", "xauusd"], market: "metal" },
  { pattern: /oil|brent|crude|opec|نفط|أوبك/i, assets: ["oil"], market: "energy" },
  { pattern: /eurusd|eur\/usd|اليورو.*دولار/i, assets: ["eurusd"], market: "forex" },
  { pattern: /nasdaq|ناسداك/i, assets: ["nasdaq"], market: "indices" },
  { pattern: /forex|فوركس/i, assets: ["eurusd", "gbpusd"], market: "forex" },
];

/**
 * @param {Record<string, unknown>} newsItem
 */
function buildNewsSearchText(newsItem = {}) {
  const tags = Array.isArray(newsItem.tags)
    ? newsItem.tags.join(" ")
    : typeof newsItem.tags === "string"
      ? newsItem.tags
      : "";

  const category = newsItem.category || detectNewsCategory(newsItem);

  return `${newsItem.title || ""} ${newsItem.content || ""} ${newsItem.slug || ""} ${newsItem.topic_cluster || ""} ${tags} ${category}`.toLowerCase();
}

/**
 * @param {string} text
 * @param {import("../../../lib/news-asset-matching-index").NewsAssetMatchingEntry} config
 */
function scoreAssetMatch(text, config) {
  const keywords = config?.keywords || [];
  let score = 0;

  for (const keyword of keywords) {
    const normalizedKeyword = String(keyword).toLowerCase();
    if (normalizedKeyword && text.includes(normalizedKeyword)) {
      score += normalizedKeyword.length >= 4 ? 3 : 2;
    }
  }

  const symbol = String(config.symbol || "").toLowerCase();
  const slug = String(config.slug || "").toLowerCase();
  const nameEn = String(config.nameEn || "").toLowerCase();

  if (symbol && text.includes(symbol)) score += 2;
  if (slug && text.includes(slug)) score += 1;
  if (nameEn && text.includes(nameEn)) score += 2;

  return score;
}

/**
 * @param {Record<string, unknown>} newsItem
 * @param {{ maxItems?: number }} [options]
 * @returns {Array<{ id: string, symbol: string, name: string, path: string, kind: "asset" | "market", score: number, category?: string }>}
 */
export function getRelatedAssetsFromNews(newsItem = {}, options = {}) {
  const maxItems = options.maxItems ?? 8;
  const text = buildNewsSearchText(newsItem);
  const detectedCategory = detectNewsCategory(newsItem);
  /** @type {Map<string, { id: string, symbol: string, name: string, path: string, kind: "asset" | "market", score: number, category?: string }>} */
  const results = new Map();

  const addItem = (item, score) => {
    const existing = results.get(item.id);
    if (!existing || existing.score < score) {
      results.set(item.id, { ...item, score });
    }
  };

  for (const config of Object.values(NEWS_ASSET_MATCHING_INDEX)) {
    const score = scoreAssetMatch(text, config);
    if (score > 0) {
      addItem(
        {
          id: config.id,
          symbol: config.symbol,
          name: config.name,
          path: config.path,
          kind: "asset",
          category: config.category,
        },
        score
      );
    }
  }

  for (const [id, item] of [...results.entries()]) {
    if (item.kind !== "asset") continue;

    for (const companionId of COMPANION_ASSETS[id] || []) {
      const companion = NEWS_ASSET_MATCHING_INDEX[companionId];
      if (!companion) continue;

      addItem(
        {
          id: companion.id,
          symbol: companion.symbol,
          name: companion.name,
          path: companion.path,
          kind: "asset",
          category: companion.category,
        },
        Math.max(item.score - 1, 1)
      );
    }
  }

  for (const { pattern, assets, market } of EXPLICIT_TOPIC_PATTERNS) {
    if (!pattern.test(text)) continue;

    for (const assetId of assets) {
      const config = NEWS_ASSET_MATCHING_INDEX[assetId];
      if (!config) continue;

      addItem(
        {
          id: config.id,
          symbol: config.symbol,
          name: config.name,
          path: config.path,
          kind: "asset",
          category: config.category,
        },
        5
      );
    }

    if (market && MARKET_PAGES[market]) {
      addItem({ ...MARKET_PAGES[market] }, 4);
    }
  }

  const matchedCategories = new Set(
    [...results.values()]
      .filter((item) => item.kind === "asset" && item.category)
      .map((item) => item.category)
  );

  for (const category of matchedCategories) {
    const marketKey = CATEGORY_TO_MARKET[category];
    if (marketKey && MARKET_PAGES[marketKey]) {
      addItem({ ...MARKET_PAGES[marketKey] }, 2);
    }
  }

  const marketFromCategory = NEWS_CATEGORY_TO_MARKET[detectedCategory];
  if (marketFromCategory && MARKET_PAGES[marketFromCategory]) {
    addItem({ ...MARKET_PAGES[marketFromCategory] }, 1);
  }

  return [...results.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, maxItems);
}

/**
 * @param {Array<{ kind: "asset" | "market", symbol: string, name: string, path: string }>} relatedAssets
 * @returns {Array<{ label: string, description: string, href: string }>}
 */
export function getNewsFollowMarketLinks(relatedAssets = []) {
  const primary =
    relatedAssets.find((item) => item.kind === "asset") || relatedAssets[0];

  if (!primary) {
    return [];
  }

  return [
    {
      label: `صفحة ${primary.symbol}`,
      description: primary.name,
      href: primary.path,
    },
    {
      label: "إنشاء تنبيه سعري",
      description: "تابع السعر عند المستويات المهمة",
      href: "/alerts",
    },
    {
      label: "طلب تحليل",
      description: "احصل على رؤية مخصصة للسوق",
      href: "/analysis/request",
    },
    {
      label: "الاشتراكات",
      description: "خدمات HasaN CharT World",
      href: "/subscriptions",
    },
  ];
}
