/** @type {import("./types").AssetHubConfig} */
export const eurgbpAssetConfig = {
  id: "eurgbp",
  slug: "eurgbp",
  path: "/eurgbp",
  name: "اليورو جنيه",
  nameEn: "Euro / British Pound",
  symbol: "EURGBP",
  tradingViewSymbol: "OANDA:EURGBP",
  chartSymbol: "EURGBP",
  chartExchange: "OANDA",
  pricePairLabel: "EUR / GBP",
  category: "forex",
  categoryLabel: "الفوركس",
  categoryPath: "/forex",
  hero: {
    badge: "Forex Cross Hub — EUR/GBP",
    title: "اليورو جنيه (EUR/GBP)",
    description:
      "مركز معلومات متكامل لزوج EUR/GBP: السعر المباشر، الشارت، ملخص السوق، آخر الأخبار والتحليلات، والخدمات المرتبطة — ضمن HasaN CharT World.",
    accentRgb: "59,130,246",
  },
  description: {
    marketSummary:
      "EUR/GBP زوج متقاطع يعكس العلاقة بين اقتصاد منطقة اليورو والمملكة المتحدة، ويتأثر بسياسة البنك المركزي الأوروبي وبنك إنجلترا وبيانات النمو والتضخم.",
    tradingHours: "24 / 5",
    platform: "OANDA",
  },
  news: {
    keywords: ["eurgbp", "eur/gbp", "euro pound", "ecb", "boe", "اليورو", "جنيه", "forex", "فوركس"],
    tagHref: "/news/tag/forex",
    archiveLabel: "أرشيف أخبار الفوركس",
  },
  analysis: {
    keywords: ["eurgbp", "eur/gbp", "eur gbp", "euro pound", "اليورو جنيه"],
  },
  faq: [
    {
      q: "ما هو زوج EUR/GBP؟",
      a: "زوج اليورو مقابل الجنيه الإسترليني، ويعكس قوة منطقة اليورو مقابل المملكة المتحدة.",
    },
    {
      q: "كيف أتابع سعر EUR/GBP؟",
      a: "عبر السعر المباشر وشارت TradingView في صفحة EUR/GBP.",
    },
    {
      q: "ما العوامل المؤثرة على EUR/GBP؟",
      a: "سياسة ECB وBoE، بيانات التضخم والنمو في أوروبا وبريطانيا، والعلاقات التجارية.",
    },
    {
      q: "هل توفر المنصة تحليلات EUR/GBP؟",
      a: "نعم، عبر التحليلات اليومية وإشارات الفوركس وطلب تحليل مخصص.",
    },
    {
      q: "أين أجد أخبار EUR/GBP؟",
      a: "في قسم الأخبار المفلترة في هذه الصفحة أو عبر أرشيف أخبار الفوركس.",
    },
  ],
  relatedAssets: [
    { symbol: "EUR", name: "اليورو دولار", description: "زوج EUR/USD — الجانب الأوروبي.", href: "/eurusd" },
    { symbol: "GBP", name: "الجنيه دولار", description: "زوج GBP/USD — الكابل.", href: "/gbpusd" },
    { symbol: "JPY", name: "اليورو ين", description: "زوج EUR/JPY — متقاطع أوروبي.", href: "/eurjpy" },
    { symbol: "DXY", name: "مؤشر الدولار", description: "مرجع قوة الدولار.", href: "/dxy" },
  ],
  links: {
    internal: [
      { label: "الأسواق المالية", href: "/markets" },
      { label: "الفوركس", href: "/forex" },
      { label: "EUR/USD", href: "/eurusd" },
      { label: "GBP/USD", href: "/gbpusd" },
      { label: "EUR/JPY", href: "/eurjpy" },
      { label: "أخبار الفوركس", href: "/news/tag/forex" },
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "إشارات الفوركس", href: "/forex-signals" },
      { label: "التنبيهات", href: "/alerts" },
    ],
    jsonLd: [
      { name: "EUR/GBP", url: "/eurgbp" },
      { name: "EUR/USD", url: "/eurusd" },
      { name: "GBP/USD", url: "/gbpusd" },
      { name: "الفوركس", url: "/forex" },
      { name: "التحليلات اليومية", url: "/daily-analysis" },
    ],
    marketSummary: [
      { label: "الفوركس", href: "/forex" },
      { label: "EUR/USD", href: "/eurusd" },
      { label: "أخبار الفوركس", href: "/news/tag/forex" },
    ],
  },
  services: [
    {
      icon: "📊",
      title: "إشارات الفوركس",
      description: "تحليلات وإشارات لزوج EUR/GBP والأزواج المتقاطعة.",
      href: "/forex-signals",
      cta: "إشارات الفوركس",
    },
    {
      icon: "🔔",
      title: "التنبيهات السعرية",
      description: "تنبيهات عند وصول EUR/GBP لمستوياتك المحددة.",
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
    title: "HasaN CharT World | EUR/GBP — مركز معلومات الفوركس",
    description:
      "مركز معلومات EUR/GBP: السعر المباشر، شارت TradingView، ملخص السوق، أخبار وتحليلات اليورو جنيه، التنبيهات السعرية.",
    keywords: ["HasaN CharT World", "EUR/GBP", "EURGBP", "اليورو جنيه", "الفوركس", "Forex"],
  },
  jsonLd: {
    productName: "EUR/GBP",
    alternateNames: ["EURGBP", "اليورو جنيه"],
    productCategory: "Foreign Exchange",
    itemListName: "مركز معلومات EUR/GBP في HasaN CharT World",
    fragmentId: "eurgbp",
  },
  breadcrumbs: [
    { label: "الرئيسية", href: "/" },
    { label: "الأسواق المالية", href: "/markets" },
    { label: "الفوركس", href: "/forex" },
    { label: "EUR/GBP", href: "/eurgbp" },
  ],
};
