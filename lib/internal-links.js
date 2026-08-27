import { detectNewsCategory } from "./news-images";
import { getPublicSeoPage } from "./public-seo-content";

export const SERVICES_HUB_PATH = "/subscriptions";

export const SERVICE_CATALOG = {
  "crypto-analysis": {
    label: "تحليل العملات الرقمية",
    href: "/crypto-analysis",
  },
  "forex-signals": {
    label: "إشارات الفوركس",
    href: "/forex-signals",
  },
  "account-management-service": {
    label: "إدارة الحسابات",
    href: "/account-management-service",
  },
  "trading-academy": {
    label: "أكاديمية التداول",
    href: "/trading-academy",
  },
  "vip-spot-signals": {
    label: "إشارات VIP Spot",
    href: "/vip-spot-signals",
  },
  "vip-futures-signals": {
    label: "إشارات VIP Futures",
    href: "/vip-futures-signals",
  },
  "vip-forex": {
    label: "VIP Forex",
    href: "/vip-forex",
  },
  "analysis-request": {
    label: "طلب تحليل",
    href: "/analysis/request",
  },
  subscriptions: {
    label: "الاشتراكات",
    href: "/subscriptions",
  },
  "partner-center": {
    label: "برنامج الشركاء",
    href: "/partner-center",
  },
};

const RELATED_BY_PAGE = {
  "crypto-analysis": [
    "forex-signals",
    "account-management-service",
    "trading-academy",
    "vip-spot-signals",
    "vip-futures-signals",
    "analysis-request",
    "subscriptions",
  ],
  "forex-signals": [
    "crypto-analysis",
    "account-management-service",
    "trading-academy",
    "vip-spot-signals",
    "vip-futures-signals",
    "vip-forex",
    "analysis-request",
    "subscriptions",
  ],
  "account-management": [
    "forex-signals",
    "trading-academy",
    "crypto-analysis",
    "vip-spot-signals",
    "analysis-request",
    "subscriptions",
  ],
  "account-management-service": [
    "forex-signals",
    "trading-academy",
    "crypto-analysis",
    "vip-spot-signals",
    "analysis-request",
    "subscriptions",
  ],
  "trading-academy": [
    "forex-signals",
    "account-management-service",
    "crypto-analysis",
    "vip-spot-signals",
    "analysis-request",
    "subscriptions",
  ],
  "vip-spot": [
    "vip-futures-signals",
    "crypto-analysis",
    "forex-signals",
    "analysis-request",
    "subscriptions",
  ],
  "vip-spot-signals": [
    "vip-futures-signals",
    "crypto-analysis",
    "forex-signals",
    "analysis-request",
    "subscriptions",
  ],
  "vip-futures": [
    "vip-spot-signals",
    "crypto-analysis",
    "forex-signals",
    "analysis-request",
    "subscriptions",
  ],
  "vip-futures-signals": [
    "vip-spot-signals",
    "vip-forex",
    "crypto-analysis",
    "forex-signals",
    "analysis-request",
    "subscriptions",
  ],
  "vip-forex": [
    "vip-spot-signals",
    "vip-futures-signals",
    "forex-signals",
    "analysis-request",
    "subscriptions",
  ],
  "analysis-request": [
    "crypto-analysis",
    "forex-signals",
    "vip-spot-signals",
    "vip-futures-signals",
    "subscriptions",
  ],
  subscriptions: [
    "crypto-analysis",
    "forex-signals",
    "vip-forex",
    "account-management-service",
    "trading-academy",
    "vip-spot-signals",
    "vip-futures-signals",
    "analysis-request",
  ],
  "partner-center": [
    "subscriptions",
    "forex-signals",
    "crypto-analysis",
    "trading-academy",
    "account-management-service",
  ],
};

export const POPULAR_SERVICE_KEYS = [
  "forex-signals",
  "crypto-analysis",
  "subscriptions",
  "vip-spot-signals",
  "vip-futures-signals",
  "account-management-service",
  "trading-academy",
  "analysis-request",
];

