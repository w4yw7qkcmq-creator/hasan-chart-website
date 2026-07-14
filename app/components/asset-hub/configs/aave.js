/** @type {import("./types").AssetHubConfig} */
export const aaveAssetConfig = {
  id: "aave",
  slug: "aave",
  path: "/aave",
  name: "أيف",
  nameEn: "Aave",
  symbol: "AAVE",
  tradingViewSymbol: "BINANCE:AAVEUSDT",
  chartSymbol: "AAVEUSDT",
  chartExchange: "BINANCE",
  pricePairLabel: "AAVE / USDT",
  category: "crypto",
  categoryLabel: "العملات الرقمية",
  categoryPath: "/crypto",
  hero: {
    badge: "Crypto DeFi Hub — Aave",
    title: "أيف (AAVE)",
    description:
      "مركز معلومات متكامل لأيف: السعر المباشر، الشارت، ملخص السوق، آخر الأخبار والتحليلات، والخدمات المرتبطة — ضمن HasaN CharT World.",
    accentRgb: "185,75,255",
  },
  description: {
    marketSummary:
      "أيف بروتوكول إقراض واقتراض لامركزي رائد في DeFi، وتتأثر حركة AAVE بحجم السيولة وأسعار الفائدة في النظام البيئي.",
    tradingHours: "24 / 7",
    platform: "Binance",
  },
  news: {
    keywords: ["aave", "أيف", "defi", "lending", "إقراض"],
    tagHref: "/news/tag/crypto",
    archiveLabel: "أرشيف أخبار الكريبتو",
  },
  analysis: {
    keywords: ["aave", "أيف", "aaveusdt"],
  },
  faq: [
    {
      q: "ما هو أيف (AAVE)؟",
      a: "أيف بروتوكول DeFi للإقراض والاقتراض اللامركزي عبر عدة سلاسل بلوكتشين.",
    },
    {
      q: "كيف أتابع سعر أيف؟",
      a: "عبر السعر المباشر وشارت TradingView في صفحة AAVE.",
    },
    {
      q: "هل توفر المنصة تحليلات AAVE؟",
      a: "نعم، عبر التحليلات اليومية وخدمات VIP وطلب تحليل مخصص.",
    },
    {
      q: "كيف أنشئ تنبيه سعري لأيف؟",
      a: "انتقل إلى صفحة التنبيهات وأنشئ تنبيهاً لزوج AAVE/USDT.",
    },
    {
      q: "أين أجد أخبار أيف؟",
      a: "في قسم الأخبار المفلترة في صفحة AAVE أو عبر أخبار الكريبتو.",
    },
  ],
  relatedAssets: [
    { symbol: "ETH", name: "الإيثيريوم", description: "الشبكة الأساسية لأيف.", href: "/eth" },
    { symbol: "UNI", name: "يونيسواب", description: "بروتوكول DEX لامركزي.", href: "/uni" },
    { symbol: "LINK", name: "تشين لينك", description: "أوراكل لـ DeFi.", href: "/link" },
    { symbol: "MATIC", name: "بوليجون", description: "Layer 2 لإيثيريوم.", href: "/matic" },
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
      { name: "أيف AAVE", url: "/aave" },
      { name: "العملات الرقمية", url: "/crypto" },
      { name: "يونيسواب", url: "/uni" },
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
      description: "توصيات لتداول أيف والكريبتو في السوق الفوري.",
      href: "/vip-spot",
      cta: "استكشف VIP Spot",
    },
    {
      icon: "⚡",
      title: "VIP Futures",
      description: "إشارات عقود أيف الآجلة.",
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
    title: "HasaN CharT World | أيف AAVE — مركز المعلومات",
    description:
      "مركز معلومات أيف: السعر المباشر، شارت TradingView، ملخص السوق، أخبار وتحليلات AAVE، التنبيهات السعرية وخدمات VIP.",
    keywords: ["HasaN CharT World", "أيف", "AAVE", "Aave", "DeFi", "سعر AAVE"],
  },
  jsonLd: {
    productName: "Aave",
    alternateNames: ["AAVE", "أيف"],
    productCategory: "Cryptocurrency",
    itemListName: "مركز معلومات أيف في HasaN CharT World",
    fragmentId: "aave",
  },
  breadcrumbs: [
    { label: "الرئيسية", href: "/" },
    { label: "الأسواق المالية", href: "/markets" },
    { label: "العملات الرقمية", href: "/crypto" },
    { label: "أيف", href: "/aave" },
  ],
};
