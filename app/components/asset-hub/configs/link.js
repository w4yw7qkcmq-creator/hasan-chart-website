/** @type {import("./types").AssetHubConfig} */
export const linkAssetConfig = {
  id: "link",
  slug: "link",
  path: "/link",
  name: "تشين لينك",
  nameEn: "Chainlink",
  symbol: "LINK",
  tradingViewSymbol: "BINANCE:LINKUSDT",
  chartSymbol: "LINKUSDT",
  chartExchange: "BINANCE",
  pricePairLabel: "LINK / USDT",
  category: "crypto",
  categoryLabel: "العملات الرقمية",
  categoryPath: "/crypto",
  hero: {
    badge: "Crypto Extended Hub — Chainlink",
    title: "تشين لينك (LINK)",
    description:
      "مركز معلومات متكامل لتشين لينك: السعر المباشر، الشارت، ملخص السوق، آخر الأخبار والتحليلات، والخدمات المرتبطة — ضمن HasaN CharT World.",
    accentRgb: "42,90,218",
  },
  description: {
    marketSummary:
      "تشين لينك شبكة أوراكل لامركزية تربط البلوكتشين بالبيانات الخارجية، وتتأثر حركتها بتبني DeFi والطلب على خدمات الأوراكل.",
    tradingHours: "24 / 7",
    platform: "Binance",
  },
  news: {
    keywords: ["chainlink", "link", "تشين لينك", "oracle"],
    tagHref: "/news/tag/crypto",
    archiveLabel: "أرشيف أخبار الكريبتو",
  },
  analysis: {
    keywords: ["link", "chainlink", "تشين لينك", "linkusdt"],
  },
  faq: [
    {
      q: "ما هو تشين لينك (LINK)؟",
      a: "تشين لينك شبكة أوراكل لامركزية توفر بيانات موثوقة للعقود الذكية والتطبيقات اللامركزية.",
    },
    {
      q: "كيف أتابع سعر تشين لينك؟",
      a: "عبر السعر المباشر وشارت TradingView في صفحة LINK.",
    },
    {
      q: "هل توفر المنصة تحليلات LINK؟",
      a: "نعم، عبر التحليلات اليومية وخدمات VIP وطلب تحليل مخصص.",
    },
    {
      q: "كيف أنشئ تنبيه سعري لتشين لينك؟",
      a: "انتقل إلى صفحة التنبيهات وأنشئ تنبيهاً لزوج LINK/USDT.",
    },
    {
      q: "أين أجد أخبار تشين لينك؟",
      a: "في قسم الأخبار المفلترة في صفحة LINK أو عبر أخبار الكريبتو.",
    },
  ],
  relatedAssets: [
    { symbol: "BTC", name: "البيتكوين", description: "المرجع الرئيسي لسوق الكريبتو.", href: "/btc" },
    { symbol: "ETH", name: "الإيثيريوم", description: "منصة العقود الذكية الرائدة.", href: "/eth" },
    { symbol: "ADA", name: "كاردانو", description: "بلوكتشين للعقود الذكية.", href: "/ada" },
    { symbol: "DOT", name: "بولكادوت", description: "شبكة متعددة السلاسل.", href: "/dot" },
  ],
  links: {
    internal: [
      { label: "الأسواق المالية", href: "/markets" },
      { label: "العملات الرقمية", href: "/crypto" },
      { label: "تحليل الكريبتو", href: "/crypto-analysis" },
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "طلب تحليل", href: "/analysis/request" },
      { label: "التنبيهات", href: "/alerts" },
      { label: "VIP Spot", href: "/vip-spot" },
    ],
    jsonLd: [
      { name: "تشين لينك LINK", url: "/link" },
      { name: "العملات الرقمية", url: "/crypto" },
      { name: "البيتكوين", url: "/btc" },
      { name: "التحليلات اليومية", url: "/daily-analysis" },
    ],
    marketSummary: [
      { label: "سوق الكريبتو", href: "/crypto" },
      { label: "أخبار الكريبتو", href: "/news/tag/crypto" },
      { label: "التحليل الفني", href: "/technical-analysis" },
    ],
  },
  services: [
    {
      icon: "💎",
      title: "VIP Spot",
      description: "توصيات لتداول تشين لينك والكريبتو في السوق الفوري.",
      href: "/vip-spot",
      cta: "استكشف VIP Spot",
    },
    {
      icon: "⚡",
      title: "VIP Futures",
      description: "إشارات عقود تشين لينك الآجلة.",
      href: "/vip-futures",
      cta: "استكشف VIP Futures",
    },
    {
      icon: "🛡️",
      title: "إدارة الحسابات",
      description: "إدارة محافظ الكريبتو.",
      href: "/account-management",
      cta: "إدارة الحسابات",
    },
  ],
  metadata: {
    title: "HasaN CharT World | تشين لينك LINK — مركز المعلومات",
    description:
      "مركز معلومات تشين لينك: السعر المباشر، شارت TradingView، ملخص السوق، أخبار وتحليلات LINK، التنبيهات السعرية وخدمات VIP.",
    keywords: ["HasaN CharT World", "تشين لينك", "LINK", "Chainlink", "سعر LINK", "تحليل Chainlink"],
  },
  jsonLd: {
    productName: "Chainlink",
    alternateNames: ["LINK", "تشين لينك"],
    productCategory: "Cryptocurrency",
    itemListName: "مركز معلومات تشين لينك في HasaN CharT World",
    fragmentId: "chainlink",
  },
  breadcrumbs: [
    { label: "الرئيسية", href: "/" },
    { label: "الأسواق المالية", href: "/markets" },
    { label: "العملات الرقمية", href: "/crypto" },
    { label: "تشين لينك", href: "/link" },
  ],
};
