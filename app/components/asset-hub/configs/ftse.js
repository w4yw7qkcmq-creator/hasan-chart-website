/** @type {import("./types").AssetHubConfig} */
export const ftseAssetConfig = {
  id: "ftse",
  slug: "ftse",
  path: "/ftse",
  name: "فوتسي",
  nameEn: "FTSE 100",
  symbol: "UKX",
  tradingViewSymbol: "TVC:UKX",
  chartSymbol: "UKX",
  chartExchange: "TVC",
  pricePairLabel: "FTSE 100",
  category: "indices",
  categoryLabel: "المؤشرات",
  categoryPath: "/stocks",
  hero: {
    badge: "Global Indices Extended Hub — FTSE 100",
    title: "فوتسي 100 (FTSE)",
    description:
      "مركز معلومات متكامل لمؤشر فوتسي البريطاني: السعر المباشر، الشارت، ملخص السوق، آخر الأخبار والتحليلات، والخدمات المرتبطة — ضمن HasaN CharT World.",
    accentRgb: "30,64,175",
  },
  description: {
    marketSummary:
      "مؤشر FTSE 100 يضم 100 شركة بريطانية كبرى في بورصة لندن، ويتأثر باقتصاد المملكة المتحدة وسياسة بنك إنجلترا والجنيه الإسترليني.",
    tradingHours: "24 / 5",
    platform: "TVC",
  },
  news: {
    keywords: [
      "ftse",
      "uk",
      "london",
      "britain",
      "boe",
      "فوتسي",
      "بريطانيا",
      "stocks",
      "أسهم",
      "pound",
    ],
    tagHref: "/news/tag/stocks",
    archiveLabel: "أرشيف أخبار الأسهم",
  },
  analysis: {
    keywords: ["ftse", "ftse 100", "ukx", "uk", "فوتسي", "بريطانيا"],
  },
  faq: [
    {
      q: "ما هو مؤشر FTSE 100؟",
      a: "المؤشر الرئيسي لبورصة لندن، يضم 100 شركة بريطانية كبرى ويعكس أداء الاقتصاد البريطاني.",
    },
    {
      q: "كيف أتابع مؤشر فوتسي؟",
      a: "عبر السعر المباشر وشارت TradingView في صفحة FTSE 100.",
    },
    {
      q: "ما الذي يحرك مؤشر فوتسي؟",
      a: "سياسة بنك إنجلترا، بيانات الاقتصاد البريطاني، قوة الجنيه، وأسعار الطاقة والسلع.",
    },
    {
      q: "هل توفر المنصة تحليلات FTSE؟",
      a: "نعم، عبر التحليلات اليومية وطلب تحليل مخصص.",
    },
    {
      q: "أين أجد أخبار فوتسي؟",
      a: "في قسم الأخبار المفلترة في هذه الصفحة أو عبر أخبار الأسهم والاقتصاد.",
    },
  ],
  relatedAssets: [
    {
      symbol: "GBP",
      name: "الجنيه دولار",
      description: "GBP/USD — الكابل البريطاني.",
      href: "/gbpusd",
    },
    {
      symbol: "EUR",
      name: "اليورو جنيه",
      description: "EUR/GBP — مرتبط ببريطانيا.",
      href: "/eurgbp",
    },
    {
      symbol: "DAX",
      name: "داكس",
      description: "مؤشر أوروبي رئيسي.",
      href: "/dax",
    },
    {
      symbol: "CAC",
      name: "كاك 40",
      description: "مؤشر فرنسا.",
      href: "/cac40",
    },
  ],
  links: {
    internal: [
      { label: "الأسواق المالية", href: "/markets" },
      { label: "الأسهم والمؤشرات", href: "/stocks" },
      { label: "GBP/USD", href: "/gbpusd" },
      { label: "EUR/GBP", href: "/eurgbp" },
      { label: "DAX", href: "/dax" },
      { label: "CAC 40", href: "/cac40" },
      { label: "Nikkei 225", href: "/nikkei" },
      { label: "أخبار الأسهم", href: "/news/tag/stocks" },
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "التنبيهات", href: "/alerts" },
    ],
    jsonLd: [
      { name: "FTSE 100", url: "/ftse" },
      { name: "GBP/USD", url: "/gbpusd" },
      { name: "DAX", url: "/dax" },
      { name: "الأسهم", url: "/stocks" },
      { name: "التحليلات اليومية", url: "/daily-analysis" },
    ],
    marketSummary: [
      { label: "GBP/USD", href: "/gbpusd" },
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
      description: "تنبيهات عند وصول FTSE لمستوياتك المحددة.",
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
    title: "HasaN CharT World | FTSE 100 — مركز المؤشرات",
    description:
      "مركز معلومات FTSE 100: السعر المباشر، شارت TradingView، ملخص السوق، أخبار وتحليلات مؤشر فوتسي البريطاني، التنبيهات السعرية.",
    keywords: [
      "HasaN CharT World",
      "FTSE",
      "FTSE 100",
      "فوتسي",
      "بريطانيا",
      "المؤشرات",
      "الأسهم",
    ],
  },
  jsonLd: {
    productName: "FTSE 100",
    alternateNames: ["UKX", "فوتسي", "FTSE"],
    productCategory: "Stock Market Index",
    itemListName: "مركز معلومات FTSE 100 في HasaN CharT World",
    fragmentId: "ftse",
  },
  breadcrumbs: [
    { label: "الرئيسية", href: "/" },
    { label: "الأسواق المالية", href: "/markets" },
    { label: "الأسهم والمؤشرات", href: "/stocks" },
    { label: "FTSE 100", href: "/ftse" },
  ],
};
