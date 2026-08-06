/** @type {import("./types").AssetHubConfig} */
export const dxyAssetConfig = {
  id: "dxy",
  slug: "dxy",
  path: "/dxy",
  name: "مؤشر الدولار",
  nameEn: "US Dollar Index",
  symbol: "DXY",
  tradingViewSymbol: "TVC:DXY",
  chartSymbol: "DXY",
  chartExchange: "TVC",
  pricePairLabel: "DXY",
  category: "global",
  categoryLabel: "الأصول العالمية",
  categoryPath: "/markets",
  hero: {
    badge: "Global Assets Hub — DXY",
    title: "مؤشر الدولار (DXY)",
    description:
      "مركز معلومات متكامل لمؤشر الدولار الأمريكي: السعر المباشر، الشارت، ملخص السوق، آخر الأخبار والتحليلات، والخدمات المرتبطة — ضمن HasaN CharT World.",
    accentRgb: "22,163,74",
  },
  description: {
    marketSummary:
      "مؤشر الدولار DXY يقيس قوة الدولار مقابل سلة من العملات الرئيسية، ويتأثر بقرارات الفيدرالي وبيانات التوظيف والتضخم ومعنويات المخاطرة العالمية.",
    tradingHours: "24 / 5",
    platform: "TradingView",
  },
  news: {
    keywords: [
      "dxy",
      "dollar index",
      "us dollar index",
      "dollar strength",
      "usd index",
      "مؤشر الدولار",
      "الدولار",
      "fed",
      "فيدرالي",
      "forex",
    ],
    tagHref: "/news/tag/fed",
    archiveLabel: "أرشيف أخبار الفيدرالي والدولار",
  },
  analysis: {
    keywords: [
      "dxy",
      "dollar index",
      "usdx",
      "usd index",
      "مؤشر الدولار",
      "الدولار",
    ],
  },
  faq: [
    {
      q: "ما هو مؤشر الدولار DXY؟",
      a: "مؤشر يقيس قوة الدولار الأمريكي مقابل سلة عملات (يورو، ين، جنيه، كندي، كرونة، فرنك)، ويُعد مرجعاً لحركة الأسواق العالمية.",
    },
    {
      q: "كيف أتابع مؤشر الدولار؟",
      a: "عبر السعر المباشر وشارت TradingView في صفحة DXY.",
    },
    {
      q: "لماذا يهم DXY للمتداولين؟",
      a: "لأنه يؤثر على الذهب والفوركس والنفط والكريبتو — قوة الدولار غالباً تضغط على الذهب وتدعم الدولار في أزواج الفوركس.",
    },
    {
      q: "كيف أنشئ تنبيه سعري لـ DXY؟",
      a: "انتقل إلى صفحة التنبيهات وأنشئ تنبيهاً لمستوى مؤشر الدولار.",
    },
    {
      q: "أين أجد أخبار مؤشر الدولار؟",
      a: "في قسم الأخبار المفلترة في هذه الصفحة أو عبر أخبار الفيدرالي والفوركس.",
    },
  ],
  relatedAssets: [
    {
      symbol: "EUR",
      name: "اليورو دولار",
      description: "أكثر أزواج الفوركس تأثراً بـ DXY.",
      href: "/eurusd",
    },
    {
      symbol: "XAU",
      name: "الذهب دولار",
      description: "XAU/USD — عكسي غالباً مع الدولار.",
      href: "/xauusd",
    },
    {
      symbol: "XAG",
      name: "الفضة",
      description: "معدن ثمين مرتبط بقوة الدولار.",
      href: "/xag",
    },
    {
      symbol: "OIL",
      name: "النفط",
      description: "USOIL — يتأثر بالدولار والطاقة.",
      href: "/usoil",
    },
  ],
  links: {
    internal: [
      { label: "الأسواق المالية", href: "/markets" },
      { label: "EUR/USD", href: "/eurusd" },
      { label: "XAU/USD", href: "/xauusd" },
      { label: "الفوركس", href: "/forex" },
      { label: "أخبار الفيدرالي", href: "/news/tag/fed" },
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "طلب تحليل", href: "/analysis/request" },
      { label: "التنبيهات", href: "/alerts" },
      { label: "إشارات الفوركس", href: "/forex-signals" },
    ],
    jsonLd: [
      { name: "مؤشر الدولار DXY", url: "/dxy" },
      { name: "EUR/USD", url: "/eurusd" },
      { name: "XAU/USD", url: "/xauusd" },
      { name: "الفوركس", url: "/forex" },
      { name: "التحليلات اليومية", url: "/daily-analysis" },
    ],
    marketSummary: [
      { label: "EUR/USD", href: "/eurusd" },
      { label: "XAU/USD", href: "/xauusd" },
      { label: "أخبار الفيدرالي", href: "/news/tag/fed" },
    ],
  },
  services: [
    {
      icon: "📊",
      title: "إشارات الفوركس",
      description: "تحليلات تغطي مؤشر الدولار وأزواج الفوركس الرئيسية.",
      href: "/forex-signals",
      cta: "إشارات الفوركس",
    },
    {
      icon: "🔔",
      title: "التنبيهات السعرية",
      description: "تنبيهات عند وصول DXY لمستوياتك المحددة.",
      href: "/price-alerts",
      cta: "التنبيهات السعرية",
    },
    {
      icon: "🛡️",
      title: "إدارة الحسابات",
      description: "إدارة محافظ التداول والمخاطر.",
      href: "/account-management",
      cta: "إدارة الحسابات",
    },
  ],
  metadata: {
    title: "HasaN CharT World | مؤشر الدولار DXY — مركز الأصول العالمية",
    description:
      "مركز معلومات مؤشر الدولار DXY: السعر المباشر، شارت TradingView، ملخص السوق، أخبار وتحليلات الدولار، التنبيهات السعرية.",
    keywords: [
      "HasaN CharT World",
      "DXY",
      "مؤشر الدولار",
      "US Dollar Index",
      "قوة الدولار",
      "الفوركس",
      "تحليل DXY",
    ],
  },
  jsonLd: {
    productName: "US Dollar Index",
    alternateNames: ["DXY", "مؤشر الدولار", "USDX"],
    productCategory: "Market Index",
    itemListName: "مركز معلومات مؤشر الدولار DXY في HasaN CharT World",
    fragmentId: "dxy",
  },
  breadcrumbs: [
    { label: "الرئيسية", href: "/" },
    { label: "الأسواق المالية", href: "/markets" },
    { label: "الأصول العالمية", href: "/markets" },
    { label: "DXY", href: "/dxy" },
  ],
};
