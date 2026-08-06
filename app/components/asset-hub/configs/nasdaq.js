/** @type {import("./types").AssetHubConfig} */
export const nasdaqAssetConfig = {
  id: "nasdaq",
  slug: "nasdaq",
  path: "/nasdaq",
  name: "ناسداك",
  nameEn: "Nasdaq 100",
  symbol: "NDX",
  tradingViewSymbol: "TVC:NDX",
  chartSymbol: "NDX",
  chartExchange: "TVC",
  pricePairLabel: "Nasdaq 100",
  category: "indices",
  categoryLabel: "المؤشرات",
  categoryPath: "/stocks",
  hero: {
    badge: "Indices Hub — Nasdaq",
    title: "ناسداك (Nasdaq 100)",
    description:
      "مركز معلومات متكامل لمؤشر ناسداك: السعر المباشر، الشارت، ملخص السوق، آخر الأخبار والتحليلات، والخدمات المرتبطة — ضمن HasaN CharT World.",
    accentRgb: "59,130,246",
  },
  description: {
    marketSummary:
      "مؤشر ناسداك 100 يضم أكبر شركات التكنولوجيا الأمريكية، ويتأثر بأرباح الشركات التقنية وأسعار الفائدة ومعنويات المخاطرة وسياسة الفيدرالي.",
    tradingHours: "24 / 5",
    platform: "TradingView",
  },
  news: {
    keywords: [
      "nasdaq",
      "ndx",
      "qqq",
      "tech stocks",
      "ناسداك",
      "تكنولوجيا",
      "stocks",
      "أسهم",
    ],
    tagHref: "/news/tag/stocks",
    archiveLabel: "أرشيف أخبار الأسهم",
  },
  analysis: { keywords: ["nasdaq", "ndx", "qqq", "ناسداك", "nas100"] },
  faq: [
    {
      q: "ما هو مؤشر ناسداك؟",
      a: "مؤشر يضم 100 من أكبر الشركات غير المالية المدرجة في بورصة ناسداك، ويركز على قطاع التكنولوجيا.",
    },
    {
      q: "كيف أتابع مؤشر ناسداك؟",
      a: "عبر السعر المباشر وشارت TradingView في صفحة ناسداك.",
    },
    {
      q: "لماذا يتأثر ناسداك بالفائدة؟",
      a: "شركات التكنولوجيا حساسة لأسعار الفائدة لأن تقييماتها تعتمد على أرباح مستقبلية بعيدة.",
    },
    {
      q: "هل توفر المنصة تحليلات ناسداك؟",
      a: "نعم، عبر التحليلات اليومية وطلب تحليل مخصص.",
    },
    {
      q: "أين أجد أخبار ناسداك؟",
      a: "في قسم الأخبار المفلترة في هذه الصفحة أو عبر أخبار الأسهم.",
    },
  ],
  relatedAssets: [
    {
      symbol: "SPX",
      name: "S&P 500",
      description: "المؤشر الأمريكي الأوسع.",
      href: "/sp500",
    },
    {
      symbol: "DJI",
      name: "داو جونز",
      description: "مؤشر 30 شركة أمريكية كبرى.",
      href: "/dowjones",
    },
    {
      symbol: "DAX",
      name: "داكس",
      description: "المؤشر الألماني الرئيسي.",
      href: "/dax",
    },
    {
      symbol: "DXY",
      name: "مؤشر الدولار",
      description: "يؤثر على تدفقات رأس المال.",
      href: "/dxy",
    },
  ],
  links: {
    internal: [
      { label: "الأسواق المالية", href: "/markets" },
      { label: "الأسهم والمؤشرات", href: "/stocks" },
      { label: "S&P 500", href: "/sp500" },
      { label: "داو جونز", href: "/dowjones" },
      { label: "DAX", href: "/dax" },
      { label: "أخبار الأسهم", href: "/news/tag/stocks" },
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "طلب تحليل", href: "/analysis/request" },
      { label: "التنبيهات", href: "/alerts" },
    ],
    jsonLd: [
      { name: "ناسداك Nasdaq", url: "/nasdaq" },
      { name: "S&P 500", url: "/sp500" },
      { name: "داو جونز", url: "/dowjones" },
      { name: "DAX", url: "/dax" },
      { name: "الأسهم", url: "/stocks" },
    ],
    marketSummary: [
      { label: "الأسهم والمؤشرات", href: "/stocks" },
      { label: "أخبار الأسهم", href: "/news/tag/stocks" },
      { label: "التحليل الفني", href: "/technical-analysis" },
    ],
  },
  services: [
    {
      icon: "📊",
      title: "التحليل الفني",
      description: "تحليلات تغطي المؤشرات الأمريكية والعالمية.",
      href: "/technical-analysis",
      cta: "التحليل الفني",
    },
    {
      icon: "🔔",
      title: "التنبيهات السعرية",
      description: "تنبيهات عند وصول ناسداك لمستوياتك المحددة.",
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
    title: "HasaN CharT World | ناسداك Nasdaq — مركز المؤشرات",
    description:
      "مركز معلومات ناسداك: السعر المباشر، شارت TradingView، ملخص السوق، أخبار وتحليلات Nasdaq 100، التنبيهات السعرية.",
    keywords: [
      "HasaN CharT World",
      "ناسداك",
      "Nasdaq",
      "NDX",
      "Nasdaq 100",
      "المؤشرات",
      "الأسهم",
    ],
  },
  jsonLd: {
    productName: "Nasdaq 100",
    alternateNames: ["NDX", "ناسداك", "Nasdaq"],
    productCategory: "Stock Market Index",
    itemListName: "مركز معلومات ناسداك في HasaN CharT World",
    fragmentId: "nasdaq",
  },
  breadcrumbs: [
    { label: "الرئيسية", href: "/" },
    { label: "الأسواق المالية", href: "/markets" },
    { label: "الأسهم والمؤشرات", href: "/stocks" },
    { label: "ناسداك", href: "/nasdaq" },
  ],
};
