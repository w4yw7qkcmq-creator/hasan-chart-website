/** @type {import("./types").AssetHubConfig} */
export const audusdAssetConfig = {
  id: "audusd",
  slug: "audusd",
  path: "/audusd",
  name: "الأسترالي دولار",
  nameEn: "Australian Dollar / US Dollar",
  symbol: "AUDUSD",
  tradingViewSymbol: "OANDA:AUDUSD",
  chartSymbol: "AUDUSD",
  chartExchange: "OANDA",
  pricePairLabel: "AUD / USD",
  category: "forex",
  categoryLabel: "الفوركس",
  categoryPath: "/forex",
  hero: {
    badge: "Forex Extended Hub — AUD/USD",
    title: "الأسترالي دولار (AUD/USD)",
    description:
      "مركز معلومات متكامل لزوج AUD/USD: السعر المباشر، الشارت، ملخص السوق، آخر الأخبار والتحليلات، والخدمات المرتبطة — ضمن HasaN CharT World.",
    accentRgb: "234,88,12",
  },
  description: {
    marketSummary:
      "AUD/USD عملة سلعية مرتبطة بأسعار الحديد والفحم والنحاس وبيانات الصين، ويتأثر بسياسة الاحتياطي الأسترالي والفيدرالي ومعنويات المخاطرة.",
    tradingHours: "24 / 5",
    platform: "OANDA",
  },
  news: {
    keywords: [
      "audusd",
      "aud/usd",
      "aud",
      "aussie",
      "australia",
      "rba",
      "أسترالي",
      "أستراليا",
      "forex",
    ],
    tagHref: "/news/tag/forex",
    archiveLabel: "أرشيف أخبار الفوركس",
  },
  analysis: {
    keywords: ["audusd", "aud/usd", "aud usd", "aud", "aussie", "أسترالي"],
  },
  faq: [
    {
      q: "ما هو زوج AUD/USD؟",
      a: "زوج الدولار الأسترالي مقابل الدولار الأمريكي، ويُعرف باسم الأوزي (Aussie) ويُعد عملة سلعية.",
    },
    {
      q: "كيف أتابع سعر AUD/USD؟",
      a: "عبر السعر المباشر وشارت TradingView في صفحة AUD/USD.",
    },
    {
      q: "لماذا يُسمى AUD عملة سلعية؟",
      a: "لأن اقتصاد أستراليا يعتمد على تصدير السلع مثل الحديد والفحم، فسعر AUD يرتبط بأسعار السلع.",
    },
    {
      q: "هل توفر المنصة تحليلات AUD/USD؟",
      a: "نعم، عبر التحليلات اليومية وإشارات الفوركس وطلب تحليل مخصص.",
    },
    {
      q: "أين أجد أخبار AUD/USD؟",
      a: "في قسم الأخبار المفلترة في هذه الصفحة أو عبر أرشيف أخبار الفوركس.",
    },
  ],
  relatedAssets: [
    {
      symbol: "NZD",
      name: "النيوزيلندي دولار",
      description: "زوج NZD/USD — كيوي.",
      href: "/nzdusd",
    },
    {
      symbol: "CAD",
      name: "الدولار كندي",
      description: "زوج USD/CAD — لوني.",
      href: "/usdcad",
    },
    {
      symbol: "XAU",
      name: "الذهب",
      description: "سلعة مرتبطة بعملات السلع.",
      href: "/xauusd",
    },
    {
      symbol: "OIL",
      name: "النفط",
      description: "USOIL — يؤثر على عملات السلع.",
      href: "/usoil",
    },
  ],
  links: {
    internal: [
      { label: "الأسواق المالية", href: "/markets" },
      { label: "الفوركس", href: "/forex" },
      { label: "NZD/USD", href: "/nzdusd" },
      { label: "USD/CAD", href: "/usdcad" },
      { label: "EUR/USD", href: "/eurusd" },
      { label: "أخبار الفوركس", href: "/news/tag/forex" },
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "التنبيهات", href: "/alerts" },
    ],
    jsonLd: [
      { name: "AUD/USD", url: "/audusd" },
      { name: "NZD/USD", url: "/nzdusd" },
      { name: "USD/CAD", url: "/usdcad" },
      { name: "الفوركس", url: "/forex" },
    ],
    marketSummary: [
      { label: "الفوركس", href: "/forex" },
      { label: "النفط USOIL", href: "/usoil" },
      { label: "أخبار الفوركس", href: "/news/tag/forex" },
    ],
  },
  services: [
    {
      icon: "📊",
      title: "إشارات الفوركس",
      description: "تحليلات وإشارات لزوج AUD/USD.",
      href: "/forex-signals",
      cta: "إشارات الفوركس",
    },
    {
      icon: "🔔",
      title: "التنبيهات السعرية",
      description: "تنبيهات عند وصول AUD/USD لمستوياتك المحددة.",
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
    title: "HasaN CharT World | AUD/USD — مركز معلومات الفوركس",
    description:
      "مركز معلومات AUD/USD: السعر المباشر، شارت TradingView، ملخص السوق، أخبار وتحليلات الأسترالي دولار، التنبيهات السعرية.",
    keywords: [
      "HasaN CharT World",
      "AUD/USD",
      "AUDUSD",
      "الأوزي",
      "Aussie",
      "الفوركس",
    ],
  },
  jsonLd: {
    productName: "AUD/USD",
    alternateNames: ["AUDUSD", "الأسترالي دولار", "Aussie"],
    productCategory: "Foreign Exchange",
    itemListName: "مركز معلومات AUD/USD في HasaN CharT World",
    fragmentId: "audusd",
  },
  breadcrumbs: [
    { label: "الرئيسية", href: "/" },
    { label: "الأسواق المالية", href: "/markets" },
    { label: "الفوركس", href: "/forex" },
    { label: "AUD/USD", href: "/audusd" },
  ],
};
