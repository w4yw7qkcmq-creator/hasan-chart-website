/** @type {import("./types").AssetHubConfig} */
export const usdjpyAssetConfig = {
  id: "usdjpy",
  slug: "usdjpy",
  path: "/usdjpy",
  name: "الدولار ين",
  nameEn: "US Dollar / Japanese Yen",
  symbol: "USDJPY",
  tradingViewSymbol: "OANDA:USDJPY",
  chartSymbol: "USDJPY",
  chartExchange: "OANDA",
  pricePairLabel: "USD / JPY",
  category: "forex",
  categoryLabel: "الفوركس",
  categoryPath: "/forex",
  hero: {
    badge: "Forex Hub — USD/JPY",
    title: "الدولار ين (USD/JPY)",
    description:
      "مركز معلومات متكامل لزوج USD/JPY: السعر المباشر، الشارت، ملخص السوق، آخر الأخبار والتحليلات، والخدمات المرتبطة — ضمن HasaN CharT World.",
    accentRgb: "239,68,68",
  },
  description: {
    marketSummary:
      "USD/JPY من أهم أزواج الفوركس في آسيا، يتأثر بفارق الفائدة بين الفيدرالي وبنك اليابان ومعنويات المخاطرة وتدخلات وزارة المالية اليابانية.",
    tradingHours: "24 / 5",
    platform: "OANDA",
  },
  news: {
    keywords: ["usdjpy", "usd/jpy", "jpy", "yen", "boj", "ين", "اليابان", "forex", "فوركس"],
    tagHref: "/news/tag/forex",
    archiveLabel: "أرشيف أخبار الفوركس",
  },
  analysis: {
    keywords: ["usdjpy", "usd/jpy", "usd jpy", "jpy", "yen", "ين", "يابان"],
  },
  faq: [
    {
      q: "ما هو زوج USD/JPY؟",
      a: "زوج الدولار الأمريكي مقابل الين الياباني، ويُعد من أكثر الأزواج تداولاً في جلسة آسيا.",
    },
    {
      q: "كيف أتابع سعر USD/JPY؟",
      a: "عبر السعر المباشر وشارت TradingView في صفحة USD/JPY.",
    },
    {
      q: "هل توفر المنصة تحليلات USD/JPY؟",
      a: "نعم، عبر التحليلات اليومية وإشارات الفوركس وطلب تحليل مخصص.",
    },
    {
      q: "كيف أنشئ تنبيه سعري لـ USD/JPY؟",
      a: "انتقل إلى صفحة التنبيهات وأنشئ تنبيهاً لزوج USD/JPY.",
    },
    {
      q: "أين أجد أخبار USD/JPY؟",
      a: "في قسم الأخبار المفلترة في هذه الصفحة أو عبر أرشيف أخبار الفوركس.",
    },
  ],
  relatedAssets: [
    { symbol: "EUR", name: "اليورو دولار", description: "زوج EUR/USD — مرجع الفوركس.", href: "/eurusd" },
    { symbol: "GBP", name: "الجنيه دولار", description: "زوج GBP/USD — الكابل.", href: "/gbpusd" },
    { symbol: "XAU", name: "الذهب", description: "ملاذ آمن مرتبط بالدولار.", href: "/xauusd" },
    { symbol: "BTC", name: "البيتكوين", description: "أصل رقمي يتأثر بمعنويات المخاطرة.", href: "/btc" },
  ],
  links: {
    internal: [
      { label: "الأسواق المالية", href: "/markets" },
      { label: "الفوركس", href: "/forex" },
      { label: "EUR/USD", href: "/eurusd" },
      { label: "GBP/USD", href: "/gbpusd" },
      { label: "أخبار الفوركس", href: "/news/tag/forex" },
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "طلب تحليل", href: "/analysis/request" },
      { label: "التنبيهات", href: "/alerts" },
      { label: "إشارات الفوركس", href: "/forex-signals" },
    ],
    jsonLd: [
      { name: "USD/JPY", url: "/usdjpy" },
      { name: "الفوركس", url: "/forex" },
      { name: "EUR/USD", url: "/eurusd" },
      { name: "GBP/USD", url: "/gbpusd" },
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
      description: "تحليلات وإشارات احترافية لزوج USD/JPY وأزواج الفوركس الرئيسية.",
      href: "/forex-signals",
      cta: "إشارات الفوركس",
    },
    {
      icon: "🔔",
      title: "التنبيهات السعرية",
      description: "تنبيهات عند وصول USD/JPY لمستوياتك المحددة.",
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
    title: "HasaN CharT World | USD/JPY — مركز معلومات الفوركس",
    description:
      "مركز معلومات USD/JPY: السعر المباشر، شارت TradingView، ملخص السوق، أخبار وتحليلات الدولار ين، التنبيهات السعرية وإشارات الفوركس.",
    keywords: [
      "HasaN CharT World",
      "USD/JPY",
      "USDJPY",
      "الدولار ين",
      "الين الياباني",
      "الفوركس",
      "تحليل USD/JPY",
    ],
  },
  jsonLd: {
    productName: "USD/JPY",
    alternateNames: ["USDJPY", "الدولار ين"],
    productCategory: "Foreign Exchange",
    itemListName: "مركز معلومات USD/JPY في HasaN CharT World",
    fragmentId: "usdjpy",
  },
  breadcrumbs: [
    { label: "الرئيسية", href: "/" },
    { label: "الأسواق المالية", href: "/markets" },
    { label: "الفوركس", href: "/forex" },
    { label: "USD/JPY", href: "/usdjpy" },
  ],
};
