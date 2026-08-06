/** @type {import("./types").AssetHubConfig} */
export const usdcadAssetConfig = {
  id: "usdcad",
  slug: "usdcad",
  path: "/usdcad",
  name: "الدولار كندي",
  nameEn: "US Dollar / Canadian Dollar",
  symbol: "USDCAD",
  tradingViewSymbol: "OANDA:USDCAD",
  chartSymbol: "USDCAD",
  chartExchange: "OANDA",
  pricePairLabel: "USD / CAD",
  category: "forex",
  categoryLabel: "الفوركس",
  categoryPath: "/forex",
  hero: {
    badge: "Forex Extended Hub — USD/CAD",
    title: "الدولار كندي (USD/CAD)",
    description:
      "مركز معلومات متكامل لزوج USD/CAD: السعر المباشر، الشارت، ملخص السوق، آخر الأخبار والتحليلات، والخدمات المرتبطة — ضمن HasaN CharT World.",
    accentRgb: "239,68,68",
  },
  description: {
    marketSummary:
      "USD/CAD المعروف باللوني (Loonie) مرتبط بأسعار النفط والاقتصاد الكندي، ويتأثر بسياسة بنك كندا والفيدرالي وأسعار الطاقة.",
    tradingHours: "24 / 5",
    platform: "OANDA",
  },
  news: {
    keywords: [
      "usdcad",
      "usd/cad",
      "cad",
      "loonie",
      "canada",
      "boc",
      "كندا",
      "لوني",
      "oil",
      "نفط",
      "forex",
    ],
    tagHref: "/news/tag/forex",
    archiveLabel: "أرشيف أخبار الفوركس",
  },
  analysis: {
    keywords: ["usdcad", "usd/cad", "usd cad", "cad", "loonie", "كندا", "لوني"],
  },
  faq: [
    {
      q: "ما هو زوج USD/CAD؟",
      a: "زوج الدولار الأمريكي مقابل الدولار الكندي، ويُعرف باللوني ويرتبط بأسعار النفط.",
    },
    {
      q: "كيف أتابع سعر USD/CAD؟",
      a: "عبر السعر المباشر وشارت TradingView في صفحة USD/CAD.",
    },
    {
      q: "لماذا يرتبط اللوني بالنفط؟",
      a: "كندا من أكبر مصدري النفط، فارتفاع أسعار النفط يدعم الدولار الكندي ويؤثر على USD/CAD.",
    },
    {
      q: "هل توفر المنصة تحليلات USD/CAD؟",
      a: "نعم، عبر التحليلات اليومية وإشارات الفوركس وطلب تحليل مخصص.",
    },
    {
      q: "أين أجد أخبار USD/CAD؟",
      a: "في قسم الأخبار المفلترة في هذه الصفحة أو عبر أرشيف أخبار الفوركس.",
    },
  ],
  relatedAssets: [
    {
      symbol: "OIL",
      name: "النفط الأمريكي",
      description: "USOIL — مرتبط باللوني.",
      href: "/usoil",
    },
    {
      symbol: "AUD",
      name: "الأسترالي دولار",
      description: "زوج AUD/USD — عملة سلعية.",
      href: "/audusd",
    },
    {
      symbol: "EUR",
      name: "اليورو دولار",
      description: "زوج EUR/USD.",
      href: "/eurusd",
    },
    {
      symbol: "DXY",
      name: "مؤشر الدولار",
      description: "مرجع قوة الدولار.",
      href: "/dxy",
    },
  ],
  links: {
    internal: [
      { label: "الأسواق المالية", href: "/markets" },
      { label: "الفوركس", href: "/forex" },
      { label: "النفط USOIL", href: "/usoil" },
      { label: "AUD/USD", href: "/audusd" },
      { label: "NZD/USD", href: "/nzdusd" },
      { label: "أخبار الفوركس", href: "/news/tag/forex" },
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "التنبيهات", href: "/alerts" },
    ],
    jsonLd: [
      { name: "USD/CAD", url: "/usdcad" },
      { name: "USOIL", url: "/usoil" },
      { name: "AUD/USD", url: "/audusd" },
      { name: "الفوركس", url: "/forex" },
    ],
    marketSummary: [
      { label: "النفط USOIL", href: "/usoil" },
      { label: "الفوركس", href: "/forex" },
      { label: "أخبار الفوركس", href: "/news/tag/forex" },
    ],
  },
  services: [
    {
      icon: "📊",
      title: "إشارات الفوركس",
      description: "تحليلات وإشارات لزوج USD/CAD.",
      href: "/forex-signals",
      cta: "إشارات الفوركس",
    },
    {
      icon: "🔔",
      title: "التنبيهات السعرية",
      description: "تنبيهات عند وصول USD/CAD لمستوياتك المحددة.",
      href: "/price-alerts",
      cta: "التنبيهات السعرية",
    },
    {
      icon: "🛡️",
      title: "إدارة الحسابات",
      description: "إدارة محافظ الفوركس والمخاطر.",
      href: "/account-management",
      cta: "إدارة الحسابات",
    },
  ],
  metadata: {
    title: "HasaN CharT World | USD/CAD — مركز معلومات الفوركس",
    description:
      "مركز معلومات USD/CAD: السعر المباشر، شارت TradingView، ملخص السوق، أخبار وتحليلات الدولار كندي، التنبيهات السعرية.",
    keywords: [
      "HasaN CharT World",
      "USD/CAD",
      "USDCAD",
      "اللوني",
      "Loonie",
      "كندا",
      "الفوركس",
    ],
  },
  jsonLd: {
    productName: "USD/CAD",
    alternateNames: ["USDCAD", "الدولار كندي", "Loonie"],
    productCategory: "Foreign Exchange",
    itemListName: "مركز معلومات USD/CAD في HasaN CharT World",
    fragmentId: "usdcad",
  },
  breadcrumbs: [
    { label: "الرئيسية", href: "/" },
    { label: "الأسواق المالية", href: "/markets" },
    { label: "الفوركس", href: "/forex" },
    { label: "USD/CAD", href: "/usdcad" },
  ],
};
