/** @type {import("./types").AssetHubConfig} */
export const silverAssetConfig = {
  id: "silver",
  slug: "xag",
  path: "/xag",
  name: "الفضة",
  nameEn: "Silver",
  symbol: "XAG",
  tradingViewSymbol: "OANDA:XAGUSD",
  chartSymbol: "XAGUSD",
  chartExchange: "OANDA",
  pricePairLabel: "XAG / USD",
  category: "metal",
  categoryLabel: "السلع",
  categoryPath: "/commodities",
  hero: {
    badge: "Metals Hub — Silver",
    title: "الفضة (XAG)",
    description:
      "مركز معلومات متكامل للفضة: السعر المباشر، الشارت، ملخص السوق، آخر الأخبار والتحليلات، والخدمات المرتبطة — ضمن HasaN CharT World.",
    accentRgb: "148,163,184",
  },
  description: {
    marketSummary:
      "الفضة معدن ثمين وصناعي يتحرك مع الذهب والطلب الصناعي والتضخم، وغالباً أكثر تقلباً من الذهب.",
    tradingHours: "24 / 5",
    platform: "OANDA",
  },
  news: {
    keywords: ["silver", "xag", "فضة"],
    tagHref: "/news/tag/commodities",
    archiveLabel: "أرشيف أخبار السلع",
  },
  analysis: { keywords: ["silver", "xag", "xagusd", "فضة"] },
  faq: [
    {
      q: "ما هو تداول الفضة (XAG)؟",
      a: "الفضة معدن ثمين يُستخدم في الصناعة والمجوهرات، ويُتداول كأصل مالي عالمي.",
    },
    {
      q: "كيف أتابع سعر الفضة؟",
      a: "عبر السعر المباشر وشارت TradingView في صفحة الفضة.",
    },
    {
      q: "هل توفر المنصة تحليلات الفضة؟",
      a: "نعم، عبر التحليلات اليومية وطلب تحليل مخصص.",
    },
    {
      q: "كيف أنشئ تنبيه سعري للفضة؟",
      a: "انتقل إلى صفحة التنبيهات وأنشئ تنبيهاً لسعر XAG/USD.",
    },
    {
      q: "أين أجد أخبار الفضة؟",
      a: "في قسم الأخبار المفلترة في صفحة الفضة أو عبر أخبار السلع.",
    },
  ],
  relatedAssets: [
    {
      symbol: "XAU",
      name: "الذهب",
      description: "المعدن الثمين المرجعي — مركز XAU.",
      href: "/xau",
    },
    {
      symbol: "OIL",
      name: "النفط الأمريكي",
      description: "سلعة طاقة WTI — مركز USOIL.",
      href: "/usoil",
    },
    {
      symbol: "FX",
      name: "الفوركس",
      description: "الدولار يؤثر على أسعار المعادن.",
      href: "/forex",
    },
    {
      symbol: "BTC",
      name: "البيتكوين",
      description: "أصل رقمي مرتبط بمعنويات المخاطرة.",
      href: "/btc",
    },
  ],
  links: {
    internal: [
      { label: "الأسواق المالية", href: "/markets" },
      { label: "السلع", href: "/commodities" },
      { label: "الذهب XAU", href: "/xau" },
      { label: "النفط USOIL", href: "/usoil" },
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "طلب تحليل", href: "/analysis/request" },
      { label: "التنبيهات", href: "/alerts" },
      { label: "الفوركس", href: "/forex" },
    ],
    jsonLd: [
      { name: "الفضة XAG", url: "/xag" },
      { name: "الذهب XAU", url: "/xau" },
      { name: "النفط USOIL", url: "/usoil" },
      { name: "السلع", url: "/commodities" },
      { name: "التحليلات اليومية", url: "/daily-analysis" },
    ],
    marketSummary: [
      { label: "الذهب XAU", href: "/xau" },
      { label: "السلع", href: "/commodities" },
      { label: "الفوركس", href: "/forex" },
    ],
  },
  services: [
    {
      icon: "📊",
      title: "إشارات الفوركس",
      description: "تحليلات تغطي المعادن ضمن أسواق الفوركس.",
      href: "/forex-signals",
      cta: "إشارات الفوركس",
    },
    {
      icon: "🔔",
      title: "التنبيهات السعرية",
      description: "تنبيهات عند وصول الفضة لمستوياتك المحددة.",
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
    title: "HasaN CharT World | الفضة XAG — مركز المعلومات",
    description:
      "مركز معلومات الفضة: السعر المباشر، شارت TradingView، ملخص السوق، أخبار وتحليلات XAG، التنبيهات السعرية.",
    keywords: ["HasaN CharT World", "الفضة", "XAG", "Silver", "سعر الفضة"],
  },
  jsonLd: {
    productName: "Silver",
    alternateNames: ["XAG", "الفضة"],
    productCategory: "Precious Metal",
    itemListName: "مركز معلومات الفضة في HasaN CharT World",
    fragmentId: "silver",
  },
  breadcrumbs: [
    { label: "الرئيسية", href: "/" },
    { label: "الأسواق المالية", href: "/markets" },
    { label: "السلع", href: "/commodities" },
    { label: "الفضة", href: "/xag" },
  ],
};
