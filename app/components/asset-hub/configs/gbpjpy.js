/** @type {import("./types").AssetHubConfig} */
export const gbpjpyAssetConfig = {
  id: "gbpjpy",
  slug: "gbpjpy",
  path: "/gbpjpy",
  name: "الجنيه ين",
  nameEn: "British Pound / Japanese Yen",
  symbol: "GBPJPY",
  tradingViewSymbol: "OANDA:GBPJPY",
  chartSymbol: "GBPJPY",
  chartExchange: "OANDA",
  pricePairLabel: "GBP / JPY",
  category: "forex",
  categoryLabel: "الفوركس",
  categoryPath: "/forex",
  hero: {
    badge: "Forex Cross Hub — GBP/JPY",
    title: "الجنيه ين (GBP/JPY)",
    description:
      "مركز معلومات متكامل لزوج GBP/JPY: السعر المباشر، الشارت، ملخص السوق، آخر الأخبار والتحليلات، والخدمات المرتبطة — ضمن HasaN CharT World.",
    accentRgb: "220,38,38",
  },
  description: {
    marketSummary:
      "GBP/JPY من أكثر الأزواج المتقاطعة تقلباً، يجمع بين الجنيه الإسترليني والين الياباني ويتأثر بمعنويات المخاطرة وسياسة بنك إنجلترا وبنك اليابان.",
    tradingHours: "24 / 5",
    platform: "OANDA",
  },
  news: {
    keywords: [
      "gbpjpy",
      "gbp/jpy",
      "pound yen",
      "boe",
      "boj",
      "الجنيه",
      "ين",
      "forex",
      "فوركس",
    ],
    tagHref: "/news/tag/forex",
    archiveLabel: "أرشيف أخبار الفوركس",
  },
  analysis: {
    keywords: ["gbpjpy", "gbp/jpy", "gbp jpy", "pound yen", "الجنيه ين"],
  },
  faq: [
    {
      q: "ما هو زوج GBP/JPY؟",
      a: "زوج الجنيه الإسترليني مقابل الين الياباني، ويُعرف بـ «الدراغون» لارتفاع تقلبه.",
    },
    {
      q: "كيف أتابع سعر GBP/JPY؟",
      a: "عبر السعر المباشر وشارت TradingView في صفحة GBP/JPY.",
    },
    {
      q: "لماذا يُعد GBP/JPY متقلباً؟",
      a: "لأنه يجمع بين عملتين حساستين لمعنويات المخاطرة والسياسة النقدية.",
    },
    {
      q: "هل توفر المنصة تحليلات GBP/JPY؟",
      a: "نعم، عبر التحليلات اليومية وإشارات الفوركس وطلب تحليل مخصص.",
    },
    {
      q: "أين أجد أخبار GBP/JPY؟",
      a: "في قسم الأخبار المفلترة في هذه الصفحة أو عبر أرشيف أخبار الفوركس.",
    },
  ],
  relatedAssets: [
    {
      symbol: "GBP",
      name: "الجنيه دولار",
      description: "زوج GBP/USD — الكابل.",
      href: "/gbpusd",
    },
    {
      symbol: "JPY",
      name: "الدولار ين",
      description: "زوج USD/JPY — الجانب الياباني.",
      href: "/usdjpy",
    },
    {
      symbol: "EUR",
      name: "اليورو ين",
      description: "زوج EUR/JPY — متقاطع مشابه.",
      href: "/eurjpy",
    },
    {
      symbol: "EUR",
      name: "اليورو جنيه",
      description: "زوج EUR/GBP — مرتبط بالجنيه.",
      href: "/eurgbp",
    },
  ],
  links: {
    internal: [
      { label: "الأسواق المالية", href: "/markets" },
      { label: "الفوركس", href: "/forex" },
      { label: "GBP/USD", href: "/gbpusd" },
      { label: "USD/JPY", href: "/usdjpy" },
      { label: "EUR/JPY", href: "/eurjpy" },
      { label: "أخبار الفوركس", href: "/news/tag/forex" },
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "إشارات الفوركس", href: "/forex-signals" },
      { label: "التنبيهات", href: "/alerts" },
    ],
    jsonLd: [
      { name: "GBP/JPY", url: "/gbpjpy" },
      { name: "GBP/USD", url: "/gbpusd" },
      { name: "USD/JPY", url: "/usdjpy" },
      { name: "الفوركس", url: "/forex" },
      { name: "التحليلات اليومية", url: "/daily-analysis" },
    ],
    marketSummary: [
      { label: "الفوركس", href: "/forex" },
      { label: "GBP/USD", href: "/gbpusd" },
      { label: "أخبار الفوركس", href: "/news/tag/forex" },
    ],
  },
  services: [
    {
      icon: "📊",
      title: "إشارات الفوركس",
      description: "تحليلات وإشارات لزوج GBP/JPY والأزواج المتقاطعة.",
      href: "/forex-signals",
      cta: "إشارات الفوركس",
    },
    {
      icon: "🔔",
      title: "التنبيهات السعرية",
      description: "تنبيهات عند وصول GBP/JPY لمستوياتك المحددة.",
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
    title: "HasaN CharT World | GBP/JPY — مركز معلومات الفوركس",
    description:
      "مركز معلومات GBP/JPY: السعر المباشر، شارت TradingView، ملخص السوق، أخبار وتحليلات الجنيه ين، التنبيهات السعرية.",
    keywords: [
      "HasaN CharT World",
      "GBP/JPY",
      "GBPJPY",
      "الجنيه ين",
      "الفوركس",
      "Forex",
    ],
  },
  jsonLd: {
    productName: "GBP/JPY",
    alternateNames: ["GBPJPY", "الجنيه ين"],
    productCategory: "Foreign Exchange",
    itemListName: "مركز معلومات GBP/JPY في HasaN CharT World",
    fragmentId: "gbpjpy",
  },
  breadcrumbs: [
    { label: "الرئيسية", href: "/" },
    { label: "الأسواق المالية", href: "/markets" },
    { label: "الفوركس", href: "/forex" },
    { label: "GBP/JPY", href: "/gbpjpy" },
  ],
};
