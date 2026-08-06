/** @type {import("./types").AssetHubConfig} */
export const nearAssetConfig = {
  id: "near",
  slug: "near",
  path: "/near",
  name: "نير",
  nameEn: "NEAR Protocol",
  symbol: "NEAR",
  tradingViewSymbol: "BINANCE:NEARUSDT",
  chartSymbol: "NEARUSDT",
  chartExchange: "BINANCE",
  pricePairLabel: "NEAR / USDT",
  category: "crypto",
  categoryLabel: "العملات الرقمية",
  categoryPath: "/crypto",
  hero: {
    badge: "Crypto Growth Hub — NEAR Protocol",
    title: "نير (NEAR)",
    description:
      "مركز معلومات متكامل لنير: السعر المباشر، الشارت، ملخص السوق، آخر الأخبار والتحليلات، والخدمات المرتبطة — ضمن HasaN CharT World.",
    accentRgb: "0,0,0",
  },
  description: {
    marketSummary:
      "NEAR بلوكتشين Layer 1 يستهدف التطبيقات اللامركزية بمعاملات سريعة وتجربة مستخدم مبسطة، وتتأثر حركته بزخم النظام البيئي.",
    tradingHours: "24 / 7",
    platform: "Binance",
  },
  news: {
    keywords: ["near", "near protocol", "نير"],
    tagHref: "/news/tag/crypto",
    archiveLabel: "أرشيف أخبار الكريبتو",
  },
  analysis: { keywords: ["near", "near protocol", "نير", "nearusdt"] },
  faq: [
    {
      q: "ما هو NEAR Protocol؟",
      a: "NEAR بلوكتشين Layer 1 يدعم العقود الذكية والتطبيقات اللامركزية بتجربة مستخدم سهلة.",
    },
    {
      q: "كيف أتابع سعر نير؟",
      a: "عبر السعر المباشر وشارت TradingView في صفحة NEAR.",
    },
    {
      q: "هل توفر المنصة تحليلات NEAR؟",
      a: "نعم، عبر التحليلات اليومية وخدمات VIP وطلب تحليل مخصص.",
    },
    {
      q: "كيف أنشئ تنبيه سعري لنير؟",
      a: "انتقل إلى صفحة التنبيهات وأنشئ تنبيهاً لزوج NEAR/USDT.",
    },
    {
      q: "أين أجد أخبار نير؟",
      a: "في قسم الأخبار المفلترة في صفحة NEAR أو عبر أخبار الكريبتو.",
    },
  ],
  relatedAssets: [
    {
      symbol: "ETH",
      name: "الإيثيريوم",
      description: "منصة العقود الذكية الرائدة.",
      href: "/eth",
    },
    {
      symbol: "SOL",
      name: "سولانا",
      description: "بلوكتشين عالي الأداء.",
      href: "/sol",
    },
    {
      symbol: "AVAX",
      name: "أفالانش",
      description: "بلوكتشين متعدد السلاسل.",
      href: "/avax",
    },
    {
      symbol: "ARB",
      name: "أربيتروم",
      description: "Layer 2 لإيثيريوم.",
      href: "/arb",
    },
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
      { name: "نير NEAR", url: "/near" },
      { name: "العملات الرقمية", url: "/crypto" },
      { name: "الإيثيريوم", url: "/eth" },
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
      description: "توصيات لتداول نير والكريبتو في السوق الفوري.",
      href: "/vip-spot",
      cta: "استكشف VIP Spot",
    },
    {
      icon: "⚡",
      title: "VIP Futures",
      description: "إشارات عقود نير الآجلة.",
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
    title: "HasaN CharT World | نير NEAR — مركز المعلومات",
    description:
      "مركز معلومات NEAR: السعر المباشر، شارت TradingView، ملخص السوق، أخبار وتحليلات NEAR، التنبيهات السعرية وخدمات VIP.",
    keywords: ["HasaN CharT World", "نير", "NEAR", "NEAR Protocol", "سعر NEAR"],
  },
  jsonLd: {
    productName: "NEAR Protocol",
    alternateNames: ["NEAR", "نير"],
    productCategory: "Cryptocurrency",
    itemListName: "مركز معلومات NEAR في HasaN CharT World",
    fragmentId: "near",
  },
  breadcrumbs: [
    { label: "الرئيسية", href: "/" },
    { label: "الأسواق المالية", href: "/markets" },
    { label: "العملات الرقمية", href: "/crypto" },
    { label: "نير", href: "/near" },
  ],
};
