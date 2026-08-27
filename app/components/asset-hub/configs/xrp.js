/** @type {import("./types").AssetHubConfig} */
export const xrpAssetConfig = {
  id: "xrp",
  slug: "xrp",
  path: "/xrp",
  name: "ريبل",
  nameEn: "Ripple",
  symbol: "XRP",
  tradingViewSymbol: "BINANCE:XRPUSDT",
  chartSymbol: "XRPUSDT",
  chartExchange: "BINANCE",
  pricePairLabel: "XRP / USDT",
  category: "crypto",
  categoryLabel: "العملات الرقمية",
  categoryPath: "/crypto",
  hero: {
    badge: "Asset Hub — Ripple",
    title: "ريبل (XRP)",
    description:
      "مركز معلومات متكامل لريبل: السعر المباشر، الشارت، ملخص السوق، آخر الأخبار والتحليلات، والخدمات المرتبطة — ضمن HasaN CharT World.",
    accentRgb: "35,84,230",
  },
  description: {
    marketSummary:
      "ريبل (XRP) يرتبط بقطاع المدفوعات عبر البلوكتشين، ويتأثر بأخبار التنظيم والشراكات المصرفية ومعنويات سوق الكريبتو.",
    tradingHours: "24 / 7",
    platform: "Binance",
  },
  news: {
    keywords: ["xrp", "ripple", "ريبل"],
    tagHref: "/news/tag/crypto",
    archiveLabel: "أرشيف أخبار الكريبتو",
  },
  analysis: {
    keywords: ["xrp", "ripple", "ريبل", "xrpusdt"],
  },
  faq: [
    {
      q: "ما هو ريبل (XRP)؟",
      a: "XRP أصل رقمي مرتبط بنظام Ripple للمدفوعات عبر البلوكتشين، يُستخدم في التحويلات السريعة بين المؤسسات.",
    },
    {
      q: "كيف أتابع سعر ريبل؟",
      a: "عبر السعر المباشر وشارت TradingView في صفحة XRP.",
    },
    {
      q: "هل توفر المنصة تحليلات XRP؟",
      a: "نعم، عبر التحليلات اليومية وخدمات VIP وطلب تحليل مخصص.",
    },
    {
      q: "كيف أنشئ تنبيه سعري لريبل؟",
      a: "انتقل إلى صفحة التنبيهات وأنشئ تنبيهاً لزوج XRP/USDT.",
    },
    {
      q: "أين أجد أخبار ريبل؟",
      a: "في قسم الأخبار المفلترة في صفحة XRP أو عبر أخبار الكريبتو.",
    },
  ],
  relatedAssets: [
    { symbol: "BTC", name: "البيتكوين", description: "المرجع الرئيسي لسوق الكريبتو.", href: "/btc" },
    { symbol: "ETH", name: "الإيثيريوم", description: "منصة العقود الذكية.", href: "/crypto" },
    { symbol: "FX", name: "الفوركس", description: "أسواق المدفوعات والعملات.", href: "/forex" },
    { symbol: "XAU", name: "الذهب", description: "ملاذ آمن عالمي.", href: "/xauusd" },
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
      { name: "ريبل XRP", url: "/xrp" },
      { name: "العملات الرقمية", url: "/crypto" },
      { name: "البيتكوين", url: "/btc" },
      { name: "التحليلات اليومية", url: "/daily-analysis" },
    ],
    marketSummary: [
      { label: "سوق الكريبتو", href: "/crypto" },
      { label: "أخبار الكريبتو", href: "/news/tag/crypto" },
      { label: "الفوركس", href: "/forex" },
    ],
  },
  services: [
    {
      icon: "💎",
      title: "VIP Spot",
      description: "توصيات لتداول ريبل والكريبتو في السوق الفوري.",
      href: "/vip-spot",
      cta: "استكشف VIP Spot",
    },
    {
      icon: "⚡",
      title: "VIP Futures",
      description: "إشارات عقود XRP الآجلة.",
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
    title: "HasaN CharT World | ريبل XRP — مركز المعلومات",
    description:
      "مركز معلومات ريبل: السعر المباشر، شارت TradingView، ملخص السوق، أخبار وتحليلات XRP، التنبيهات السعرية وخدمات VIP.",
    keywords: ["HasaN CharT World", "ريبل", "XRP", "Ripple", "سعر ريبل", "تحليل XRP"],
  },
  jsonLd: {
    productName: "Ripple",
    alternateNames: ["XRP", "ريبل"],
    productCategory: "Cryptocurrency",
    itemListName: "مركز معلومات ريبل في HasaN CharT World",
    fragmentId: "ripple",
  },
  breadcrumbs: [
    { label: "الرئيسية", href: "/" },
    { label: "الأسواق المالية", href: "/markets" },
    { label: "العملات الرقمية", href: "/crypto" },
    { label: "ريبل", href: "/xrp" },
  ],
};
