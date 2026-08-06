/** @type {import("./types").AssetHubConfig} */
export const adaAssetConfig = {
  id: "ada",
  slug: "ada",
  path: "/ada",
  name: "كاردانو",
  nameEn: "Cardano",
  symbol: "ADA",
  tradingViewSymbol: "BINANCE:ADAUSDT",
  chartSymbol: "ADAUSDT",
  chartExchange: "BINANCE",
  pricePairLabel: "ADA / USDT",
  category: "crypto",
  categoryLabel: "العملات الرقمية",
  categoryPath: "/crypto",
  hero: {
    badge: "Asset Hub — Cardano",
    title: "كاردانو (ADA)",
    description:
      "مركز معلومات متكامل لكاردانو: السعر المباشر، الشارت، ملخص السوق، آخر الأخبار والتحليلات، والخدمات المرتبطة — ضمن HasaN CharT World.",
    accentRgb: "0,122,255",
  },
  description: {
    marketSummary:
      "كاردانو بلوكتشين يركز على البحث الأكاديمي والتطوير المنهجي، ويتأثر بتحديثات الشبكة وتبنّي التطبيقات اللامركزية.",
    tradingHours: "24 / 7",
    platform: "Binance",
  },
  news: {
    keywords: ["cardano", "ada", "كاردانو"],
    tagHref: "/news/tag/crypto",
    archiveLabel: "أرشيف أخبار الكريبتو",
  },
  analysis: {
    keywords: ["ada", "cardano", "كاردانو", "adausdt"],
  },
  faq: [
    {
      q: "ما هو كاردانو (ADA)؟",
      a: "كاردانو بلوكتشين لامركزي يدعم العقود الذكية والتطبيقات اللامركزية بمنهجية بحثية.",
    },
    {
      q: "كيف أتابع سعر كاردانو؟",
      a: "عبر السعر المباشر وشارت TradingView في صفحة ADA.",
    },
    {
      q: "هل توفر المنصة تحليلات ADA؟",
      a: "نعم، عبر التحليلات اليومية وخدمات VIP وطلب تحليل مخصص.",
    },
    {
      q: "كيف أنشئ تنبيه سعري لكاردانو؟",
      a: "انتقل إلى صفحة التنبيهات وأنشئ تنبيهاً لزوج ADA/USDT.",
    },
    {
      q: "أين أجد أخبار كاردانو؟",
      a: "في قسم الأخبار المفلترة في صفحة ADA أو عبر أخبار الكريبتو.",
    },
  ],
  relatedAssets: [
    { symbol: "BTC", name: "البيتكوين", description: "المرجع الرئيسي لسوق الكريبتو.", href: "/btc" },
    { symbol: "ETH", name: "الإيثيريوم", description: "منصة العقود الذكية.", href: "/crypto" },
    { symbol: "SOL", name: "سولانا", description: "بلوكتشين عالي الأداء.", href: "/crypto" },
    { symbol: "XAU", name: "الذهب", description: "ملاذ آمن عالمي.", href: "/gold" },
  ],
  links: {
    internal: [
      { label: "الأسواق المالية", href: "/markets" },
      { label: "العملات الرقمية", href: "/crypto" },
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "طلب تحليل", href: "/analysis/request" },
      { label: "التنبيهات", href: "/alerts" },
      { label: "VIP Spot", href: "/vip-spot" },
    ],
    jsonLd: [
      { name: "كاردانو ADA", url: "/ada" },
      { name: "العملات الرقمية", url: "/crypto" },
      { name: "البيتكوين", url: "/btc" },
      { name: "التحليلات اليومية", url: "/daily-analysis" },
    ],
    marketSummary: [
      { label: "سوق الكريبتو", href: "/crypto" },
      { label: "أخبار الكريبتو", href: "/news/tag/crypto" },
      { label: "التحليل الفني", href: "/technical-analysis" },
    ],
  },
  services: [
    {
      icon: "💎",
      title: "VIP Spot",
      description: "توصيات لتداول كاردانو والكريبتو في السوق الفوري.",
      href: "/vip-spot",
      cta: "استكشف VIP Spot",
    },
    {
      icon: "⚡",
      title: "VIP Futures",
      description: "إشارات عقود ADA الآجلة.",
      href: "/vip-futures",
      cta: "استكشف VIP Futures",
    },
    {
      icon: "🛡️",
      title: "إدارة الحسابات",
      description: "إدارة محافظ الكريبتو.",
      href: "/account-management",
      cta: "إدارة الحسابات",
    },
  ],
  metadata: {
    title: "HasaN CharT World | كاردانو ADA — مركز المعلومات",
    description:
      "مركز معلومات كاردانو: السعر المباشر، شارت TradingView، ملخص السوق، أخبار وتحليلات ADA، التنبيهات السعرية وخدمات VIP.",
    keywords: ["HasaN CharT World", "كاردانو", "ADA", "Cardano", "سعر كاردانو"],
  },
  jsonLd: {
    productName: "Cardano",
    alternateNames: ["ADA", "كاردانو"],
    productCategory: "Cryptocurrency",
    itemListName: "مركز معلومات كاردانو في HasaN CharT World",
    fragmentId: "cardano",
  },
  breadcrumbs: [
    { label: "الرئيسية", href: "/" },
    { label: "الأسواق المالية", href: "/markets" },
    { label: "العملات الرقمية", href: "/crypto" },
    { label: "كاردانو", href: "/ada" },
  ],
};
