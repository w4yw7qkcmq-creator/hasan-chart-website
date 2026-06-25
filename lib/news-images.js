const BLOCKED_IMAGE_PATTERNS =
  /source\.unsplash\.com|images\.unsplash\.com|unsplash\.com\/photo|placeholder|default\.png|sprite|avatar|logo\.|1x1|pixel\.gif|blank\.|data:image\/svg/i;

export const NEWS_CATEGORY_VISUALS = {
  crypto: {
    icon: "₿",
    label: "العملات الرقمية",
    subtitle: "بيتكوين • كريبتو • بلوكتشين",
    gradient: "from-orange-900 via-orange-950 to-slate-950",
  },
  commodities: {
    icon: "🛢️",
    label: "النفط والطاقة",
    subtitle: "نفط • ذهب • سلع",
    gradient: "from-yellow-900 via-amber-950 to-slate-950",
  },
  stocks: {
    icon: "↗",
    label: "الأسواق العالمية",
    subtitle: "أسهم • مؤشرات • وول ستريت",
    gradient: "from-emerald-950 via-green-900 to-slate-950",
  },
  economy: {
    icon: "🇺🇸",
    label: "الاقتصاد الأمريكي",
    subtitle: "فائدة • تضخم • وظائف",
    gradient: "from-blue-950 via-indigo-950 to-slate-950",
  },
  geopolitics: {
    icon: "🌍",
    label: "أخبار جيوسياسية",
    subtitle: "توترات • حروب • تأثيرات السوق",
    gradient: "from-red-950 via-red-900 to-slate-950",
  },
  markets: {
    icon: "📊",
    label: "تحديثات الأسواق",
    subtitle: "تحركات مؤثرة على التداول",
    gradient: "from-cyan-950 via-sky-950 to-slate-950",
  },
};

export function isBlockedNewsImageUrl(url) {
  const value = String(url || "").trim();
  if (!value) return true;
  if (value.startsWith("/app/assets/")) return true;
  return BLOCKED_IMAGE_PATTERNS.test(value);
}

export function normalizeNewsImageUrl(url) {
  const value = String(url || "").trim();
  if (!value || isBlockedNewsImageUrl(value)) return null;
  if (value.startsWith("//")) return `https:${value}`;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return null;
}

export function resolveNewsImageUrl(item) {
  const candidates = [
    item?.image_url,
    item?.image,
    item?.thumbnail_url,
    item?.thumbnail,
    item?.urlToImage,
    item?.url_to_image,
    item?.media_url,
    item?.source_image_url,
    item?.og_image,
    item?.cover_image,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeNewsImageUrl(candidate);
    if (normalized) return normalized;
  }

  return null;
}

export function detectNewsCategory(item) {
  const text = `${item?.title || ""} ${item?.content || ""} ${item?.topic_cluster || ""}`.toLowerCase();

  if (/bitcoin|btc|crypto|ethereum|بيتكوين|كريبتو/.test(text)) return "crypto";
  if (/gold|oil|silver|commodit|ذهب|نفط/.test(text)) return "commodities";
  if (/stock|nasdaq|dow|s&p|earnings|أسهم|ناسداك/.test(text)) return "stocks";
  if (/fed|inflation|jobs|cpi|pmi|gdp|فيدرالي|تضخم/.test(text)) return "economy";
  if (/iran|israel|war|gaza|ukraine|russia|حرب|إيران/.test(text)) return "geopolitics";

  return "markets";
}

export function getNewsCategoryVisual(category) {
  return NEWS_CATEGORY_VISUALS[category] || NEWS_CATEGORY_VISUALS.markets;
}
