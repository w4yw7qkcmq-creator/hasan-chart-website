/** @type {import("./types").AssetHubConfig} */
export const goldAssetConfig = {
  id: "gold",
  slug: "xau",
  path: "/xau",
  name: "الذهب",
  nameEn: "Gold",
  symbol: "XAU",
  tradingViewSymbol: "OANDA:XAUUSD",
  chartSymbol: "XAUUSD",
  chartExchange: "OANDA",
  pricePairLabel: "XAU / USD",
  category: "metal",
  categoryLabel: "الذهب",
  categoryPath: "/gold",
  hero: {
    badge: "Asset Hub — Gold",
    title: "الذهب (XAU)",
    description:
      "مركز معلومات متكامل للذهب: السعر المباشر، الشارت، ملخص السوق، آخر الأخبار والتحليلات، والخدمات المرتبطة — ضمن HasaN CharT World.",
    accentRgb: "234,179,8",
  },
  description: {
    marketSummary:
      "الذهب ملاذ آمن عالمي يتأثر بقرارات الفيدرالي والدولار والتضخم والتوترات الجيوسياسية، ويرتبط أحياناً بمعنويات المخاطرة في الأسواق.",
    tradingHours: "24 / 5",
    platform: "OANDA",
  },
  news: {
    keywords: ["gold", "xau", "ذهب"],
    tagHref: "/news/tag/gold",
    archiveLabel: "أرشيف أخبار الذهب",
  },
  analysis: {
    keywords: ["gold", "xau", "xauusd", "ذهب"],
  },
  faq: [
    {
      q: "ما هو تداول الذهب (XAU)؟",
      a: "الذهب معدن ثمين يُتداول كأصل مالي عالمي، ويُعد ملاذاً آمناً في أوقات عدم اليقين الاقتصادي.",
    },
    {
      q: "كيف أتابع سعر الذهب؟",
      a: "عبر السعر المباشر وشارت TradingView في صفحة الذهب.",
    },
    {
      q: "هل توفر المنصة تحليلات الذهب؟",
      a: "نعم، عبر التحليلات اليومية وخدمات VIP وطلب تحليل مخصص.",
    },
    {
      q: "كيف أنشئ تنبيه سعري للذهب؟",
      a: "انتقل إلى صفحة التنبيهات وأنشئ تنبيهاً لسعر XAU/USD.",
    },
    {
      q: "أين أجد أخبار الذهب؟",
      a: "في قسم الأخبار المفلترة في صفحة الذهب أو عبر /news/tag/gold.",
    },
  ],
  relatedAssets: [
    { symbol: "XAG", name: "الفضة", description: "معدن ثمين مرتبط بالذهب والصناعة.", href: "/commodities" },
    { symbol: "OIL", name: "النفط", description: "سلعة طاقة مؤثرة على التضخم.", href: "/oil" },
    { symbol: "FX", name: "الفوركس", description: "الدولار يؤثر مباشرة على سعر الذهب.", href: "/forex" },
    { symbol: "BTC", name: "البيتكوين", description: "أصل رقمي يُقارن أحياناً بالذهب.", href: "/btc" },
  ],
  links: {
    internal: [
      { label: "الأسواق المالية", href: "/markets" },
      { label: "الذهب", href: "/gold" },
      { label: "السلع", href: "/commodities" },
      { label: "أخبار الذهب", href: "/news/tag/gold" },
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "طلب تحليل", href: "/analysis/request" },
      { label: "التنبيهات", href: "/alerts" },
      { label: "الفوركس", href: "/forex" },
    ],
    jsonLd: [
      { name: "الذهب XAU", url: "/xau" },
      { name: "الذهب", url: "/gold" },
      { name: "أخبار الذهب", url: "/news/tag/gold" },
      { name: "التحليلات اليومية", url: "/daily-analysis" },
      { name: "الفوركس", url: "/forex" },
      { name: "السلع", url: "/commodities" },
    ],
    marketSummary: [
      { label: "صفحة الذهب", href: "/gold" },
      { label: "أخبار الذهب", href: "/news/tag/gold" },
      { label: "الفوركس", href: "/forex" },
    ],
  },
  services: [
    {
      icon: "📊",
      title: "إشارات الفوركس",
      description: "تحليلات وإشارات تغطي الذهب ضمن أسواق الفوركس.",
      href: "/forex-signals",
      cta: "إشارات الفوركس",
    },
    {
      icon: "🔔",
      title: "التنبيهات السعرية",
      description: "تنبيهات عند وصول الذهب لمستوياتك المحددة.",
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
    title: "HasaN CharT World | الذهب XAU — مركز المعلومات",
    description:
      "مركز معلومات الذهب: السعر المباشر، شارت TradingView، ملخص السوق، أخبار وتحليلات XAU، التنبيهات السعرية وخدمات التداول.",
    keywords: ["HasaN CharT World", "الذهب", "XAU", "Gold", "سعر الذهب", "تحليل الذهب"],
  },
  jsonLd: {
    productName: "Gold",
    alternateNames: ["XAU", "الذهب"],
    productCategory: "Precious Metal",
    itemListName: "مركز معلومات الذهب في HasaN CharT World",
    fragmentId: "gold",
  },
  breadcrumbs: [
    { label: "الرئيسية", href: "/" },
    { label: "الأسواق المالية", href: "/markets" },
    { label: "الذهب", href: "/gold" },
    { label: "مركز الذهب", href: "/xau" },
  ],
};
