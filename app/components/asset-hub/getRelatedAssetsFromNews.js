import { NEWS_ASSET_MATCHING_INDEX } from "../../../lib/news-asset-matching-index.js";
import { detectNewsCategory } from "../../../lib/news-images.js";

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
    path: "/gold",
    kind: "market",
  },
  metalInstrument: {
    id: "market-xauusd",
    symbol: "XAUUSD",
    name: "XAU/USD",
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
  gold: ["silver"],
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
  {
    pattern: /(?:^|[^a-z])crypto(?:[^a-z]|$)|cryptocurrency|blockchain|كريبتو|عملات رقمية|digital assets/i,
    assets: ["btc"],
    market: "crypto",
  },
  { pattern: /ethereum|eth|إيثريوم|إيثيريوم/i, assets: ["eth", "btc"], market: "crypto" },
  { pattern: /solana|\bsol\b|سولانا/i, assets: ["sol"], market: "crypto" },
  { pattern: /ripple|\bxrp\b|ريبل/i, assets: ["xrp"], market: "crypto" },
  {
    pattern: /xau\s*\/?\s*usd|xauusd|gold\s*\/?\s*usd|زوج\s*الذهب\s*مقابل/i,
    assets: ["xauusd"],
    market: "metalInstrument",
    score: 6,
  },
  {
    pattern: /(?:^|[^a-z])gold(?:[^a-z]|$)|ذهب|الذهب|سوق\s*الذهب|أسعار\s*الذهب|أونصة/i,
    assets: ["gold"],
    market: "metal",
    score: 5,
  },
  { pattern: /oil|brent|crude|opec|نفط|أوبك/i, assets: ["oil"], market: "energy" },
  { pattern: /eurusd|eur\/usd|اليورو.*دولار/i, assets: ["eurusd"], market: "forex" },
  { pattern: /nasdaq|ناسداك/i, assets: ["nasdaq"], market: "indices" },
  { pattern: /forex|فوركس/i, assets: ["eurusd"], market: "forex" },
  {
    pattern: /fed|powell|federal reserve|interest rate|فيدرالي|الفائدة|باول/i,
    assets: ["dxy"],
    market: "forex",
  },
];

const WEAK_DOLLAR_KEYWORDS = new Set(["dollar", "dollars", "الدولار", "دولار"]);
const MONETARY_AMOUNT_DOLLAR =
  /\d[\d,.]*\s*(?:million|billion|mln|bln|m|b)?\s*(?:dollar|dollars|usd|\$|دولار|مليون\s*دولار|مليار\s*دولار)/i;
const STRONG_FOREX_SIGNAL =
  /dxy|dollar index|us dollar index|مؤشر الدولار|forex|فوركس|eurusd|gbpusd|usdjpy|fed|federal reserve|فيدرالي|ecb|boj|central bank|البنك المركزي/i;

/** Minimum score for a match to be included in output. */
const MIN_CONFIDENCE_SCORE = 3;

/** Default cap for related asset links — validated via production replay. */
const DEFAULT_MAX_ITEMS = 3;

/** Never emit the /xau redirect alias from news related links. */
const FORBIDDEN_NEWS_PATHS = new Set(["/xau"]);

/**
 * @param {{ id?: string, path?: string }} item
 */
function resolveNewsAssetPath(item = {}) {
  if (item.id === "gold" || item.path === "/xau") {
    return "/gold";
  }

  return item.path;
}

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
 * @param {string} keyword
 */
function shouldSkipKeyword(text, keyword) {
  const normalizedKeyword = String(keyword).toLowerCase();
  if (!WEAK_DOLLAR_KEYWORDS.has(normalizedKeyword)) {
    return false;
  }

  if (!MONETARY_AMOUNT_DOLLAR.test(text)) {
    return false;
  }

  return !STRONG_FOREX_SIGNAL.test(text);
}

/**
 * @param {string} text
 * @param {string} symbol
 */
