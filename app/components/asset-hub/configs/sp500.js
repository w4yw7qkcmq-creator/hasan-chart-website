/** @type {import("./types").AssetHubConfig} */
export const sp500AssetConfig = {
  id: "sp500",
  slug: "sp500",
  path: "/sp500",
  name: "إس آند بي 500",
  nameEn: "S&P 500",
  symbol: "SPX",
  tradingViewSymbol: "TVC:SPX",
  chartSymbol: "SPX",
  chartExchange: "TVC",
  pricePairLabel: "S&P 500",
  category: "indices",
  categoryLabel: "المؤشرات",
  categoryPath: "/stocks",
  hero: {
    badge: "Indices Hub — S&P 500",
    title: "إس آند بي 500 (S&P 500)",
    description:
      "مركز معلومات متكامل لمؤشر S&P 500: السعر المباشر، الشارت، ملخص السوق، آخر الأخبار والتحليلات، والخدمات المرتبطة — ضمن HasaN CharT World.",
    accentRgb: "99,102,241",
  },
  description: {
    marketSummary:
      "مؤشر S&P 500 يضم 500 شركة أمريكية كبرى ويُعد المرجع الأوسع لسوق الأسهم الأمريكية، ويتأثر بالأرباح والفائدة والتضخم ومعنويات المستثمرين.",
    tradingHours: "24 / 5",
    platform: "TradingView",
  },
  news: {
    keywords: ["s&p", "s&p 500", "sp500", "spx", "أسهم", "stocks", "earnings", "أرباح"],
    tagHref: "/news/tag/stocks",
    archiveLabel: "أرشيف أخبار الأسهم",
  },
  analysis: {
    keywords: ["s&p", "sp500", "spx", "s&p 500", "اس اند بي"],
  },
  faq: [
    {
      q: "ما هو مؤشر S&P 500؟",
      a: "مؤشر سوقي يضم 500 من أكبر الشركات الأمريكية عبر قطاعات متعددة، ويُعد معياراً لأداء السوق الأمريكي.",
    },
    {
      q: "كيف أتابع مؤشر S&P 500؟",
      a: "عبر السعر المباشر وشارت TradingView في صفحة S&P 500.",
    },
    {
      q: "ما الفرق بين S&P 500 وناسداك؟",
      a: "S&P 500 أوسع قطاعياً (500 شركة)، بينما ناسداك يركز على التكنولوجيا (100 شركة).",
    },
    {
      q: "هل توفر المنصة تحليلات S&P 500؟",
      a: "نعم، عبر التحليلات اليومية وطلب تحليل مخصص.",
    },
    {
      q: "أين أجد أخبار S&P 500؟",
      a: "في قسم الأخبار المفلترة في هذه الصفحة أو عبر أخبار الأسهم.",
    },
  ],
  relatedAssets: [
    { symbol: "NDX", name: "ناسداك", description: "مؤشر التكنولوجيا الأمريكية.", href: "/nasdaq" },
    { symbol: "DJI", name: "داو جونز", description: "مؤشر 30 شركة أمريكية.", href: "/dowjones" },
    { symbol: "DAX", name: "داكس", description: "المؤشر الألماني.", href: "/dax" },
    { symbol: "XAU", name: "الذهب", description: "ملاذ آمن مرتبط بمعنويات المخاطرة.", href: "/xauusd" },
  ],
  links: {
    internal: [
      { label: "الأسواق المالية", href: "/markets" },
      { label: "الأسهم والمؤشرات", href: "/stocks" },
      { label: "ناسداك", href: "/nasdaq" },
      { label: "داو جونز", href: "/dowjones" },
      { label: "DAX", href: "/dax" },
      { label: "أخبار الأسهم", href: "/news/tag/stocks" },
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "التنبيهات", href: "/alerts" },
    ],
    jsonLd: [
      { name: "S&P 500", url: "/sp500" },
      { name: "ناسداك", url: "/nasdaq" },
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
      description: "تحليلات تغطي المؤشرات الأمريكية.",
      href: "/technical-analysis",
      cta: "التحليل الفني",
    },
    {
      icon: "🔔",
      title: "التنبيهات السعرية",
      description: "تنبيهات عند وصول S&P 500 لمستوياتك المحددة.",
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
    title: "HasaN CharT World | S&P 500 — مركز المؤشرات",
    description:
      "مركز معلومات S&P 500: السعر المباشر، شارت TradingView، ملخص السوق، أخبار وتحليلات إس آند بي 500، التنبيهات السعرية.",
    keywords: ["HasaN CharT World", "S&P 500", "SPX", "SP500", "إس آند بي", "المؤشرات", "الأسهم"],
  },
  jsonLd: {
    productName: "S&P 500",
    alternateNames: ["SPX", "SP500", "إس آند بي 500"],
    productCategory: "Stock Market Index",
    itemListName: "مركز معلومات S&P 500 في HasaN CharT World",
    fragmentId: "sp500",
  },
  breadcrumbs: [
    { label: "الرئيسية", href: "/" },
    { label: "الأسواق المالية", href: "/markets" },
    { label: "الأسهم والمؤشرات", href: "/stocks" },
    { label: "S&P 500", href: "/sp500" },
  ],
};
