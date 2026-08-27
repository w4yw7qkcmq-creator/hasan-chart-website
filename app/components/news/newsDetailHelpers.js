import { detectNewsCategory } from "../../../lib/news-images";

const CATEGORY_LABELS = {
  crypto: "العملات الرقمية",
  commodities: "النفط والطاقة",
  stocks: "الأسواق العالمية",
  economy: "الاقتصاد الأمريكي",
  geopolitics: "أخبار جيوسياسية",
  markets: "الأسواق المالية",
};

const TOPIC_TYPE_RULES = [
  { pattern: /inflation|cpi|pce|تضخم/i, label: "أخبار التضخم", watchTopic: "inflation" },
  {
    pattern: /fed|powell|rate|interest|federal reserve|فيدرالي|الفائدة|باول/i,
    label: "أخبار الفائدة",
    watchTopic: "rates",
  },
  { pattern: /oil|brent|crude|opec|نفط|أوبك/i, label: "أخبار النفط", watchTopic: "oil" },
  {
    pattern: /bitcoin|btc|crypto|ethereum|blockchain|بيتكوين|كريبتو|عملات رقمية/i,
    label: "أخبار الكريبتو",
    watchTopic: "crypto",
  },
];

const WATCH_POINTS_BY_TOPIC = {
  inflation: [
    { label: "الدولار الأمريكي", href: "/dxy", note: "تأثر قوة الدولار ببيانات التضخم" },
    { label: "الذهب", href: "/xauusd", note: "ملاذ آمن يتأثر بتوقعات الفائدة" },
    { label: "المؤشرات العالمية", href: "/stocks", note: "معنويات المخاطرة في الأسواق" },
    { label: "البيتكوين", href: "/btc", note: "تدفقات المخاطرة في الكريبتو" },
  ],
  rates: [
    { label: "الدولار الأمريكي", href: "/dxy", note: "أول استجابة لقرارات وإشارات الفائدة" },
    { label: "الذهب", href: "/xauusd", note: "يتأثر بمسار العائد والدولار" },
    { label: "الأسهم العالمية", href: "/stocks", note: "تقييم المخاطرة وتكلفة التمويل" },
    { label: "العملات الرقمية", href: "/crypto", note: "تدفقات السيولة والمخاطرة" },
  ],
  oil: [
    { label: "USOIL", href: "/usoil", note: "الأصل الأقرب مباشرة لخبر النفط" },
    { label: "الذهب", href: "/xauusd", note: "ارتباط السلع والتوترات الجيوسياسية" },
    { label: "الدولار الأمريكي", href: "/dxy", note: "تسعير النفط بالدولار" },
  ],
  crypto: [
    { label: "البيتكوين", href: "/btc", note: "المؤشر الرئيسي لسوق الكريبتو" },
    { label: "الإيثريوم", href: "/eth", note: "زخم السوق الرقمي العام" },
    { label: "سوق الكريبتو", href: "/crypto", note: "نظرة شاملة على السوق" },
  ],
};

/**
 * @param {Record<string, unknown>} news
 */
function buildNewsText(news = {}) {
  return `${news.title || ""} ${news.content || ""} ${news.slug || ""}`.toLowerCase();
}

/**
 * @param {Record<string, unknown>} news
 * @param {string} category
 */
export function getNewsTopicType(news = {}, category = "markets") {
  const text = buildNewsText(news);

  for (const rule of TOPIC_TYPE_RULES) {
    if (rule.pattern.test(text)) {
      return { label: rule.label, watchTopic: rule.watchTopic };
    }
  }

  return {
    label: CATEGORY_LABELS[category] || CATEGORY_LABELS.markets,
    watchTopic: category === "crypto" ? "crypto" : category === "commodities" ? "oil" : "rates",
  };
}

/**
 * @param {Array<{ symbol: string, name: string }>} relatedAssets
 * @param {string} category
 */
export function getAffectedMarketLabel(relatedAssets = [], category = "markets") {
  if (relatedAssets.length > 0) {
    return relatedAssets
      .slice(0, 4)
      .map((asset) => asset.symbol)
      .join(" • ");
  }

  return CATEGORY_LABELS[category] || CATEGORY_LABELS.markets;
}

/**
 * @param {string | null | undefined} impactLevel
 */
export function getImpactLevelLabel(impactLevel) {
  if (!impactLevel) return null;

  const labels = {
    HIGH: "تأثير عالي — عاجل",
    MEDIUM: "تأثير متوسط",
    LOW: "تأثير منخفض",
  };

  return labels[String(impactLevel).toUpperCase()] || null;
}

/**
 * @param {string | Date} value
 */
export function toNewsIsoDateTime(value) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

/**
 * @param {string | Date} value
 */
export function formatNewsDateTime(value) {
  if (!value) return null;

  return new Date(value).toLocaleString("ar-SA", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  });
}

/**
 * @param {Record<string, unknown>} news
 */
export function getNewsUpdatedAt(news = {}) {
  return news.updated_at || news.modified_at || news.last_updated_at || null;
}

/**
 * @param {Record<string, unknown>} news
 */
export function getNewsWatchPoints(news = {}) {
  const text = buildNewsText(news);
  const category = detectNewsCategory(news);

  for (const rule of TOPIC_TYPE_RULES) {
    if (rule.pattern.test(text)) {
      return WATCH_POINTS_BY_TOPIC[rule.watchTopic] || [];
    }
  }

  if (category === "crypto") {
    return WATCH_POINTS_BY_TOPIC.crypto;
  }

  if (category === "commodities") {
    return WATCH_POINTS_BY_TOPIC.oil;
  }

  if (category === "economy") {
    return WATCH_POINTS_BY_TOPIC.inflation;
  }

  return WATCH_POINTS_BY_TOPIC.rates;
}

/**
 * @param {boolean} hasRelatedAssets
 */
export function getNewsArticleCtas(hasRelatedAssets = false) {
  return [
    {
      label: "إنشاء تنبيه سعري",
      description: "تابع السعر عند المستويات المهمة",
      href: "/alerts",
      icon: "🔔",
    },
    {
      label: "طلب تحليل",
      description: "احصل على رؤية مخصصة للسوق",
      href: "/analysis/request",
      icon: "🧠",
    },
    {
      label: "مشاهدة الأصول المرتبطة",
      description: "انتقل لقسم الأسواق المتأثرة",
      href: hasRelatedAssets ? "#affected-markets" : "/assets",
      icon: "📊",
    },
    {
      label: "الاشتراك في VIP",
      description: "توصيات وخدمات احترافية",
      href: "/subscriptions",
      icon: "⭐",
    },
  ];
}
