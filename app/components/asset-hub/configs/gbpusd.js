/** @type {import("./types").AssetHubConfig} */
export const gbpusdAssetConfig = {
  id: "gbpusd",
  slug: "gbpusd",
  path: "/gbpusd",
  name: "الجنيه دولار",
  nameEn: "British Pound / US Dollar",
  symbol: "GBPUSD",
  tradingViewSymbol: "OANDA:GBPUSD",
  chartSymbol: "GBPUSD",
  chartExchange: "OANDA",
  pricePairLabel: "GBP / USD",
  category: "forex",
  categoryLabel: "الفوركس",
  categoryPath: "/forex",
  hero: {
    badge: "Forex Hub — GBP/USD",
    title: "الجنيه دولار (GBP/USD)",
    description:
      "مركز معلومات متكامل لزوج GBP/USD: السعر المباشر، الشارت، ملخص السوق، آخر الأخبار والتحليلات، والخدمات المرتبطة — ضمن HasaN CharT World.",
    accentRgb: "16,185,129",
  },
  description: {
    marketSummary:
      "GBP/USD المعروف بالكابل البريطاني يتأثر ببيانات المملكة المتحدة وسياسة بنك إنجلترا وعلاقته بالدولار الأمريكي ومعنويات المخاطرة العالمية.",
    tradingHours: "24 / 5",
    platform: "OANDA",
  },
  news: {
    keywords: ["gbpusd", "gbp/usd", "gbp", "pound", "sterling", "cable", "جنيه", "باون", "forex", "فوركس"],
    tagHref: "/news/tag/forex",
    archiveLabel: "أرشيف أخبار الفوركس",
  },
  analysis: {
    keywords: ["gbpusd", "gbp/usd", "gbp usd", "cable", "pound", "sterling", "جنيه"],
  },
  faq: [
    {
      q: "ما هو زوج GBP/USD؟",
      a: "زوج الجنيه الإسترليني مقابل الدولار الأمريكي، ويُعرف في أسواق الفوركس باسم الكابل (Cable).",
    },
    {
      q: "كيف أتابع سعر GBP/USD؟",
      a: "عبر السعر المباشر وشارت TradingView في صفحة GBP/USD.",
    },
    {
      q: "هل توفر المنصة تحليلات GBP/USD؟",
      a: "نعم، عبر التحليلات اليومية وإشارات الفوركس وطلب تحليل مخصص.",
    },
    {
      q: "كيف أنشئ تنبيه سعري لـ GBP/USD؟",
      a: "انتقل إلى صفحة التنبيهات وأنشئ تنبيهاً لزوج GBP/USD.",
    },
    {
      q: "أين أجد أخبار GBP/USD؟",
      a: "في قسم الأخبار المفلترة في هذه الصفحة أو عبر أرشيف أخبار الفوركس.",
    },
  ],
  relatedAssets: [
    { symbol: "EUR", name: "اليورو دولار", description: "زوج EUR/USD — الأكثر تداولاً.", href: "/eurusd" },
    { symbol: "JPY", name: "الدولار ين", description: "زوج USD/JPY — ملاذ الين الياباني.", href: "/usdjpy" },
    { symbol: "XAU", name: "الذهب", description: "ملاذ آمن مرتبط بالدولار.", href: "/xauusd" },
    { symbol: "OIL", name: "النفط", description: "سلعة طاقة مؤثرة على الجنيه.", href: "/usoil" },
  ],
  links: {
    internal: [
      { label: "الأسواق المالية", href: "/markets" },
      { label: "الفوركس", href: "/forex" },
      { label: "EUR/USD", href: "/eurusd" },
      { label: "USD/JPY", href: "/usdjpy" },
      { label: "أخبار الفوركس", href: "/news/tag/forex" },
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "طلب تحليل", href: "/analysis/request" },
      { label: "التنبيهات", href: "/alerts" },
      { label: "إشارات الفوركس", href: "/forex-signals" },
    ],
    jsonLd: [
      { name: "GBP/USD", url: "/gbpusd" },
      { name: "الفوركس", url: "/forex" },
      { name: "EUR/USD", url: "/eurusd" },
      { name: "USD/JPY", url: "/usdjpy" },
      { name: "التحليلات اليومية", url: "/daily-analysis" },
      { name: "إشارات الفوركس", url: "/forex-signals" },
    ],
    marketSummary: [
      { label: "الفوركس", href: "/forex" },
      { label: "أخبار الفوركس", href: "/news/tag/forex" },
      { label: "التحليل الفني", href: "/technical-analysis" },
    ],
  },
  services: [
    {
      icon: "📊",
      title: "إشارات الفوركس",
      description: "تحليلات وإشارات احترافية لزوج GBP/USD والكابل البريطاني.",
      href: "/forex-signals",
      cta: "إشارات الفوركس",
    },
    {
      icon: "🔔",
      title: "التنبيهات السعرية",
      description: "تنبيهات عند وصول GBP/USD لمستوياتك المحددة.",
      href: "/price-alerts",
      cta: "التنبيهات السعرية",
    },
    {
      icon: "🛡️",
      title: "إدارة الحسابات",
      description: "إدارة محافظ الفوركس والمخاطر باحترافية.",
      href: "/account-management",
      cta: "إدارة الحسابات",
    },
  ],
  metadata: {
    title: "HasaN CharT World | GBP/USD — مركز معلومات الفوركس",
    description:
      "مركز معلومات GBP/USD: السعر المباشر، شارت TradingView، ملخص السوق، أخبار وتحليلات الجنيه دولار، التنبيهات السعرية وإشارات الفوركس.",
    keywords: [
      "HasaN CharT World",
      "GBP/USD",
      "GBPUSD",
      "الجنيه دولار",
      "الكابل",
      "Cable",
      "الفوركس",
      "تحليل GBP/USD",
    ],
  },
  jsonLd: {
    productName: "GBP/USD",
    alternateNames: ["GBPUSD", "الجنيه دولار", "Cable"],
    productCategory: "Foreign Exchange",
    itemListName: "مركز معلومات GBP/USD في HasaN CharT World",
    fragmentId: "gbpusd",
  },
  breadcrumbs: [
    { label: "الرئيسية", href: "/" },
    { label: "الأسواق المالية", href: "/markets" },
    { label: "الفوركس", href: "/forex" },
    { label: "GBP/USD", href: "/gbpusd" },
  ],
};
