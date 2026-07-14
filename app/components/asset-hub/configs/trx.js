/** @type {import("./types").AssetHubConfig} */
export const trxAssetConfig = {
  id: "trx",
  slug: "trx",
  path: "/trx",
  name: "ترون",
  nameEn: "TRON",
  symbol: "TRX",
  tradingViewSymbol: "BINANCE:TRXUSDT",
  chartSymbol: "TRXUSDT",
  chartExchange: "BINANCE",
  pricePairLabel: "TRX / USDT",
  category: "crypto",
  categoryLabel: "العملات الرقمية",
  categoryPath: "/crypto",
  hero: {
    badge: "Crypto Extended Hub — TRON",
    title: "ترون (TRX)",
    description:
      "مركز معلومات متكامل لترون: السعر المباشر، الشارت، ملخص السوق، آخر الأخبار والتحليلات، والخدمات المرتبطة — ضمن HasaN CharT World.",
    accentRgb: "255,0,19",
  },
  description: {
    marketSummary:
      "ترون بلوكتشين يركز على المحتوى والترفيه والمدفوعات الرقمية وStablecoins، وتتأثر حركته بنشاط الشبكة والتدفقات على USDT.",
    tradingHours: "24 / 7",
    platform: "Binance",
  },
  news: {
    keywords: ["tron", "trx", "ترون", "usdt tron"],
    tagHref: "/news/tag/crypto",
    archiveLabel: "أرشيف أخبار الكريبتو",
  },
  analysis: {
    keywords: ["trx", "tron", "ترون", "trxusdt"],
  },
  faq: [
    {
      q: "ما هو ترون (TRX)؟",
      a: "ترون شبكة بلوكتشين تستهدف المحتوى الرقمي والمدفوعات اللامركزية ونقل Stablecoins.",
    },
    {
      q: "كيف أتابع سعر ترون؟",
      a: "عبر السعر المباشر وشارت TradingView في صفحة TRX.",
    },
    {
      q: "هل توفر المنصة تحليلات TRX؟",
      a: "نعم، عبر التحليلات اليومية وخدمات VIP وطلب تحليل مخصص.",
    },
    {
      q: "كيف أنشئ تنبيه سعري لترون؟",
      a: "انتقل إلى صفحة التنبيهات وأنشئ تنبيهاً لزوج TRX/USDT.",
    },
    {
      q: "أين أجد أخبار ترون؟",
      a: "في قسم الأخبار المفلترة في صفحة TRX أو عبر أخبار الكريبتو.",
    },
  ],
  relatedAssets: [
    { symbol: "BTC", name: "البيتكوين", description: "المرجع الرئيسي لسوق الكريبتو.", href: "/btc" },
    { symbol: "ETH", name: "الإيثيريوم", description: "منصة العقود الذكية الرائدة.", href: "/eth" },
    { symbol: "BNB", name: "BNB", description: "عملة منصة Binance.", href: "/bnb" },
    { symbol: "XRP", name: "ريبل", description: "عملة رقمية للمدفوعات.", href: "/xrp" },
  ],
  links: {
    internal: [
      { label: "الأسواق المالية", href: "/markets" },
      { label: "العملات الرقمية", href: "/crypto" },
      { label: "تحليل الكريبتو", href: "/crypto-analysis" },
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "طلب تحليل", href: "/analysis/request" },
      { label: "التنبيهات", href: "/alerts" },
      { label: "VIP Spot", href: "/vip-spot" },
    ],
    jsonLd: [
      { name: "ترون TRX", url: "/trx" },
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
      description: "توصيات لتداول ترون والكريبتو في السوق الفوري.",
      href: "/vip-spot",
      cta: "استكشف VIP Spot",
    },
    {
      icon: "⚡",
      title: "VIP Futures",
      description: "إشارات عقود ترون الآجلة.",
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
    title: "HasaN CharT World | ترون TRX — مركز المعلومات",
    description:
      "مركز معلومات ترون: السعر المباشر، شارت TradingView، ملخص السوق، أخبار وتحليلات TRX، التنبيهات السعرية وخدمات VIP.",
    keywords: ["HasaN CharT World", "ترون", "TRX", "TRON", "سعر TRX", "تحليل TRON"],
  },
  jsonLd: {
    productName: "TRON",
    alternateNames: ["TRX", "ترون"],
    productCategory: "Cryptocurrency",
    itemListName: "مركز معلومات ترون في HasaN CharT World",
    fragmentId: "tron",
  },
  breadcrumbs: [
    { label: "الرئيسية", href: "/" },
    { label: "الأسواق المالية", href: "/markets" },
    { label: "العملات الرقمية", href: "/crypto" },
    { label: "ترون", href: "/trx" },
  ],
};