export const INTERNAL_LINK_PHRASES = [
  { phrase: "إشارات VIP Futures", href: "/vip-futures-signals" },
  { phrase: "إشارات VIP Spot", href: "/vip-spot-signals" },
  { phrase: "تحليل العملات الرقمية", href: "/crypto-analysis" },
  { phrase: "إدارة الحسابات", href: "/account-management-service" },
  { phrase: "أكاديمية التداول", href: "/trading-academy" },
  { phrase: "إشارات الفوركس", href: "/forex-signals" },
  { phrase: "طلب تحليل", href: "/analysis/request" },
  { phrase: "برنامج الشركاء", href: "/partner-center" },
  { phrase: "VIP Futures", href: "/vip-futures-signals" },
  { phrase: "VIP Spot", href: "/vip-spot-signals" },
  { phrase: "الاشتراكات", href: "/subscriptions" },
].sort((a, b) => b.phrase.length - a.phrase.length);

function resolveService(key) {
  return SERVICE_CATALOG[key] || null;
}

export function getRelatedServices(pageKey) {
  const keys = RELATED_BY_PAGE[pageKey] || [];
  const page = getPublicSeoPage(pageKey);
  const currentPath = page?.path;

  return keys
    .map(resolveService)
    .filter(Boolean)
    .filter((service) => service.href !== currentPath);
}

export function getPopularServices(pageKey) {
  const page = getPublicSeoPage(pageKey);
  const currentPath = page?.path;

  return POPULAR_SERVICE_KEYS.map(resolveService)
    .filter(Boolean)
    .filter((service) => service.href !== currentPath);
}

export function getServiceBreadcrumbs(pageKey) {
  const page = getPublicSeoPage(pageKey);

  if (!page) {
    return [];
  }

  const label =
    SERVICE_CATALOG[pageKey]?.label || page.eyebrow || page.heroTitle || page.title;

  return [
    { label: "الرئيسية", href: "/" },
    { label: "الخدمات", href: SERVICES_HUB_PATH },
    { label, href: page.path },
  ];
}

function getCryptoServiceLinks() {
  return [
    resolveService("crypto-analysis"),
    resolveService("vip-spot-signals"),
    resolveService("vip-futures-signals"),
    resolveService("analysis-request"),
  ].filter(Boolean);
}

function getForexServiceLinks() {
  return [
    resolveService("forex-signals"),
    resolveService("account-management-service"),
    resolveService("trading-academy"),
  ].filter(Boolean);
}

function getCommodityServiceLinks() {
  return [
    resolveService("forex-signals"),
    resolveService("account-management-service"),
    resolveService("trading-academy"),
  ].filter(Boolean);
}

export function getNewsTopicServiceLinks(news = {}) {
  const text = `${news.title || ""} ${news.content || ""} ${news.slug || ""}`.toLowerCase();

  const isBitcoin = /(bitcoin|btc|بيتكوين)/i.test(text);
  const isCrypto =
    isBitcoin || /(crypto|ethereum|blockchain|كريبتو|عملات رقمية)/i.test(text);
  const isForex = /(forex|usd|eur|gbp|jpy|dollar|فوركس|الدولار|اليورو)/i.test(text);
  const isGold = /(gold|xau|ذهب)/i.test(text);
  const isOil = /(oil|brent|crude|opec|hormuz|نفط|أوبك|هرمز)/i.test(text);

  if (isBitcoin || (isCrypto && !isForex && !isGold && !isOil)) {
    return getCryptoServiceLinks();
  }

  if (isForex && !isGold && !isOil) {
    return getForexServiceLinks();
  }

  if (isGold || isOil) {
    return getCommodityServiceLinks();
  }

  const category = detectNewsCategory(news);

  if (category === "crypto") {
    return getCryptoServiceLinks();
  }

  if (category === "commodities") {
    return getCommodityServiceLinks();
  }

  return getForexServiceLinks();
}
