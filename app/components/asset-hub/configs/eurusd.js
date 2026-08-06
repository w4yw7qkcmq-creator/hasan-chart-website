/** @type {import("./types").AssetHubConfig} */
export const eurusdAssetConfig = {
  id: "eurusd",
  slug: "eurusd",
  path: "/eurusd",
  name: "اليورو دولار",
  nameEn: "Euro / US Dollar",
  symbol: "EURUSD",
  tradingViewSymbol: "OANDA:EURUSD",
  chartSymbol: "EURUSD",
  chartExchange: "OANDA",
  pricePairLabel: "EUR / USD",
  category: "forex",
  categoryLabel: "الفوركس",
  categoryPath: "/forex",
  hero: {
    badge: "Global Assets Hub — EUR/USD",
    title: "اليورو دولار (EUR/USD)",
    description:
      "مركز معلومات متكامل لزوج EUR/USD: السعر المباشر، الشارت، ملخص السوق، آخر الأخبار والتحليلات، والخدمات المرتبطة — ضمن HasaN CharT World.",
    accentRgb: "37,99,235",
  },
  description: {
    marketSummary:
      "EUR/USD أكثر أزواج الفوركس تداولاً في العالم، يتأثر بسياسة الفيدرالي والبنك المركزي الأوروبي وبيانات التضخم والنمو في منطقة اليورو والولايات المتحدة.",
    tradingHours: "24 / 5",
    platform: "OANDA",
  },
  news: {
    keywords: [
      "eurusd",
      "eur/usd",
      "euro",
      "ecb",
      "اليورو",
      "يورو",
      "forex",
      "فوركس",
    ],
    tagHref: "/news/tag/forex",
    archiveLabel: "أرشيف أخبار الفوركس",
  },
  analysis: { keywords: ["eurusd", "eur/usd", "eur usd", "euro", "اليورو"] },
  faq: [
    {
      q: "ما هو زوج EUR/USD؟",
      a: "زوج اليورو مقابل الدولار الأمريكي، وهو الأكثر تداولاً في سوق الفوركس ويعكس قوة منطقة اليورو مقابل الولايات المتحدة.",
    },
    {
      q: "كيف أتابع سعر EUR/USD؟",
      a: "عبر السعر المباشر وشارت TradingView في صفحة EUR/USD، أو من خلال التنبيهات السعرية.",
    },
    {
      q: "هل توفر المنصة تحليلات EUR/USD؟",
      a: "نعم، عبر التحليلات اليومية وإشارات الفوركس وطلب تحليل مخصص.",
    },
    {
      q: "كيف أنشئ تنبيه سعري لـ EUR/USD؟",
      a: "انتقل إلى صفحة التنبيهات وأنشئ تنبيهاً لزوج EUR/USD.",
    },
    {
      q: "أين أجد أخبار EUR/USD؟",
      a: "في قسم الأخبار المفلترة في هذه الصفحة أو عبر أرشيف أخبار الفوركس.",
    },
  ],
  relatedAssets: [
    {
      symbol: "DXY",
      name: "مؤشر الدولار",
      description: "مرجع قوة الدولار — يؤثر مباشرة على EUR/USD.",
      href: "/dxy",
    },
    {
      symbol: "XAU",
      name: "الذهب دولار",
      description: "زوج XAU/USD — مرتبط بحركة الدولار.",
      href: "/xauusd",
    },
    {
      symbol: "GBP",
      name: "الجنيه دولار",
      description: "زوج GBP/USD — الكابل البريطاني.",
      href: "/gbpusd",
    },
    {
      symbol: "JPY",
      name: "الدولار ين",
      description: "زوج USD/JPY — حساس لسياسة البنوك المركزية.",
      href: "/usdjpy",
    },
  ],
  links: {
    internal: [
      { label: "الأسواق المالية", href: "/markets" },
      { label: "مؤشر الدولار DXY", href: "/dxy" },
      { label: "XAU/USD", href: "/xauusd" },
      { label: "الفوركس", href: "/forex" },
      { label: "GBP/USD", href: "/gbpusd" },
      { label: "USD/JPY", href: "/usdjpy" },
      { label: "أخبار الفوركس", href: "/news/tag/forex" },
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "طلب تحليل", href: "/analysis/request" },
      { label: "التنبيهات", href: "/alerts" },
      { label: "إشارات الفوركس", href: "/forex-signals" },
    ],
    jsonLd: [
      { name: "EUR/USD", url: "/eurusd" },
      { name: "مؤشر الدولار DXY", url: "/dxy" },
      { name: "XAU/USD", url: "/xauusd" },
      { name: "الفوركس", url: "/forex" },
      { name: "GBP/USD", url: "/gbpusd" },
      { name: "USD/JPY", url: "/usdjpy" },
      { name: "التحليلات اليومية", url: "/daily-analysis" },
    ],
    marketSummary: [
      { label: "مؤشر DXY", href: "/dxy" },
      { label: "XAU/USD", href: "/xauusd" },
      { label: "أخبار الفوركس", href: "/news/tag/forex" },
    ],
  },
  services: [
    {
      icon: "📊",
      title: "إشارات الفوركس",
      description:
        "تحليلات وإشارات احترافية لزوج EUR/USD وأزواج الفوركس الرئيسية.",
      href: "/forex-signals",
      cta: "إشارات الفوركس",
    },
    {
      icon: "🔔",
      title: "التنبيهات السعرية",
      description: "تنبيهات عند وصول EUR/USD لمستوياتك المحددة.",
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
    title: "HasaN CharT World | EUR/USD — مركز الأصول العالمية",
    description:
      "مركز معلومات EUR/USD: السعر المباشر، شارت TradingView، ملخص السوق، أخبار وتحليلات اليورو دولار، التنبيهات السعرية وإشارات الفوركس.",
    keywords: [
      "HasaN CharT World",
      "EUR/USD",
      "EURUSD",
      "اليورو دولار",
      "الفوركس",
      "Forex",
      "سعر اليورو",
      "تحليل EUR/USD",
    ],
  },
  jsonLd: {
    productName: "EUR/USD",
    alternateNames: ["EURUSD", "اليورو دولار"],
    productCategory: "Foreign Exchange",
    itemListName: "مركز معلومات EUR/USD في HasaN CharT World",
    fragmentId: "eurusd",
  },
  breadcrumbs: [
    { label: "الرئيسية", href: "/" },
    { label: "الأسواق المالية", href: "/markets" },
    { label: "الفوركس", href: "/forex" },
    { label: "EUR/USD", href: "/eurusd" },
  ],
};
