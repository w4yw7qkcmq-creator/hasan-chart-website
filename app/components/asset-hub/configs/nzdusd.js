/** @type {import("./types").AssetHubConfig} */
export const nzdusdAssetConfig = {
  id: "nzdusd",
  slug: "nzdusd",
  path: "/nzdusd",
  name: "النيوزيلندي دولار",
  nameEn: "New Zealand Dollar / US Dollar",
  symbol: "NZDUSD",
  tradingViewSymbol: "OANDA:NZDUSD",
  chartSymbol: "NZDUSD",
  chartExchange: "OANDA",
  pricePairLabel: "NZD / USD",
  category: "forex",
  categoryLabel: "الفوركس",
  categoryPath: "/forex",
  hero: {
    badge: "Forex Extended Hub — NZD/USD",
    title: "النيوزيلندي دولار (NZD/USD)",
    description:
      "مركز معلومات متكامل لزوج NZD/USD: السعر المباشر، الشارت، ملخص السوق، آخر الأخبار والتحليلات، والخدمات المرتبطة — ضمن HasaN CharT World.",
    accentRgb: "34,197,94",
  },
  description: {
    marketSummary:
      "NZD/USD المعروف بالكيوي (Kiwi) عملة سلعية مرتبطة بأسعار الألبان واللحوم وبيانات الصين ومعنويات المخاطرة، ويتأثر بسياسة الاحتياطي النيوزيلندي.",
    tradingHours: "24 / 5",
    platform: "OANDA",
  },
  news: {
    keywords: [
      "nzdusd",
      "nzd/usd",
      "nzd",
      "kiwi",
      "new zealand",
      "rbnz",
      "نيوزيلندا",
      "كيوي",
      "forex",
    ],
    tagHref: "/news/tag/forex",
    archiveLabel: "أرشيف أخبار الفوركس",
  },
  analysis: {
    keywords: ["nzdusd", "nzd/usd", "nzd usd", "nzd", "kiwi", "كيوي"],
  },
  faq: [
    {
      q: "ما هو زوج NZD/USD؟",
      a: "زوج الدولار النيوزيلندي مقابل الدولار الأمريكي، ويُعرف بالكيوي ويُعد عملة سلعية.",
    },
    {
      q: "كيف أتابع سعر NZD/USD؟",
      a: "عبر السعر المباشر وشارت TradingView في صفحة NZD/USD.",
    },
    {
      q: "ما علاقة NZD بـ AUD؟",
      a: "كلاهما عملات سلعية في منطقة المحيط الهادئ وغالباً يتحركان معاً مع معنويات المخاطرة.",
    },
    {
      q: "هل توفر المنصة تحليلات NZD/USD؟",
      a: "نعم، عبر التحليلات اليومية وإشارات الفوركس وطلب تحليل مخصص.",
    },
    {
      q: "أين أجد أخبار NZD/USD؟",
      a: "في قسم الأخبار المفلترة في هذه الصفحة أو عبر أرشيف أخبار الفوركس.",
    },
  ],
  relatedAssets: [
    {
      symbol: "AUD",
      name: "الأسترالي دولار",
      description: "زوج AUD/USD — أوزي.",
      href: "/audusd",
    },
    {
      symbol: "EUR",
      name: "اليورو دولار",
      description: "زوج EUR/USD.",
      href: "/eurusd",
    },
    {
      symbol: "XAU",
      name: "الذهب",
      description: "ملاذ آمن مرتبط بمعنويات المخاطرة.",
      href: "/xauusd",
    },
    {
      symbol: "OIL",
      name: "النفط",
      description: "USOIL — سلعة طاقة.",
      href: "/usoil",
    },
  ],
  links: {
    internal: [
      { label: "الأسواق المالية", href: "/markets" },
      { label: "الفوركس", href: "/forex" },
      { label: "AUD/USD", href: "/audusd" },
      { label: "USD/CAD", href: "/usdcad" },
      { label: "EUR/USD", href: "/eurusd" },
      { label: "أخبار الفوركس", href: "/news/tag/forex" },
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "التنبيهات", href: "/alerts" },
    ],
    jsonLd: [
      { name: "NZD/USD", url: "/nzdusd" },
      { name: "AUD/USD", url: "/audusd" },
      { name: "USD/CAD", url: "/usdcad" },
      { name: "الفوركس", url: "/forex" },
    ],
    marketSummary: [
      { label: "AUD/USD", href: "/audusd" },
      { label: "الفوركس", href: "/forex" },
      { label: "أخبار الفوركس", href: "/news/tag/forex" },
    ],
  },
  services: [
    {
      icon: "📊",
      title: "إشارات الفوركس",
      description: "تحليلات وإشارات لزوج NZD/USD.",
      href: "/forex-signals",
      cta: "إشارات الفوركس",
    },
    {
      icon: "🔔",
      title: "التنبيهات السعرية",
      description: "تنبيهات عند وصول NZD/USD لمستوياتك المحددة.",
      href: "/price-alerts",
      cta: "التنبيهات السعرية",
    },
    {
      icon: "🛡️",
      title: "إدارة الحسابات",
      description: "إدارة محافظ الفوركس والمخاطر.",
      href: "/account-management",
      cta: "إدارة الحسابات",
    },
  ],
  metadata: {
    title: "HasaN CharT World | NZD/USD — مركز معلومات الفوركس",
    description:
      "مركز معلومات NZD/USD: السعر المباشر، شارت TradingView، ملخص السوق، أخبار وتحليلات النيوزيلندي دولار، التنبيهات السعرية.",
    keywords: [
      "HasaN CharT World",
      "NZD/USD",
      "NZDUSD",
      "الكيوي",
      "Kiwi",
      "الفوركس",
    ],
  },
  jsonLd: {
    productName: "NZD/USD",
    alternateNames: ["NZDUSD", "النيوزيلندي دولار", "Kiwi"],
    productCategory: "Foreign Exchange",
    itemListName: "مركز معلومات NZD/USD في HasaN CharT World",
    fragmentId: "nzdusd",
  },
  breadcrumbs: [
    { label: "الرئيسية", href: "/" },
    { label: "الأسواق المالية", href: "/markets" },
    { label: "الفوركس", href: "/forex" },
    { label: "NZD/USD", href: "/nzdusd" },
  ],
};
