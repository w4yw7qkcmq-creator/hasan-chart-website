/** @type {import("./types").AssetHubConfig} */
export const maticAssetConfig = {
  id: "matic",
  slug: "matic",
  path: "/matic",
  name: "بوليجون",
  nameEn: "Polygon",
  symbol: "MATIC",
  tradingViewSymbol: "BINANCE:MATICUSDT",
  chartSymbol: "MATICUSDT",
  chartExchange: "BINANCE",
  pricePairLabel: "MATIC / USDT",
  category: "crypto",
  categoryLabel: "العملات الرقمية",
  categoryPath: "/crypto",
  hero: {
    badge: "Crypto Extended Hub — Polygon",
    title: "بوليجون (MATIC)",
    description:
      "مركز معلومات متكامل لبوليجون: السعر المباشر، الشارت، ملخص السوق، آخر الأخبار والتحليلات، والخدمات المرتبطة — ضمن HasaN CharT World.",
    accentRgb: "130,71,229",
  },
  description: {
    marketSummary:
      "بوليجون (MATIC) حل توسّع Layer 2 لإيثيريوم يخفّض رسوم المعاملات ويسرّع التطبيقات اللامركزية، وتتأثر حركته بتبني DeFi وNFTs على الشبكة.",
    tradingHours: "24 / 7",
    platform: "Binance",
  },
  news: {
    keywords: ["polygon", "matic", "بوليجون", "pol"],
    tagHref: "/news/tag/crypto",
    archiveLabel: "أرشيف أخبار الكريبتو",
  },
  analysis: { keywords: ["matic", "polygon", "بوليجون", "maticusdt"] },
  faq: [
    {
      q: "ما هو بوليجون (MATIC)؟",
      a: "بوليجون شبكة Layer 2 توسّع إيثيريوم بمعاملات أسرع وأرخص للتطبيقات اللامركزية.",
    },
    {
      q: "كيف أتابع سعر بوليجون؟",
      a: "عبر السعر المباشر وشارت TradingView في صفحة MATIC.",
    },
    {
      q: "هل توفر المنصة تحليلات MATIC؟",
      a: "نعم، عبر التحليلات اليومية وخدمات VIP وطلب تحليل مخصص.",
    },
    {
      q: "كيف أنشئ تنبيه سعري لبوليجون؟",
      a: "انتقل إلى صفحة التنبيهات وأنشئ تنبيهاً لزوج MATIC/USDT.",
    },
    {
      q: "أين أجد أخبار بوليجون؟",
      a: "في قسم الأخبار المفلترة في صفحة MATIC أو عبر أخبار الكريبتو.",
    },
  ],
  relatedAssets: [
    {
      symbol: "ETH",
      name: "الإيثيريوم",
      description: "الشبكة الأساسية لبوليجون.",
      href: "/eth",
    },
    {
      symbol: "BTC",
      name: "البيتكوين",
      description: "المرجع الرئيسي لسوق الكريبتو.",
      href: "/btc",
    },
    {
      symbol: "SOL",
      name: "سولانا",
      description: "بلوكتشين عالي الأداء.",
      href: "/sol",
    },
    {
      symbol: "AVAX",
      name: "أفالانش",
      description: "منصة بلوكتشين متعددة السلاسل.",
      href: "/avax",
    },
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
      { name: "بوليجون MATIC", url: "/matic" },
      { name: "العملات الرقمية", url: "/crypto" },
      { name: "الإيثيريوم", url: "/eth" },
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
      description: "توصيات لتداول بوليجون والكريبتو في السوق الفوري.",
      href: "/vip-spot",
      cta: "استكشف VIP Spot",
    },
    {
      icon: "⚡",
      title: "VIP Futures",
      description: "إشارات عقود بوليجون الآجلة.",
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
    title: "HasaN CharT World | بوليجون MATIC — مركز المعلومات",
    description:
      "مركز معلومات بوليجون: السعر المباشر، شارت TradingView، ملخص السوق، أخبار وتحليلات MATIC، التنبيهات السعرية وخدمات VIP.",
    keywords: [
      "HasaN CharT World",
      "بوليجون",
      "MATIC",
      "Polygon",
      "سعر MATIC",
      "تحليل Polygon",
    ],
  },
  jsonLd: {
    productName: "Polygon",
    alternateNames: ["MATIC", "بوليجون"],
    productCategory: "Cryptocurrency",
    itemListName: "مركز معلومات بوليجون في HasaN CharT World",
    fragmentId: "polygon",
  },
  breadcrumbs: [
    { label: "الرئيسية", href: "/" },
    { label: "الأسواق المالية", href: "/markets" },
    { label: "العملات الرقمية", href: "/crypto" },
    { label: "بوليجون", href: "/matic" },
  ],
};
