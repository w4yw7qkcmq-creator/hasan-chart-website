/** @type {import("./types").AssetHubConfig} */
export const shibAssetConfig = {
  id: "shib",
  slug: "shib",
  path: "/shib",
  name: "شيبا إينو",
  nameEn: "Shiba Inu",
  symbol: "SHIB",
  tradingViewSymbol: "BINANCE:SHIBUSDT",
  chartSymbol: "SHIBUSDT",
  chartExchange: "BINANCE",
  pricePairLabel: "SHIB / USDT",
  category: "crypto",
  categoryLabel: "العملات الرقمية",
  categoryPath: "/crypto",
  hero: {
    badge: "Crypto Meme Hub — Shiba Inu",
    title: "شيبا إينو (SHIB)",
    description:
      "مركز معلومات متكامل لشيبا إينو: السعر المباشر، الشارت، ملخص السوق، آخر الأخبار والتحليلات، والخدمات المرتبطة — ضمن HasaN CharT World.",
    accentRgb: "255,153,0",
  },
  description: {
    marketSummary:
      "شيبا إينو عملة ميم مبنية على إيثيريوم، وتتأثر حركتها بزخم المجتمع ومعنويات سوق الميم كوينز واتجاه البيتكوين.",
    tradingHours: "24 / 7",
    platform: "Binance",
  },
  news: {
    keywords: ["shiba", "shib", "شيبا", "meme", "ميم"],
    tagHref: "/news/tag/crypto",
    archiveLabel: "أرشيف أخبار الكريبتو",
  },
  analysis: {
    keywords: ["shib", "shiba", "شيبا", "shibusdt"],
  },
  faq: [
    {
      q: "ما هو شيبا إينو (SHIB)؟",
      a: "شيبا إينو عملة ميم لامركزية على إيثيريوم، أُطلقت كمنافس لدوجكوين.",
    },
    {
      q: "كيف أتابع سعر شيبا إينو؟",
      a: "عبر السعر المباشر وشارت TradingView في صفحة SHIB.",
    },
    {
      q: "هل توفر المنصة تحليلات SHIB؟",
      a: "نعم، عبر التحليلات اليومية وخدمات VIP وطلب تحليل مخصص.",
    },
    {
      q: "كيف أنشئ تنبيه سعري لشيبا إينو؟",
      a: "انتقل إلى صفحة التنبيهات وأنشئ تنبيهاً لزوج SHIB/USDT.",
    },
    {
      q: "أين أجد أخبار شيبا إينو؟",
      a: "في قسم الأخبار المفلترة في صفحة SHIB أو عبر أخبار الكريبتو.",
    },
  ],
  relatedAssets: [
    { symbol: "DOGE", name: "دوجكوين", description: "عملة الميم الأصلية.", href: "/doge" },
    { symbol: "PEPE", name: "بيبي", description: "عملة ميم شهيرة.", href: "/pepe" },
    { symbol: "BTC", name: "البيتكوين", description: "المرجع الرئيسي لسوق الكريبتو.", href: "/btc" },
    { symbol: "ETH", name: "الإيثيريوم", description: "الشبكة الأساسية لـ SHIB.", href: "/eth" },
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
      { name: "شيبا إينو SHIB", url: "/shib" },
      { name: "العملات الرقمية", url: "/crypto" },
      { name: "دوجكوين", url: "/doge" },
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
      description: "توصيات لتداول شيبا إينو والكريبتو في السوق الفوري.",
      href: "/vip-spot",
      cta: "استكشف VIP Spot",
    },
    {
      icon: "⚡",
      title: "VIP Futures",
      description: "إشارات عقود شيبا إينو الآجلة.",
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
    title: "HasaN CharT World | شيبا إينو SHIB — مركز المعلومات",
    description:
      "مركز معلومات شيبا إينو: السعر المباشر، شارت TradingView، ملخص السوق، أخبار وتحليلات SHIB، التنبيهات السعرية وخدمات VIP.",
    keywords: ["HasaN CharT World", "شيبا إينو", "SHIB", "Shiba Inu", "ميم كوين", "سعر SHIB"],
  },
  jsonLd: {
    productName: "Shiba Inu",
    alternateNames: ["SHIB", "شيبا إينو"],
    productCategory: "Cryptocurrency",
    itemListName: "مركز معلومات شيبا إينو في HasaN CharT World",
    fragmentId: "shiba-inu",
  },
  breadcrumbs: [
    { label: "الرئيسية", href: "/" },
    { label: "الأسواق المالية", href: "/markets" },
    { label: "العملات الرقمية", href: "/crypto" },
    { label: "شيبا إينو", href: "/shib" },
  ],
};
