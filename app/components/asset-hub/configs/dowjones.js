/** @type {import("./types").AssetHubConfig} */
export const dowjonesAssetConfig = {
  id: "dowjones",
  slug: "dowjones",
  path: "/dowjones",
  name: "داو جونز",
  nameEn: "Dow Jones",
  symbol: "DJI",
  tradingViewSymbol: "TVC:DJI",
  chartSymbol: "DJI",
  chartExchange: "TVC",
  pricePairLabel: "Dow Jones",
  category: "indices",
  categoryLabel: "المؤشرات",
  categoryPath: "/stocks",
  hero: {
    badge: "Indices Hub — Dow Jones",
    title: "داو جونز (Dow Jones)",
    description:
      "مركز معلومات متكامل لمؤشر داو جونز: السعر المباشر، الشارت، ملخص السوق، آخر الأخبار والتحليلات، والخدمات المرتبطة — ضمن HasaN CharT World.",
    accentRgb: "14,165,233",
  },
  description: {
    marketSummary:
      "مؤشر داو جونز الصناعي يضم 30 شركة أمريكية كبرى، ويُعد من أقدم مؤشرات الأسهم في العالم ومرآة للاقتصاد الأمريكي التقليدي.",
    tradingHours: "24 / 5",
    platform: "TradingView",
  },
  news: {
    keywords: ["dow", "dow jones", "dji", "djia", "داو", "داوجونز", "stocks", "أسهم"],
    tagHref: "/news/tag/stocks",
    archiveLabel: "أرشيف أخبار الأسهم",
  },
  analysis: {
    keywords: ["dow", "dow jones", "dji", "djia", "داو"],
  },
  faq: [
    {
      q: "ما هو مؤشر داو جونز؟",
      a: "مؤشر يضم 30 شركة أمريكية كبرى من قطاعات صناعية ومالية واستهلاكية، ويُعد مرجعاً تاريخياً للسوق الأمريكي.",
    },
    {
      q: "كيف أتابع مؤشر داو جونز؟",
      a: "عبر السعر المباشر وشارت TradingView في صفحة داو جونز.",
    },
    {
      q: "لماذا يهم داو جونز المتداولين؟",
      a: "لأنه يعكس ثقة المستثمرين في أكبر الشركات الأمريكية ويتحرك مع الأخبار الاقتصادية والجيوسياسية.",
    },
    {
      q: "هل توفر المنصة تحليلات داو جونز؟",
      a: "نعم، عبر التحليلات اليومية وطلب تحليل مخصص.",
    },
    {
      q: "أين أجد أخبار داو جونز؟",
      a: "في قسم الأخبار المفلترة في هذه الصفحة أو عبر أخبار الأسهم.",
    },
  ],
  relatedAssets: [
    { symbol: "SPX", name: "S&P 500", description: "المؤشر الأمريكي الأوسع.", href: "/sp500" },
    { symbol: "NDX", name: "ناسداك", description: "مؤشر التكنولوجيا.", href: "/nasdaq" },
    { symbol: "DAX", name: "داكس", description: "المؤشر الألماني.", href: "/dax" },
    { symbol: "DXY", name: "مؤشر الدولار", description: "يؤثر على تدفقات الأسهم.", href: "/dxy" },
  ],
  links: {
    internal: [
      { label: "الأسواق المالية", href: "/markets" },
      { label: "الأسهم والمؤشرات", href: "/stocks" },
      { label: "ناسداك", href: "/nasdaq" },
      { label: "S&P 500", href: "/sp500" },
      { label: "DAX", href: "/dax" },
      { label: "أخبار الأسهم", href: "/news/tag/stocks" },
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "التنبيهات", href: "/alerts" },
    ],
    jsonLd: [
      { name: "داو جونز", url: "/dowjones" },
      { name: "ناسداك", url: "/nasdaq" },
      { name: "S&P 500", url: "/sp500" },
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
      description: "تحليلات تغطي المؤشرات الأمريكية.",
      href: "/technical-analysis",
      cta: "التحليل الفني",
    },
    {
      icon: "🔔",
      title: "التنبيهات السعرية",
      description: "تنبيهات عند وصول داو جونز لمستوياتك المحددة.",
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
    title: "HasaN CharT World | داو جونز — مركز المؤشرات",
    description:
      "مركز معلومات داو جونز: السعر المباشر، شارت TradingView، ملخص السوق، أخبار وتحليلات Dow Jones، التنبيهات السعرية.",
    keywords: ["HasaN CharT World", "داو جونز", "Dow Jones", "DJI", "DJIA", "المؤشرات", "الأسهم"],
  },
  jsonLd: {
    productName: "Dow Jones Industrial Average",
    alternateNames: ["DJI", "DJIA", "داو جونز", "Dow Jones"],
    productCategory: "Stock Market Index",
    itemListName: "مركز معلومات داو جونز في HasaN CharT World",
    fragmentId: "dowjones",
  },
  breadcrumbs: [
    { label: "الرئيسية", href: "/" },
    { label: "الأسواق المالية", href: "/markets" },
    { label: "الأسهم والمؤشرات", href: "/stocks" },
    { label: "داو جونز", href: "/dowjones" },
  ],
};
