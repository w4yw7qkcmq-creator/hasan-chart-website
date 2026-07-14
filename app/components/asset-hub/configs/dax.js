/** @type {import("./types").AssetHubConfig} */
export const daxAssetConfig = {
  id: "dax",
  slug: "dax",
  path: "/dax",
  name: "داكس",
  nameEn: "DAX",
  symbol: "DAX",
  tradingViewSymbol: "XETR:DAX",
  chartSymbol: "DAX",
  chartExchange: "XETR",
  pricePairLabel: "DAX 40",
  category: "indices",
  categoryLabel: "المؤشرات",
  categoryPath: "/stocks",
  hero: {
    badge: "Indices Hub — DAX",
    title: "داكس (DAX 40)",
    description:
      "مركز معلومات متكامل لمؤشر داكس الألماني: السعر المباشر، الشارت، ملخص السوق، آخر الأخبار والتحليلات، والخدمات المرتبطة — ضمن HasaN CharT World.",
    accentRgb: "245,158,11",
  },
  description: {
    marketSummary:
      "مؤشر DAX 40 يضم 40 شركة ألمانية كبرى مدرجة في فرانكفورت، ويتأثر باقتصاد ألمانيا واليورو وسياسة البنك المركزي الأوروبي والطاقة.",
    tradingHours: "24 / 5",
    platform: "XETRA",
  },
  news: {
    keywords: ["dax", "germany", "german", "frankfurt", "ecb", "ألمانيا", "داكس", "stocks", "أسهم", "euro"],
    tagHref: "/news/tag/stocks",
    archiveLabel: "أرشيف أخبار الأسهم",
  },
  analysis: {
    keywords: ["dax", "dax 40", "germany", "داكس", "ألمانيا"],
  },
  faq: [
    {
      q: "ما هو مؤشر DAX؟",
      a: "المؤشر الرئيسي لبورصة فرانكفورت، يضم 40 شركة ألمانية كبرى ويعكس أداء الاقتصاد الألماني.",
    },
    {
      q: "كيف أتابع مؤشر داكس؟",
      a: "عبر السعر المباشر وشارت TradingView في صفحة DAX.",
    },
    {
      q: "ما الذي يحرك مؤشر داكس؟",
      a: "بيانات ألمانيا الاقتصادية، سياسة ECB، أسعار الطاقة، وأداء قطاع السيارات والصناعة.",
    },
    {
      q: "هل توفر المنصة تحليلات DAX؟",
      a: "نعم، عبر التحليلات اليومية وطلب تحليل مخصص.",
    },
    {
      q: "أين أجد أخبار داكس؟",
      a: "في قسم الأخبار المفلترة في هذه الصفحة أو عبر أخبار الأسهم والاقتصاد.",
    },
  ],
  relatedAssets: [
    { symbol: "EUR", name: "اليورو دولار", description: "EUR/USD — مرتبط باقتصاد ألمانيا.", href: "/eurusd" },
    { symbol: "SPX", name: "S&P 500", description: "المؤشر الأمريكي المرجعي.", href: "/sp500" },
    { symbol: "NDX", name: "ناسداك", description: "مؤشر التكنولوجيا الأمريكية.", href: "/nasdaq" },
    { symbol: "OIL", name: "النفط", description: "USOIL — يؤثر على الاقتصاد الألماني.", href: "/usoil" },
  ],
  links: {
    internal: [
      { label: "الأسواق المالية", href: "/markets" },
      { label: "الأسهم والمؤشرات", href: "/stocks" },
      { label: "ناسداك", href: "/nasdaq" },
      { label: "S&P 500", href: "/sp500" },
      { label: "داو جونز", href: "/dowjones" },
      { label: "EUR/USD", href: "/eurusd" },
      { label: "أخبار الأسهم", href: "/news/tag/stocks" },
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "التنبيهات", href: "/alerts" },
    ],
    jsonLd: [
      { name: "DAX", url: "/dax" },
      { name: "ناسداك", url: "/nasdaq" },
      { name: "S&P 500", url: "/sp500" },
      { name: "EUR/USD", url: "/eurusd" },
      { name: "الأسهم", url: "/stocks" },
    ],
    marketSummary: [
      { label: "EUR/USD", href: "/eurusd" },
      { label: "الأسهم والمؤشرات", href: "/stocks" },
      { label: "أخبار الأسهم", href: "/news/tag/stocks" },
    ],
  },
  services: [
    {
      icon: "📊",
      title: "التحليل الفني",
      description: "تحليلات تغطي المؤشرات الأوروبية والعالمية.",
      href: "/technical-analysis",
      cta: "التحليل الفني",
    },
    {
      icon: "🔔",
      title: "التنبيهات السعرية",
      description: "تنبيهات عند وصول DAX لمستوياتك المحددة.",
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
    title: "HasaN CharT World | DAX — مركز المؤشرات",
    description:
      "مركز معلومات DAX: السعر المباشر، شارت TradingView، ملخص السوق، أخبار وتحليلات مؤشر داكس الألماني، التنبيهات السعرية.",
    keywords: ["HasaN CharT World", "DAX", "داكس", "DAX 40", "ألمانيا", "المؤشرات", "الأسهم"],
  },
  jsonLd: {
    productName: "DAX",
    alternateNames: ["DAX 40", "داكس", "German DAX"],
    productCategory: "Stock Market Index",
    itemListName: "مركز معلومات DAX في HasaN CharT World",
    fragmentId: "dax",
  },
  breadcrumbs: [
    { label: "الرئيسية", href: "/" },
    { label: "الأسواق المالية", href: "/markets" },
    { label: "الأسهم والمؤشرات", href: "/stocks" },
    { label: "DAX", href: "/dax" },
  ],
};
