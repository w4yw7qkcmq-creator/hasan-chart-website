/** @type {import("./types").AssetHubConfig} */
export const bnbAssetConfig = {
  id: "bnb",
  slug: "bnb",
  path: "/bnb",
  name: "BNB",
  nameEn: "BNB",
  symbol: "BNB",
  tradingViewSymbol: "BINANCE:BNBUSDT",
  chartSymbol: "BNBUSDT",
  chartExchange: "BINANCE",
  pricePairLabel: "BNB / USDT",
  category: "crypto",
  categoryLabel: "العملات الرقمية",
  categoryPath: "/crypto",
  hero: {
    badge: "Asset Hub — BNB",
    title: "BNB",
    description:
      "مركز معلومات متكامل لـ BNB: السعر المباشر، الشارت، ملخص السوق، آخر الأخبار والتحليلات، والخدمات المرتبطة — ضمن HasaN CharT World.",
    accentRgb: "243,186,47",
  },
  description: {
    marketSummary:
      "BNB عملة منصة Binance ونظامها البيئي، يتأثر بحجم التداول على المنصة وتطورات النظام البيئي للكريبتو.",
    tradingHours: "24 / 7",
    platform: "Binance",
  },
  news: {
    keywords: ["bnb", "binance coin", "بينانس"],
    tagHref: "/news/tag/crypto",
    archiveLabel: "أرشيف أخبار الكريبتو",
  },
  analysis: {
    keywords: ["bnb", "binance", "bnbusdt"],
  },
  faq: [
    {
      q: "ما هو BNB؟",
      a: "BNB العملة الأصلية لمنصة Binance ونظامها البيئي، تُستخدم في الرسوم والخدمات داخل المنصة.",
    },
    {
      q: "كيف أتابع سعر BNB؟",
      a: "عبر السعر المباشر وشارت TradingView في صفحة BNB.",
    },
    {
      q: "هل توفر المنصة تحليلات BNB؟",
      a: "نعم، عبر التحليلات اليومية وخدمات VIP وطلب تحليل مخصص.",
    },
    {
      q: "كيف أنشئ تنبيه سعري لـ BNB؟",
      a: "انتقل إلى صفحة التنبيهات وأنشئ تنبيهاً لزوج BNB/USDT.",
    },
    {
      q: "أين أجد أخبار BNB؟",
      a: "في قسم الأخبار المفلترة في صفحة BNB أو عبر أخبار الكريبتو.",
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
      { name: "BNB", url: "/bnb" },
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
      description: "توصيات لتداول BNB والكريبتو في السوق الفوري.",
      href: "/vip-spot",
      cta: "استكشف VIP Spot",
    },
    {
      icon: "⚡",
      title: "VIP Futures",
      description: "إشارات عقود BNB الآجلة.",
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
    title: "HasaN CharT World | BNB — مركز المعلومات",
    description:
      "مركز معلومات BNB: السعر المباشر، شارت TradingView، ملخص السوق، أخبار وتحليلات BNB، التنبيهات السعرية وخدمات VIP.",
    keywords: ["HasaN CharT World", "BNB", "Binance Coin", "سعر BNB", "تحليل BNB"],
  },
  jsonLd: {
    productName: "BNB",
    alternateNames: ["BNB", "Binance Coin"],
    productCategory: "Cryptocurrency",
    itemListName: "مركز معلومات BNB في HasaN CharT World",
    fragmentId: "bnb",
  },
  breadcrumbs: [
    { label: "الرئيسية", href: "/" },
    { label: "الأسواق المالية", href: "/markets" },
    { label: "العملات الرقمية", href: "/crypto" },
    { label: "BNB", href: "/bnb" },
  ],
};
