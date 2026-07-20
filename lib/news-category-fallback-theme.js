import { detectNewsCategory } from "./news-images";

export const NEWS_FALLBACK_THEME_KEYS = {
  crypto: "crypto",
  economy: "economy",
  stocks: "stocks",
  markets: "markets",
  commoditiesGold: "commodities_gold",
  oilEnergy: "oil_energy",
  geopolitics: "geopolitics",
  breaking: "breaking",
  forex: "forex",
  default: "default",
};

export const NEWS_CATEGORY_FALLBACK_THEMES = {
  [NEWS_FALLBACK_THEME_KEYS.crypto]: {
    label: "العملات الرقمية",
    icon: "₿",
    cssClass: "news-fallback-cover--crypto",
  },
  [NEWS_FALLBACK_THEME_KEYS.economy]: {
    label: "الاقتصاد الأمريكي",
    icon: "🇺🇸",
    cssClass: "news-fallback-cover--economy",
  },
  [NEWS_FALLBACK_THEME_KEYS.stocks]: {
    label: "الأسواق العالمية",
    icon: "📈",
    cssClass: "news-fallback-cover--stocks",
  },
  [NEWS_FALLBACK_THEME_KEYS.markets]: {
    label: "الأسواق العالمية",
    icon: "📊",
    cssClass: "news-fallback-cover--markets",
  },
  [NEWS_FALLBACK_THEME_KEYS.commoditiesGold]: {
    label: "الذهب والسلع",
    icon: "🥇",
    cssClass: "news-fallback-cover--commodities-gold",
  },
  [NEWS_FALLBACK_THEME_KEYS.oilEnergy]: {
    label: "النفط والطاقة",
    icon: "🛢️",
    cssClass: "news-fallback-cover--oil-energy",
  },
  [NEWS_FALLBACK_THEME_KEYS.geopolitics]: {
    label: "أخبار جيوسياسية",
    icon: "🌍",
    cssClass: "news-fallback-cover--geopolitics",
  },
  [NEWS_FALLBACK_THEME_KEYS.breaking]: {
    label: "خبر عاجل",
    icon: "⚡",
    cssClass: "news-fallback-cover--breaking",
  },
  [NEWS_FALLBACK_THEME_KEYS.forex]: {
    label: "الفوركس",
    icon: "💱",
    cssClass: "news-fallback-cover--forex",
  },
  [NEWS_FALLBACK_THEME_KEYS.default]: {
    label: "أخبار الأسواق",
    icon: "📰",
    cssClass: "news-fallback-cover--default",
  },
};

function getNewsText(item = {}) {
  return `${item?.title || ""} ${item?.content || ""}`.toLowerCase();
}

function resolveCategoryThemeKey(item = {}, category = null) {
  const text = getNewsText(item);
  const resolvedCategory = category || detectNewsCategory(item);

  if (/forex|usd\/|eur\/|gbp\/|jpy|dollar|فوركس|الدولار|اليورو|عملات/.test(text)) {
    return NEWS_FALLBACK_THEME_KEYS.forex;
  }

  if (resolvedCategory === "commodities") {
    if (/oil|brent|crude|opec|energy|gas|نفط|طاقة|أوبك|هرمز/.test(text)) {
      return NEWS_FALLBACK_THEME_KEYS.oilEnergy;
    }

    if (/gold|xau|silver|metals|commodit|ذهب|فضة|معادن/.test(text)) {
      return NEWS_FALLBACK_THEME_KEYS.commoditiesGold;
    }

    return NEWS_FALLBACK_THEME_KEYS.oilEnergy;
  }

  if (resolvedCategory === "crypto") return NEWS_FALLBACK_THEME_KEYS.crypto;
  if (resolvedCategory === "economy") return NEWS_FALLBACK_THEME_KEYS.economy;
  if (resolvedCategory === "stocks") return NEWS_FALLBACK_THEME_KEYS.stocks;
  if (resolvedCategory === "geopolitics") return NEWS_FALLBACK_THEME_KEYS.geopolitics;
  if (resolvedCategory === "markets") return NEWS_FALLBACK_THEME_KEYS.markets;

  return NEWS_FALLBACK_THEME_KEYS.default;
}

export function resolveNewsFallbackThemeKey(item = {}, category = null) {
  if (item?.impact_level === "HIGH") {
    return NEWS_FALLBACK_THEME_KEYS.breaking;
  }

  return resolveCategoryThemeKey(item, category);
}


export function getNewsCategoryFallbackTheme(item = {}, options = {}) {
  const category = options.category || detectNewsCategory(item);
  const isUrgent = item?.impact_level === "HIGH";
  const themeKey = resolveCategoryThemeKey(item, category);
  const theme = NEWS_CATEGORY_FALLBACK_THEMES[themeKey] || NEWS_CATEGORY_FALLBACK_THEMES.default;
  const cssClass = isUrgent
    ? NEWS_CATEGORY_FALLBACK_THEMES[NEWS_FALLBACK_THEME_KEYS.breaking].cssClass
    : theme.cssClass;

  return {
    themeKey,
    categoryLabel: theme.label,
    icon: theme.icon,
    cssClass,
    isUrgent,
    category,
  };
}

export function truncateNewsFallbackTitle(title, maxLength = 96) {
  const value = String(title || "").trim();
  if (!value) return "خبر اقتصادي";
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trim()}…`;
}

export function formatNewsFallbackDate(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("ar-SY-u-nu-latn", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Damascus",
  }).format(date);
}
