/** @type {import("./types").AssetHubConfig} */
export const eurjpyAssetConfig = {
  id: "eurjpy",
  slug: "eurjpy",
  path: "/eurjpy",
  name: "اليورو ين",
  nameEn: "Euro / Japanese Yen",
  symbol: "EURJPY",
  tradingViewSymbol: "OANDA:EURJPY",
  chartSymbol: "EURJPY",
  chartExchange: "OANDA",
  pricePairLabel: "EUR / JPY",
  category: "forex",
  categoryLabel: "الفوركس",
  categoryPath: "/forex",
  hero: {
    badge: "Forex Cross Hub — EUR/JPY",
    title: "اليورو ين (EUR/JPY)",
    description:
      "مركز معلومات متكامل لزوج EUR/JPY: السعر المباشر، الشارت، ملخص السوق، آخر الأخبار والتحليلات، والخدمات المرتبطة — ضمن HasaN CharT World.",
    accentRgb: "37,99,235",
  },
  description: {
    marketSummary:
      "EUR/JPY زوج متقاطع يجمع بين سياسة البنك المركزي الأوروبي والبنك الياباني، ويتأثر بمعنويات المخاطرة وفرق أسعار الفائدة بين منطقة اليورو واليابان.",
    tradingHours: "24 / 5",
    platform: "OANDA",
  },
  news: {
    keywords: [
      "eurjpy",
      "eur/jpy",
      "euro yen",
      "ecb",
      "boj",
      "اليورو",
      "ين",
      "forex",
      "فوركس",
    ],
    tagHref: "/news/tag/forex",
    archiveLabel: "أرشيف أخبار الفوركس",
  },
  analysis: {
    keywords: ["eurjpy", "eur/jpy", "eur jpy", "euro yen", "اليورو ين"],
  },
  faq: [
    {
      q: "ما هو زوج EUR/JPY؟",
      a: "زوج اليورو مقابل الين الياباني، وهو من أكثر الأزواج المتقاطعة تداولاً ويعكس قوة منطقة اليورو مقابل اليابان.",
    },
    {
      q: "كيف أتابع سعر EUR/JPY؟",
      a: "عبر السعر المباشر وشارت TradingView في صفحة EUR/JPY.",
    },
    {
      q: "لماذا يُعد EUR/JPY حساساً لمعنويات المخاطرة؟",
      a: "لأن الين ملاذ آمن، فعند تراجع الشهية للمخاطرة يرتفع الين وينخفض الزوج غالباً.",
    },
    {
      q: "هل توفر المنصة تحليلات EUR/JPY؟",
      a: "نعم، عبر التحليلات اليومية وإشارات الفوركس وطلب تحليل مخصص.",
    },
    {
      q: "أين أجد أخبار EUR/JPY؟",
      a: "في قسم الأخبار المفلترة في هذه الصفحة أو عبر أرشيف أخبار الفوركس.",
    },
  ],
  relatedAssets: [
    {
      symbol: "EUR",
      name: "اليورو دولار",
      description: "زوج EUR/USD — الجانب الأوروبي.",
      href: "/eurusd",
    },
    {
      symbol: "JPY",
      name: "الدولار ين",
      description: "زوج USD/JPY — الجانب الياباني.",
      href: "/usdjpy",
    },
    {
      symbol: "GBP",
      name: "الجنيه ين",
      description: "زوج GBP/JPY — متقاطع مشابه.",
      href: "/gbpjpy",
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
      { label: "USD/JPY", href: "/usdjpy" },
      { label: "GBP/JPY", href: "/gbpjpy" },
      { label: "أخبار الفوركس", href: "/news/tag/forex" },
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "إشارات الفوركس", href: "/forex-signals" },
      { label: "التنبيهات", href: "/alerts" },
    ],
    jsonLd: [
      { name: "EUR/JPY", url: "/eurjpy" },
      { name: "EUR/USD", url: "/eurusd" },
      { name: "USD/JPY", url: "/usdjpy" },
      { name: "الفوركس", url: "/forex" },
      { name: "التحليلات اليومية", url: "/daily-analysis" },
    ],
    marketSummary: [
      { label: "الفوركس", href: "/forex" },
      { label: "EUR/USD", href: "/eurusd" },
      { label: "أخبار الفوركس", href: "/news/tag/forex" },
    ],
  },
  services: [
    {
      icon: "📊",
      title: "إشارات الفوركس",
      description: "تحليلات وإشارات لزوج EUR/JPY والأزواج المتقاطعة.",
      href: "/forex-signals",
      cta: "إشارات الفوركس",
    },
    {
      icon: "🔔",
      title: "التنبيهات السعرية",
      description: "تنبيهات عند وصول EUR/JPY لمستوياتك المحددة.",
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
    title: "HasaN CharT World | EUR/JPY — مركز معلومات الفوركس",
    description:
      "مركز معلومات EUR/JPY: السعر المباشر، شارت TradingView، ملخص السوق، أخبار وتحليلات اليورو ين، التنبيهات السعرية.",
    keywords: [
      "HasaN CharT World",
      "EUR/JPY",
      "EURJPY",
      "اليورو ين",
      "الفوركس",
      "Forex",
    ],
  },
  jsonLd: {
    productName: "EUR/JPY",
    alternateNames: ["EURJPY", "اليورو ين"],
    productCategory: "Foreign Exchange",
    itemListName: "مركز معلومات EUR/JPY في HasaN CharT World",
    fragmentId: "eurjpy",
  },
  breadcrumbs: [
    { label: "الرئيسية", href: "/" },
    { label: "الأسواق المالية", href: "/markets" },
    { label: "الفوركس", href: "/forex" },
    { label: "EUR/JPY", href: "/eurjpy" },
  ],
};
