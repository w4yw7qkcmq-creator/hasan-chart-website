/** @type {import("./types").AssetHubConfig} */
export const oilAssetConfig = {
  id: "oil",
  slug: "usoil",
  path: "/usoil",
  name: "النفط",
  nameEn: "Oil",
  symbol: "OIL",
  tradingViewSymbol: "TVC:USOIL",
  chartSymbol: "USOIL",
  chartExchange: "TVC",
  pricePairLabel: "US Oil",
  category: "energy",
  categoryLabel: "النفط",
  categoryPath: "/oil",
  hero: {
    badge: "Energy Hub — US Oil",
    title: "النفط الأمريكي (USOIL)",
    description:
      "مركز معلومات متكامل للنفط الأمريكي WTI: السعر المباشر، الشارت، ملخص السوق، آخر الأخبار والتحليلات، والخدمات المرتبطة — ضمن HasaN CharT World.",
    accentRgb: "34,197,94",
  },
  description: {
    marketSummary:
      "النفط سلعة طاقة محورية يتأثر بقرارات أوبك والمخزونات الأمريكية والتوترات الجيوسياسية والطلب العالمي على الطاقة.",
    tradingHours: "24 / 5",
    platform: "TradingView",
  },
  news: {
    keywords: ["oil", "brent", "crude", "opec", "نفط", "أوبك", "wti"],
    tagHref: "/news/tag/oil",
    archiveLabel: "أرشيف أخبار النفط",
  },
  analysis: {
    keywords: ["oil", "brent", "wti", "crude", "opec", "نفط", "أوبك", "usoil"],
  },
  faq: [
    {
      q: "ما هو تداول النفط؟",
      a: "النفط سلعة طاقة عالمية يُتداول عبر عقود WTI وبرنت، ويؤثر على التضخم والأسواق المالية.",
    },
    {
      q: "كيف أتابع سعر النفط؟",
      a: "عبر السعر المباشر وشارت TradingView في صفحة النفط.",
    },
    {
      q: "هل توفر المنصة تحليلات النفط؟",
      a: "نعم، عبر التحليلات اليومية وطلب تحليل مخصص.",
    },
    {
      q: "كيف أنشئ تنبيه سعري للنفط؟",
      a: "انتقل إلى صفحة التنبيهات وأنشئ تنبيهاً لسعر النفط.",
    },
    {
      q: "أين أجد أخبار النفط؟",
      a: "في قسم الأخبار المفلترة في صفحة النفط أو عبر /news/tag/oil.",
    },
  ],
  relatedAssets: [
    {
      symbol: "XAU",
      name: "الذهب",
      description: "ملاذ آمن مرتبط بالتضخم — مركز XAU.",
      href: "/xau",
    },
    {
      symbol: "XAG",
      name: "الفضة",
      description: "معدن ثمين مرتبط بالصناعة — مركز XAG.",
      href: "/xag",
    },
    {
      symbol: "FX",
      name: "الفوركس",
      description: "الدولار والعملات النفطية.",
      href: "/forex",
    },
    {
      symbol: "BTC",
      name: "البيتكوين",
      description: "أصل رقمي يتأثر بمعنويات المخاطرة.",
      href: "/btc",
    },
  ],
  links: {
    internal: [
      { label: "الأسواق المالية", href: "/markets" },
      { label: "النفط", href: "/oil" },
      { label: "الذهب XAU", href: "/xau" },
      { label: "الفضة XAG", href: "/xag" },
      { label: "السلع", href: "/commodities" },
      { label: "أخبار النفط", href: "/news/tag/oil" },
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "طلب تحليل", href: "/analysis/request" },
      { label: "التنبيهات", href: "/alerts" },
      { label: "الفوركس", href: "/forex" },
    ],
    jsonLd: [
      { name: "النفط الأمريكي USOIL", url: "/usoil" },
      { name: "الذهب XAU", url: "/xau" },
      { name: "الفضة XAG", url: "/xag" },
      { name: "أخبار النفط", url: "/news/tag/oil" },
      { name: "التحليلات اليومية", url: "/daily-analysis" },
      { name: "السلع", url: "/commodities" },
    ],
    marketSummary: [
      { label: "الذهب XAU", href: "/xau" },
      { label: "أخبار النفط", href: "/news/tag/oil" },
      { label: "السلع", href: "/commodities" },
    ],
  },
  services: [
    {
      icon: "📊",
      title: "إشارات الفوركس",
      description: "تحليلات تغطي النفط والسلع ضمن الأسواق العالمية.",
      href: "/forex-signals",
      cta: "إشارات الفوركس",
    },
    {
      icon: "🔔",
      title: "التنبيهات السعرية",
      description: "تنبيهات عند وصول النفط لمستوياتك المحددة.",
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
    title: "HasaN CharT World | النفط الأمريكي USOIL — مركز المعلومات",
    description:
      "مركز معلومات النفط الأمريكي WTI (USOIL): السعر المباشر، شارت TradingView، ملخص السوق، أخبار وتحليلات النفط، التنبيهات السعرية.",
    keywords: [
      "HasaN CharT World",
      "النفط",
      "USOIL",
      "WTI",
      "Oil",
      "Brent",
      "أوبك",
      "سعر النفط",
    ],
  },
  jsonLd: {
    productName: "US Crude Oil",
    alternateNames: ["USOIL", "OIL", "النفط", "WTI"],
    productCategory: "Energy Commodity",
    itemListName: "مركز معلومات النفط الأمريكي USOIL في HasaN CharT World",
    fragmentId: "usoil",
  },
  breadcrumbs: [
    { label: "الرئيسية", href: "/" },
    { label: "الأسواق المالية", href: "/markets" },
    { label: "النفط", href: "/oil" },
    { label: "USOIL", href: "/usoil" },
  ],
};
