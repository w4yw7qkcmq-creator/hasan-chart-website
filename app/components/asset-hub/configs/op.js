/** @type {import("./types").AssetHubConfig} */
export const opAssetConfig = {
  id: "op",
  slug: "op",
  path: "/op",
  name: "أوبتيميزم",
  nameEn: "Optimism",
  symbol: "OP",
  tradingViewSymbol: "BINANCE:OPUSDT",
  chartSymbol: "OPUSDT",
  chartExchange: "BINANCE",
  pricePairLabel: "OP / USDT",
  category: "crypto",
  categoryLabel: "العملات الرقمية",
  categoryPath: "/crypto",
  hero: {
    badge: "Crypto Growth Hub — Optimism",
    title: "أوبتيميزم (OP)",
    description:
      "مركز معلومات متكامل لأوبتيميزم: السعر المباشر، الشارت، ملخص السوق، آخر الأخبار والتحليلات، والخدمات المرتبطة — ضمن HasaN CharT World.",
    accentRgb: "255,4,32",
  },
  description: {
    marketSummary:
      "Optimism حل Layer 2 لإيثيريوم يخفّض رسوم المعاملات ويسرّع التطبيقات اللامركزية، وتتأثر حركة OP بتبني النظام البيئي على الشبكة.",
    tradingHours: "24 / 7",
    platform: "Binance",
  },
  news: {
    keywords: ["optimism", "op", "أوبتيميزم", "layer 2", "l2"],
    tagHref: "/news/tag/crypto",
    archiveLabel: "أرشيف أخبار الكريبتو",
  },
  analysis: { keywords: ["op", "optimism", "أوبتيميزم", "opusdt"] },
  faq: [
    {
      q: "ما هو Optimism (OP)؟",
      a: "Optimism شبكة Layer 2 توسّع إيثيريوم بمعاملات أسرع وأرخص عبر تقنية Optimistic Rollups.",
    },
    {
      q: "كيف أتابع سعر أوبتيميزم؟",
      a: "عبر السعر المباشر وشارت TradingView في صفحة OP.",
    },
    {
      q: "هل توفر المنصة تحليلات OP؟",
      a: "نعم، عبر التحليلات اليومية وخدمات VIP وطلب تحليل مخصص.",
    },
    {
      q: "كيف أنشئ تنبيه سعري لأوبتيميزم؟",
      a: "انتقل إلى صفحة التنبيهات وأنشئ تنبيهاً لزوج OP/USDT.",
    },
    {
      q: "أين أجد أخبار أوبتيميزم؟",
      a: "في قسم الأخبار المفلترة في صفحة OP أو عبر أخبار الكريبتو.",
    },
  ],
  relatedAssets: [
    {
      symbol: "ETH",
      name: "الإيثيريوم",
      description: "الشبكة الأساسية لـ Optimism.",
      href: "/eth",
    },
    {
      symbol: "ARB",
      name: "أربيتروم",
      description: "Layer 2 منافس لإيثيريوم.",
      href: "/arb",
    },
    {
      symbol: "MATIC",
      name: "بوليجون",
      description: "Layer 2 لإيثيريوم.",
      href: "/matic",
    },
    {
      symbol: "UNI",
      name: "يونيسواب",
      description: "بروتوكول DeFi على L2.",
      href: "/uni",
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
      { name: "أوبتيميزم OP", url: "/op" },
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
      description: "توصيات لتداول أوبتيميزم والكريبتو في السوق الفوري.",
      href: "/vip-spot",
      cta: "استكشف VIP Spot",
    },
    {
      icon: "⚡",
      title: "VIP Futures",
      description: "إشارات عقود أوبتيميزم الآجلة.",
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
    title: "HasaN CharT World | أوبتيميزم OP — مركز المعلومات",
    description:
      "مركز معلومات Optimism: السعر المباشر، شارت TradingView، ملخص السوق، أخبار وتحليلات OP، التنبيهات السعرية وخدمات VIP.",
    keywords: [
      "HasaN CharT World",
      "أوبتيميزم",
      "OP",
      "Optimism",
      "Layer 2",
      "سعر OP",
    ],
  },
  jsonLd: {
    productName: "Optimism",
    alternateNames: ["OP", "أوبتيميزم"],
    productCategory: "Cryptocurrency",
    itemListName: "مركز معلومات Optimism في HasaN CharT World",
    fragmentId: "optimism",
  },
  breadcrumbs: [
    { label: "الرئيسية", href: "/" },
    { label: "الأسواق المالية", href: "/markets" },
    { label: "العملات الرقمية", href: "/crypto" },
    { label: "أوبتيميزم", href: "/op" },
  ],
};
