/** @type {import("./types").AssetHubConfig} */
export const nikkeiAssetConfig = {
  id: "nikkei",
  slug: "nikkei",
  path: "/nikkei",
  name: "نيكاي",
  nameEn: "Nikkei 225",
  symbol: "NI225",
  tradingViewSymbol: "TVC:NI225",
  chartSymbol: "NI225",
  chartExchange: "TVC",
  pricePairLabel: "Nikkei 225",
  category: "indices",
  categoryLabel: "المؤشرات",
  categoryPath: "/stocks",
  hero: {
    badge: "Global Indices Extended Hub — Nikkei 225",
    title: "نيكاي 225 (Nikkei)",
    description:
      "مركز معلومات متكامل لمؤشر نيكاي الياباني: السعر المباشر، الشارت، ملخص السوق، آخر الأخبار والتحليلات، والخدمات المرتبطة — ضمن HasaN CharT World.",
    accentRgb: "220,38,38",
  },
  description: {
    marketSummary:
      "مؤشر Nikkei 225 يضم 225 شركة يابانية كبرى في بورصة طوكيو، ويتأثر بسياسة بنك اليابان وضعف الين ومعنويات المخاطرة في آسيا.",
    tradingHours: "24 / 5",
    platform: "TVC",
  },
  news: {
    keywords: ["nikkei", "japan", "tokyo", "boj", "boj", "نيكاي", "اليابان", "stocks", "أسهم", "yen"],
    tagHref: "/news/tag/stocks",
    archiveLabel: "أرشيف أخبار الأسهم",
  },
  analysis: {
    keywords: ["nikkei", "ni225", "japan", "نيكاي", "اليابان", "nikkei 225"],
  },
  faq: [
    {
      q: "ما هو مؤشر Nikkei 225؟",
      a: "المؤشر الرئيسي لبورصة طوكيو، يضم 225 شركة يابانية كبرى ويعكس أداء الاقتصاد الياباني.",
    },
    {
      q: "كيف أتابع مؤشر نيكاي؟",
      a: "عبر السعر المباشر وشارت TradingView في صفحة Nikkei 225.",
    },
    {
      q: "ما الذي يحرك مؤشر نيكاي؟",
      a: "سياسة بنك اليابان، قوة الين، بيانات الاقتصاد الياباني، ومعنويات المخاطرة في آسيا.",
    },
    {
      q: "هل توفر المنصة تحليلات Nikkei؟",
      a: "نعم، عبر التحليلات اليومية وطلب تحليل مخصص.",
    },
    {
      q: "أين أجد أخبار نيكاي؟",
      a: "في قسم الأخبار المفلترة في هذه الصفحة أو عبر أخبار الأسهم والاقتصاد.",
    },
  ],
  relatedAssets: [
    { symbol: "JPY", name: "الدولار ين", description: "USD/JPY — مرتبط بالاقتصاد الياباني.", href: "/usdjpy" },
    { symbol: "EUR", name: "اليورو ين", description: "EUR/JPY — زوج متقاطع ياباني.", href: "/eurjpy" },
    { symbol: "SPX", name: "S&P 500", description: "المؤشر الأمريكي المرجعي.", href: "/sp500" },
    { symbol: "DAX", name: "داكس", description: "مؤشر أوروبي رئيسي.", href: "/dax" },
  ],
  links: {
    internal: [
      { label: "الأسواق المالية", href: "/markets" },
      { label: "الأسهم والمؤشرات", href: "/stocks" },
      { label: "USD/JPY", href: "/usdjpy" },
      { label: "EUR/JPY", href: "/eurjpy" },
      { label: "ناسداك", href: "/nasdaq" },
      { label: "S&P 500", href: "/sp500" },
      { label: "FTSE 100", href: "/ftse" },
      { label: "أخبار الأسهم", href: "/news/tag/stocks" },
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "التنبيهات", href: "/alerts" },
    ],
    jsonLd: [
      { name: "Nikkei 225", url: "/nikkei" },
      { name: "USD/JPY", url: "/usdjpy" },
      { name: "S&P 500", url: "/sp500" },
      { name: "الأسهم", url: "/stocks" },
      { name: "التحليلات اليومية", url: "/daily-analysis" },
    ],
    marketSummary: [
      { label: "USD/JPY", href: "/usdjpy" },
      { label: "الأسهم والمؤشرات", href: "/stocks" },
      { label: "أخبار الأسهم", href: "/news/tag/stocks" },
    ],
  },
  services: [
    {
      icon: "📊",
      title: "التحليل الفني",
      description: "تحليلات تغطي المؤشرات الآسيوية والعالمية.",
      href: "/technical-analysis",
      cta: "التحليل الفني",
    },
    {
      icon: "🔔",
      title: "التنبيهات السعرية",
      description: "تنبيهات عند وصول Nikkei لمستوياتك المحددة.",
      href: "/price-alerts",
      cta: "التنبيهات السعرية",
    },
    {
      icon: "🛡️",
      title: "إدارة الحسابات",
      description: "إدارة محافظ الأسهم والمخاطر.",
      href: "/account-management",
      cta: "إدارة الحسابات",
    },
  ],
  metadata: {
    title: "HasaN CharT World | Nikkei 225 — مركز المؤشرات",
    description:
      "مركز معلومات Nikkei 225: السعر المباشر، شارت TradingView، ملخص السوق، أخبار وتحليلات مؤشر نيكاي الياباني، التنبيهات السعرية.",
    keywords: ["HasaN CharT World", "Nikkei", "Nikkei 225", "نيكاي", "اليابان", "المؤشرات", "الأسهم"],
  },
  jsonLd: {
    productName: "Nikkei 225",
    alternateNames: ["NI225", "نيكاي", "Nikkei"],
    productCategory: "Stock Market Index",
    itemListName: "مركز معلومات Nikkei 225 في HasaN CharT World",
    fragmentId: "nikkei",
  },
  breadcrumbs: [
    { label: "الرئيسية", href: "/" },
    { label: "الأسواق المالية", href: "/markets" },
    { label: "الأسهم والمؤشرات", href: "/stocks" },
    { label: "Nikkei 225", href: "/nikkei" },
  ],
};
