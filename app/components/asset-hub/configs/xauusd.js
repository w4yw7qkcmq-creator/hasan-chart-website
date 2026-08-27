/** @type {import("./types").AssetHubConfig} */
export const xauusdAssetConfig = {
  id: "xauusd",
  slug: "xauusd",
  path: "/xauusd",
  name: "الذهب مقابل الدولار",
  nameEn: "Gold / US Dollar",
  symbol: "XAUUSD",
  tradingViewSymbol: "OANDA:XAUUSD",
  chartSymbol: "XAUUSD",
  chartExchange: "OANDA",
  pricePairLabel: "XAU / USD",
  category: "global",
  categoryLabel: "الأصول العالمية",
  categoryPath: "/markets",
  hero: {
    badge: "Global Assets Hub — XAU/USD",
    title: "الذهب مقابل الدولار (XAU/USD)",
    description:
      "مركز معلومات متكامل لزوج XAU/USD: السعر المباشر، الشارت، ملخص السوق، آخر الأخبار والتحليلات، والخدمات المرتبطة — ضمن HasaN CharT World.",
    accentRgb: "234,179,8",
  },
  description: {
    marketSummary:
      "زوج XAU/USD يعكس سعر الذهب بالدولار الأمريكي، ويتأثر بمؤشر الدولار DXY وقرارات الفيدرالي والتضخم والتوترات الجيوسياسية — علاقة عكسية غالباً مع قوة الدولار.",
    tradingHours: "24 / 5",
    platform: "OANDA",
  },
  news: {
    keywords: ["xauusd", "xau/usd", "gold", "xau", "ذهب", "dollar", "fed", "الدولار"],
    tagHref: "/news/tag/gold",
    archiveLabel: "أرشيف أخبار الذهب",
  },
  analysis: {
    keywords: ["xauusd", "xau/usd", "xau usd", "gold", "xau", "ذهب"],
  },
  faq: [
    {
      q: "ما هو زوج XAU/USD؟",
      a: "سعر أونصة الذهب مقابل الدولار الأمريكي، وهو المرجع العالمي لتداول الذهب في أسواق الفوركس والسلع.",
    },
    {
      q: "كيف يرتبط XAU/USD بمؤشر الدولار DXY؟",
      a: "غالباً علاقة عكسية — ارتفاع الدولار يضغط على الذهب، وانخفاضه يدعم XAU/USD.",
    },
    {
      q: "كيف أتابع سعر XAU/USD؟",
      a: "عبر السعر المباشر وشارت TradingView في هذه الصفحة.",
    },
    {
      q: "هل توفر المنصة تحليلات XAU/USD؟",
      a: "نعم، عبر التحليلات اليومية وإشارات الفوركس وطلب تحليل مخصص.",
    },
    {
      q: "ما الفرق بين /xauusd و /xau؟",
      a: "كلاهما يغطي الذهب — /xauusd يركز على الزوج XAU/USD ضمن الأصول العالمية، و /xau مركز معلومات الذهب كمعدن ثمين.",
    },
  ],
  relatedAssets: [
    { symbol: "DXY", name: "مؤشر الدولار", description: "مرجع قوة الدولار — عكسي غالباً مع الذهب.", href: "/dxy" },
    { symbol: "EUR", name: "اليورو دولار", description: "زوج EUR/USD — مرتبط بحركة الدولار.", href: "/eurusd" },
    { symbol: "XAG", name: "الفضة", description: "XAG/USD — معدن ثمين مرتبط بالذهب.", href: "/xag" },
    { symbol: "OIL", name: "النفط", description: "USOIL — سلعة طاقة مؤثرة على التضخم.", href: "/usoil" },
  ],
  links: {
    internal: [
      { label: "الأسواق المالية", href: "/markets" },
      { label: "مؤشر الدولار DXY", href: "/dxy" },
      { label: "EUR/USD", href: "/eurusd" },
      { label: "الذهب XAU", href: "/xauusd" },
      { label: "أخبار الذهب", href: "/news/tag/gold" },
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "طلب تحليل", href: "/analysis/request" },
      { label: "التنبيهات", href: "/alerts" },
      { label: "إشارات الفوركس", href: "/forex-signals" },
    ],
    jsonLd: [
      { name: "XAU/USD", url: "/xauusd" },
      { name: "مؤشر الدولار DXY", url: "/dxy" },
      { name: "EUR/USD", url: "/eurusd" },
      { name: "الذهب XAU", url: "/xauusd" },
      { name: "التحليلات اليومية", url: "/daily-analysis" },
    ],
    marketSummary: [
      { label: "مؤشر DXY", href: "/dxy" },
      { label: "أخبار الذهب", href: "/news/tag/gold" },
      { label: "الفوركس", href: "/forex" },
    ],
  },
  services: [
    {
      icon: "📊",
      title: "إشارات الفوركس",
      description: "تحليلات وإشارات تغطي XAU/USD والمعادن ضمن الفوركس.",
      href: "/forex-signals",
      cta: "إشارات الفوركس",
    },
    {
      icon: "🔔",
      title: "التنبيهات السعرية",
      description: "تنبيهات عند وصول XAU/USD لمستوياتك المحددة.",
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
    title: "HasaN CharT World | XAU/USD — مركز الأصول العالمية",
    description:
      "مركز معلومات XAU/USD: السعر المباشر، شارت TradingView، ملخص السوق، أخبار وتحليلات الذهب مقابل الدولار، التنبيهات السعرية.",
    keywords: [
      "HasaN CharT World",
      "XAU/USD",
      "XAUUSD",
      "الذهب دولار",
      "سعر الذهب",
      "Gold USD",
      "DXY",
      "تحليل الذهب",
    ],
  },
  jsonLd: {
    productName: "Gold / US Dollar",
    alternateNames: ["XAUUSD", "XAU/USD", "الذهب مقابل الدولار"],
    productCategory: "Precious Metal",
    itemListName: "مركز معلومات XAU/USD في HasaN CharT World",
    fragmentId: "xauusd",
  },
  breadcrumbs: [
    { label: "الرئيسية", href: "/" },
    { label: "الأسواق المالية", href: "/markets" },
    { label: "الأصول العالمية", href: "/markets" },
    { label: "XAU/USD", href: "/xauusd" },
  ],
};
