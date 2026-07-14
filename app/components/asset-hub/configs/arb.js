/** @type {import("./types").AssetHubConfig} */
export const arbAssetConfig = {
  id: "arb",
  slug: "arb",
  path: "/arb",
  name: "أربيتروم",
  nameEn: "Arbitrum",
  symbol: "ARB",
  tradingViewSymbol: "BINANCE:ARBUSDT",
  chartSymbol: "ARBUSDT",
  chartExchange: "BINANCE",
  pricePairLabel: "ARB / USDT",
  category: "crypto",
  categoryLabel: "العملات الرقمية",
  categoryPath: "/crypto",
  hero: {
    badge: "Crypto Growth Hub — Arbitrum",
    title: "أربيتروم (ARB)",
    description:
      "مركز معلومات متكامل لأربيتروم: السعر المباشر، الشارت، ملخص السوق، آخر الأخبار والتحليلات، والخدمات المرتبطة — ضمن HasaN CharT World.",
    accentRgb: "40,160,240",
  },
  description: {
    marketSummary:
      "Arbitrum من أكبر حلول Layer 2 لإيثيريوم، يخفّض رسوم المعاملات ويسرّع DeFi والتطبيقات اللامركزية، وتتأثر حركة ARB بحجم النشاط على الشبكة.",
    tradingHours: "24 / 7",
    platform: "Binance",
  },
  news: {
    keywords: ["arbitrum", "arb", "أربيتروم", "layer 2", "l2"],
    tagHref: "/news/tag/crypto",
    archiveLabel: "أرشيف أخبار الكريبتو",
  },
  analysis: {
    keywords: ["arb", "arbitrum", "أربيتروم", "arbusdt"],
  },
  faq: [
    {
      q: "ما هو Arbitrum (ARB)؟",
      a: "Arbitrum شبكة Layer 2 توسّع إيثيريوم بمعاملات أسرع وأرخص عبر Optimistic Rollups.",
    },
    {
      q: "كيف أتابع سعر أربيتروم؟",
      a: "عبر السعر المباشر وشارت TradingView في صفحة ARB.",
    },
    {
      q: "هل توفر المنصة تحليلات ARB؟",
      a: "نعم، عبر التحليلات اليومية وخدمات VIP وطلب تحليل مخصص.",
    },
    {
      q: "كيف أنشئ تنبيه سعري لأربيتروم؟",
      a: "انتقل إلى صفحة التنبيهات وأنشئ تنبيهاً لزوج ARB/USDT.",
    },
    {
      q: "أين أجد أخبار أربيتروم؟",
      a: "في قسم الأخبار المفلترة في صفحة ARB أو عبر أخبار الكريبتو.",
    },
  ],
  relatedAssets: [
    { symbol: "ETH", name: "الإيثيريوم", description: "الشبكة الأساسية لـ Arbitrum.", href: "/eth" },
    { symbol: "OP", name: "أوبتيميزم", description: "Layer 2 منافس.", href: "/op" },
    { symbol: "MATIC", name: "بوليجون", description: "Layer 2 لإيثيريوم.", href: "/matic" },
    { symbol: "UNI", name: "يونيسواب", description: "بروتوكول DeFi.", href: "/uni" },
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
      { name: "أربيتروم ARB", url: "/arb" },
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
      description: "توصيات لتداول أربيتروم والكريبتو في السوق الفوري.",
      href: "/vip-spot",
      cta: "استكشف VIP Spot",
    },
    {
      icon: "⚡",
      title: "VIP Futures",
      description: "إشارات عقود أربيتروم الآجلة.",
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
    title: "HasaN CharT World | أربيتروم ARB — مركز المعلومات",
    description:
      "مركز معلومات Arbitrum: السعر المباشر، شارت TradingView، ملخص السوق، أخبار وتحليلات ARB، التنبيهات السعرية وخدمات VIP.",
    keywords: ["HasaN CharT World", "أربيتروم", "ARB", "Arbitrum", "Layer 2", "سعر ARB"],
  },
  jsonLd: {
    productName: "Arbitrum",
    alternateNames: ["ARB", "أربيتروم"],
    productCategory: "Cryptocurrency",
    itemListName: "مركز معلومات Arbitrum في HasaN CharT World",
    fragmentId: "arbitrum",
  },
  breadcrumbs: [
    { label: "الرئيسية", href: "/" },
    { label: "الأسواق المالية", href: "/markets" },
    { label: "العملات الرقمية", href: "/crypto" },
    { label: "أربيتروم", href: "/arb" },
  ],
};
