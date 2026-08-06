/** @type {import("./types").AssetHubConfig} */
export const usdchfAssetConfig = {
  id: "usdchf",
  slug: "usdchf",
  path: "/usdchf",
  name: "الدولار فرنك",
  nameEn: "US Dollar / Swiss Franc",
  symbol: "USDCHF",
  tradingViewSymbol: "OANDA:USDCHF",
  chartSymbol: "USDCHF",
  chartExchange: "OANDA",
  pricePairLabel: "USD / CHF",
  category: "forex",
  categoryLabel: "الفوركس",
  categoryPath: "/forex",
  hero: {
    badge: "Forex Extended Hub — USD/CHF",
    title: "الدولار فرنك (USD/CHF)",
    description:
      "مركز معلومات متكامل لزوج USD/CHF: السعر المباشر، الشارت، ملخص السوق، آخر الأخبار والتحليلات، والخدمات المرتبطة — ضمن HasaN CharT World.",
    accentRgb: "220,38,38",
  },
  description: {
    marketSummary:
      "USD/CHF يعكس قوة الدولار مقابل الفرنك السويسري الملاذ الآمن، ويتأثر بسياسة الفيدرالي والبنك الوطني السويسري ومعنويات المخاطرة العالمية.",
    tradingHours: "24 / 5",
    platform: "OANDA",
  },
  news: {
    keywords: [
      "usdchf",
      "usd/chf",
      "chf",
      "swiss",
      "snb",
      "فرنك",
      "سويسرا",
      "forex",
      "فوركس",
    ],
    tagHref: "/news/tag/forex",
    archiveLabel: "أرشيف أخبار الفوركس",
  },
  analysis: {
    keywords: ["usdchf", "usd/chf", "usd chf", "chf", "swiss", "فرنك"],
  },
  faq: [
    {
      q: "ما هو زوج USD/CHF؟",
      a: "زوج الدولار الأمريكي مقابل الفرنك السويسري، والفرنك يُعد ملاذاً آمناً في أوقات عدم اليقين.",
    },
    {
      q: "كيف أتابع سعر USD/CHF؟",
      a: "عبر السعر المباشر وشارت TradingView في صفحة USD/CHF.",
    },
    {
      q: "لماذا يُعد الفرنك ملاذاً آمناً؟",
      a: "بسبب استقرار الاقتصاد السويسري وسياسة البنك الوطني السويسري المحافظة.",
    },
    {
      q: "هل توفر المنصة تحليلات USD/CHF؟",
      a: "نعم، عبر التحليلات اليومية وإشارات الفوركس وطلب تحليل مخصص.",
    },
    {
      q: "أين أجد أخبار USD/CHF؟",
      a: "في قسم الأخبار المفلترة في هذه الصفحة أو عبر أرشيف أخبار الفوركس.",
    },
  ],
  relatedAssets: [
    {
      symbol: "EUR",
      name: "اليورو دولار",
      description: "زوج EUR/USD — مرتبط بالفوركس الأوروبي.",
      href: "/eurusd",
    },
    {
      symbol: "GBP",
      name: "الجنيه دولار",
      description: "زوج GBP/USD — الكابل.",
      href: "/gbpusd",
    },
    {
      symbol: "XAU",
      name: "الذهب دولار",
      description: "ملاذ آمن مثل الفرنك.",
      href: "/xauusd",
    },
    {
      symbol: "DXY",
      name: "مؤشر الدولار",
      description: "مرجع قوة الدولار.",
      href: "/dxy",
    },
  ],
  links: {
    internal: [
      { label: "الأسواق المالية", href: "/markets" },
      { label: "الفوركس", href: "/forex" },
      { label: "EUR/USD", href: "/eurusd" },
      { label: "AUD/USD", href: "/audusd" },
      { label: "أخبار الفوركس", href: "/news/tag/forex" },
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "إشارات الفوركس", href: "/forex-signals" },
      { label: "التنبيهات", href: "/alerts" },
    ],
    jsonLd: [
      { name: "USD/CHF", url: "/usdchf" },
      { name: "EUR/USD", url: "/eurusd" },
      { name: "الفوركس", url: "/forex" },
      { name: "التحليلات اليومية", url: "/daily-analysis" },
    ],
    marketSummary: [
      { label: "الفوركس", href: "/forex" },
      { label: "مؤشر DXY", href: "/dxy" },
      { label: "أخبار الفوركس", href: "/news/tag/forex" },
    ],
  },
  services: [
    {
      icon: "📊",
      title: "إشارات الفوركس",
      description: "تحليلات وإشارات لزوج USD/CHF وأزواج الفوركس.",
      href: "/forex-signals",
      cta: "إشارات الفوركس",
    },
    {
      icon: "🔔",
      title: "التنبيهات السعرية",
      description: "تنبيهات عند وصول USD/CHF لمستوياتك المحددة.",
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
    title: "HasaN CharT World | USD/CHF — مركز معلومات الفوركس",
    description:
      "مركز معلومات USD/CHF: السعر المباشر، شارت TradingView، ملخص السوق، أخبار وتحليلات الدولار فرنك، التنبيهات السعرية.",
    keywords: [
      "HasaN CharT World",
      "USD/CHF",
      "USDCHF",
      "الفرنك السويسري",
      "الفوركس",
      "Forex",
    ],
  },
  jsonLd: {
    productName: "USD/CHF",
    alternateNames: ["USDCHF", "الدولار فرنك"],
    productCategory: "Foreign Exchange",
    itemListName: "مركز معلومات USD/CHF في HasaN CharT World",
    fragmentId: "usdchf",
  },
  breadcrumbs: [
    { label: "الرئيسية", href: "/" },
    { label: "الأسواق المالية", href: "/markets" },
    { label: "الفوركس", href: "/forex" },
    { label: "USD/CHF", href: "/usdchf" },
  ],
};