function symbolMatches(text, symbol) {
  if (!symbol) {
    return false;
  }

  const normalizedSymbol = String(symbol).toLowerCase();
  if (normalizedSymbol.length <= 4) {
    return new RegExp(`(?:^|[^a-z0-9])${normalizedSymbol}(?:[^a-z0-9]|$)`, "i").test(text);
  }

  return text.includes(normalizedSymbol);
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
    if (!normalizedKeyword) {
      continue;
    }

    const keywordMatches =
      normalizedKeyword.length <= 4
        ? symbolMatches(text, normalizedKeyword)
        : text.includes(normalizedKeyword);

    if (!keywordMatches) {
      continue;
    }

    if (
      (normalizedKeyword === "forex" || normalizedKeyword === "فوركس") &&
      config.category === "forex"
    ) {
      continue;
    }

    if (shouldSkipKeyword(text, normalizedKeyword)) {
      continue;
    }

    score += normalizedKeyword.length >= 4 ? 3 : 2;
  }

  const symbol = String(config.symbol || "").toLowerCase();
  const slug = String(config.slug || "").toLowerCase();
  const nameEn = String(config.nameEn || "").toLowerCase();

  if (symbolMatches(text, symbol)) score += 2;
  if (slug && (slug.length <= 4 ? symbolMatches(text, slug) : text.includes(slug))) score += 1;
  if (nameEn && text.includes(nameEn)) score += 2;

  return score;
}

/**
 * @param {Record<string, unknown>} newsItem
 * @param {{ maxItems?: number }} [options]
 * @returns {Array<{ id: string, symbol: string, name: string, path: string, kind: "asset" | "market", score: number, category?: string }>}
 */
export function getRelatedAssetsFromNews(newsItem = {}, options = {}) {
  const maxItems = options.maxItems ?? DEFAULT_MAX_ITEMS;
  const text = buildNewsSearchText(newsItem);
  const detectedCategory = detectNewsCategory(newsItem);
  const hasGoldInstrumentContext =
    /xau\s*\/?\s*usd|xauusd|gold\s*\/?\s*usd|زوج\s*الذهب\s*مقابل/i.test(text);
  /** @type {Map<string, { id: string, symbol: string, name: string, path: string, kind: "asset" | "market", score: number, category?: string }>} */
  const results = new Map();

  const addItem = (item, score) => {
    const path = resolveNewsAssetPath(item);
    if (FORBIDDEN_NEWS_PATHS.has(path)) {
      return;
    }

    const normalizedItem = { ...item, path };
    const existing = results.get(normalizedItem.id);
    if (!existing || existing.score < score) {
      results.set(normalizedItem.id, { ...normalizedItem, score });
    }
  };

  for (const config of Object.values(NEWS_ASSET_MATCHING_INDEX)) {
    if (config.id === "gold" && hasGoldInstrumentContext) {
      continue;
    }

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
      if (hasGoldInstrumentContext && companionId === "gold") {
        continue;
      }

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

  for (const { pattern, assets, market, score: patternScore = 5 } of EXPLICIT_TOPIC_PATTERNS) {
    if (market === "metal" && hasGoldInstrumentContext) {
      continue;
    }

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
        patternScore
      );
    }

    if (market && MARKET_PAGES[market]) {
      addItem({ ...MARKET_PAGES[market] }, Math.max(patternScore - 1, 4));
    }
  }

  const confidentAssetMatches = [...results.values()].filter(
    (item) => item.kind === "asset" && item.score >= MIN_CONFIDENCE_SCORE
  );

  if (confidentAssetMatches.length === 0) {
    return [];
  }

  if (hasGoldInstrumentContext) {
    for (const [id, item] of [...results.entries()]) {
      if (item.path === "/gold") {
        results.delete(id);
      }
    }
  }

  const matchedCategories = new Set(
    confidentAssetMatches.filter((item) => item.category).map((item) => item.category)
  );

  for (const category of matchedCategories) {
    let marketKey = CATEGORY_TO_MARKET[category];
    if (category === "metal" && hasGoldInstrumentContext) {
      marketKey = "metalInstrument";
    }

    if (marketKey && MARKET_PAGES[marketKey]) {
      addItem({ ...MARKET_PAGES[marketKey] }, 4);
    }
  }

  const topAssetScore = Math.max(...confidentAssetMatches.map((item) => item.score));
  if (topAssetScore >= MIN_CONFIDENCE_SCORE) {
    const marketFromCategory = NEWS_CATEGORY_TO_MARKET[detectedCategory];
    if (marketFromCategory && MARKET_PAGES[marketFromCategory]) {
      addItem({ ...MARKET_PAGES[marketFromCategory] }, 1);
    }
  }

  const ranked = [...results.values()]
    .filter((item) => !FORBIDDEN_NEWS_PATHS.has(item.path))
    .filter((item) => (item.kind === "market" ? item.score >= 2 : item.score >= MIN_CONFIDENCE_SCORE))
    .sort((a, b) => b.score - a.score);

  const seenPaths = new Set();
  const deduped = [];

  for (const item of ranked) {
    if (seenPaths.has(item.path)) {
      continue;
    }

    seenPaths.add(item.path);
    deduped.push(item);

    if (deduped.length >= maxItems) {
      break;
    }
  }

  return deduped;
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
