/** @type {import("./types").AssetHubConfig} */
export const cac40AssetConfig = {
  id: "cac40",
  slug: "cac40",
  path: "/cac40",
  name: "كاك 40",
  nameEn: "CAC 40",
  symbol: "CAC",
  tradingViewSymbol: "TVC:CAC",
  chartSymbol: "CAC",
  chartExchange: "TVC",
  pricePairLabel: "CAC 40",
  category: "indices",
  categoryLabel: "المؤشرات",
  categoryPath: "/stocks",
  hero: {
    badge: "Global Indices Extended Hub — CAC 40",
    title: "كاك 40 (CAC)",
    description:
      "مركز معلومات متكامل لمؤشر كاك الفرنسي: السعر المباشر، الشارت، ملخص السوق، آخر الأخبار والتحليلات، والخدمات المرتبطة — ضمن HasaN CharT World.",
    accentRgb: "0,85,164",
  },
  description: {
    marketSummary:
      "مؤشر CAC 40 يضم 40 شركة فرنسية كبرى في بورصة باريس، ويتأثر باقتصاد فرنسا واليورو وسياسة البنك المركزي الأوروبي.",
    tradingHours: "24 / 5",
    platform: "TVC",
  },
  news: {
    keywords: [
      "cac",
      "cac40",
      "france",
      "paris",
      "ecb",
      "كاك",
      "فرنسا",
      "stocks",
      "أسهم",
      "euro",
    ],
    tagHref: "/news/tag/stocks",
    archiveLabel: "أرشيف أخبار الأسهم",
  },
  analysis: { keywords: ["cac", "cac 40", "cac40", "france", "كاك", "فرنسا"] },
  faq: [
    {
      q: "ما هو مؤشر CAC 40؟",
      a: "المؤشر الرئيسي لبورصة باريس، يضم 40 شركة فرنسية كبرى ويعكس أداء الاقتصاد الفرنسي.",
    },
    {
      q: "كيف أتابع مؤشر كاك؟",
      a: "عبر السعر المباشر وشارت TradingView في صفحة CAC 40.",
    },
    {
      q: "ما الذي يحرك مؤشر كاك؟",
      a: "سياسة ECB، بيانات الاقتصاد الفرنسي، قوة اليورو، وأداء قطاعات الطاقة والرفاهية.",
    },
    {
      q: "هل توفر المنصة تحليلات CAC؟",
      a: "نعم، عبر التحليلات اليومية وطلب تحليل مخصص.",
    },
    {
      q: "أين أجد أخبار كاك؟",
      a: "في قسم الأخبار المفلترة في هذه الصفحة أو عبر أخبار الأسهم والاقتصاد.",
    },
  ],
  relatedAssets: [
    {
      symbol: "EUR",
      name: "اليورو دولار",
      description: "EUR/USD — مرتبط باقتصاد فرنسا.",
      href: "/eurusd",
    },
    { symbol: "DAX", name: "داكس", description: "مؤشر ألمانيا.", href: "/dax" },
    {
      symbol: "FTSE",
      name: "فوتسي",
      description: "مؤشر بريطانيا.",
      href: "/ftse",
    },
    {
      symbol: "SPX",
      name: "S&P 500",
      description: "المؤشر الأمريكي المرجعي.",
      href: "/sp500",
    },
  ],
  links: {
    internal: [
      { label: "الأسواق المالية", href: "/markets" },
      { label: "الأسهم والمؤشرات", href: "/stocks" },
      { label: "EUR/USD", href: "/eurusd" },
      { label: "DAX", href: "/dax" },
      { label: "FTSE 100", href: "/ftse" },
      { label: "ناسداك", href: "/nasdaq" },
      { label: "أخبار الأسهم", href: "/news/tag/stocks" },
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "التنبيهات", href: "/alerts" },
    ],
    jsonLd: [
      { name: "CAC 40", url: "/cac40" },
      { name: "EUR/USD", url: "/eurusd" },
      { name: "DAX", url: "/dax" },
      { name: "الأسهم", url: "/stocks" },
      { name: "التحليلات اليومية", url: "/daily-analysis" },
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
      description: "تنبيهات عند وصول CAC 40 لمستوياتك المحددة.",
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
    title: "HasaN CharT World | CAC 40 — مركز المؤشرات",
    description:
      "مركز معلومات CAC 40: السعر المباشر، شارت TradingView، ملخص السوق، أخبار وتحليلات مؤشر كاك الفرنسي، التنبيهات السعرية.",
    keywords: [
      "HasaN CharT World",
      "CAC",
      "CAC 40",
      "كاك",
      "فرنسا",
      "المؤشرات",
      "الأسهم",
    ],
  },
  jsonLd: {
    productName: "CAC 40",
    alternateNames: ["CAC", "كاك 40", "CAC40"],
    productCategory: "Stock Market Index",
    itemListName: "مركز معلومات CAC 40 في HasaN CharT World",
    fragmentId: "cac40",
  },
  breadcrumbs: [
    { label: "الرئيسية", href: "/" },
    { label: "الأسواق المالية", href: "/markets" },
    { label: "الأسهم والمؤشرات", href: "/stocks" },
    { label: "CAC 40", href: "/cac40" },
  ],
};
