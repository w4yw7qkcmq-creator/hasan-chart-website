/** @type {import("./types").AssetHubConfig} */
export const uniAssetConfig = {
  id: "uni",
  slug: "uni",
  path: "/uni",
  name: "يونيسواب",
  nameEn: "Uniswap",
  symbol: "UNI",
  tradingViewSymbol: "BINANCE:UNIUSDT",
  chartSymbol: "UNIUSDT",
  chartExchange: "BINANCE",
  pricePairLabel: "UNI / USDT",
  category: "crypto",
  categoryLabel: "العملات الرقمية",
  categoryPath: "/crypto",
  hero: {
    badge: "Crypto DeFi Hub — Uniswap",
    title: "يونيسواب (UNI)",
    description:
      "مركز معلومات متكامل ليونيسواب: السعر المباشر، الشارت، ملخص السوق، آخر الأخبار والتحليلات، والخدمات المرتبطة — ضمن HasaN CharT World.",
    accentRgb: "255,0,122",
  },
  description: {
    marketSummary:
      "يونيسواب أكبر بروتوكول DEX لامركزي على إيثيريوم، وعملة UNI تُستخدم في الحوكمة والنظام البيئي لـ DeFi.",
    tradingHours: "24 / 7",
    platform: "Binance",
  },
  news: {
    keywords: ["uniswap", "uni", "يونيسواب", "defi", "dex"],
    tagHref: "/news/tag/crypto",
    archiveLabel: "أرشيف أخبار الكريبتو",
  },
  analysis: { keywords: ["uni", "uniswap", "يونيسواب", "uniusdt"] },
  faq: [
    {
      q: "ما هو يونيسواب (UNI)؟",
      a: "يونيسواب بروتوكول تبادل لامركزي (DEX) على إيثيريوم، وUNI عملة الحوكمة الخاصة به.",
    },
    {
      q: "كيف أتابع سعر يونيسواب؟",
      a: "عبر السعر المباشر وشارت TradingView في صفحة UNI.",
    },
    {
      q: "هل توفر المنصة تحليلات UNI؟",
      a: "نعم، عبر التحليلات اليومية وخدمات VIP وطلب تحليل مخصص.",
    },
    {
      q: "كيف أنشئ تنبيه سعري ليونيسواب؟",
      a: "انتقل إلى صفحة التنبيهات وأنشئ تنبيهاً لزوج UNI/USDT.",
    },
    {
      q: "أين أجد أخبار يونيسواب؟",
      a: "في قسم الأخبار المفلترة في صفحة UNI أو عبر أخبار الكريبتو.",
    },
  ],
  relatedAssets: [
    {
      symbol: "ETH",
      name: "الإيثيريوم",
      description: "الشبكة الأساسية ليونيسواب.",
      href: "/eth",
    },
    {
      symbol: "AAVE",
      name: "أيف",
      description: "بروتوكول إقراض DeFi.",
      href: "/aave",
    },
    {
      symbol: "LINK",
      name: "تشين لينك",
      description: "شبكة أوراكل لـ DeFi.",
      href: "/link",
    },
    {
      symbol: "MATIC",
      name: "بوليجون",
      description: "Layer 2 لإيثيريوم.",
      href: "/matic",
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
      { name: "يونيسواب UNI", url: "/uni" },
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
      description: "توصيات لتداول يونيسواب والكريبتو في السوق الفوري.",
      href: "/vip-spot",
      cta: "استكشف VIP Spot",
    },
    {
      icon: "⚡",
      title: "VIP Futures",
      description: "إشارات عقود يونيسواب الآجلة.",
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
    title: "HasaN CharT World | يونيسواب UNI — مركز المعلومات",
    description:
      "مركز معلومات يونيسواب: السعر المباشر، شارت TradingView، ملخص السوق، أخبار وتحليلات UNI، التنبيهات السعرية وخدمات VIP.",
    keywords: [
      "HasaN CharT World",
      "يونيسواب",
      "UNI",
      "Uniswap",
      "DeFi",
      "سعر UNI",
    ],
  },
  jsonLd: {
    productName: "Uniswap",
    alternateNames: ["UNI", "يونيسواب"],
    productCategory: "Cryptocurrency",
    itemListName: "مركز معلومات يونيسواب في HasaN CharT World",
    fragmentId: "uniswap",
  },
  breadcrumbs: [
    { label: "الرئيسية", href: "/" },
    { label: "الأسواق المالية", href: "/markets" },
    { label: "العملات الرقمية", href: "/crypto" },
    { label: "يونيسواب", href: "/uni" },
  ],
};
