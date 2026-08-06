/** @type {import("./types").AssetHubConfig} */
export const solAssetConfig = {
  id: "sol",
  slug: "sol",
  path: "/sol",
  name: "سولانا",
  nameEn: "Solana",
  symbol: "SOL",
  tradingViewSymbol: "BINANCE:SOLUSDT",
  chartSymbol: "SOLUSDT",
  chartExchange: "BINANCE",
  pricePairLabel: "SOL / USDT",
  category: "crypto",
  categoryLabel: "العملات الرقمية",
  categoryPath: "/crypto",
  hero: {
    badge: "Asset Hub — Solana",
    title: "سولانا (SOL)",
    description:
      "مركز معلومات متكامل لسولانا: السعر المباشر، الشارت، ملخص السوق، آخر الأخبار والتحليلات، والخدمات المرتبطة — ضمن HasaN CharT World.",
    accentRgb: "20,184,166",
  },
  description: {
    marketSummary:
      "سولانا بلوكتشين عالي الأداء يستهدف التطبيقات اللامركزية وNFTs، وتتأثر حركته بزخم المجتمع والتدفقات على المنصات المركزية.",
    tradingHours: "24 / 7",
    platform: "Binance",
  },
  news: {
    keywords: ["solana", "sol", "سولانا"],
    tagHref: "/news/tag/crypto",
    archiveLabel: "أرشيف أخبار الكريبتو",
  },
  analysis: { keywords: ["sol", "solana", "سولانا", "solusdt"] },
  faq: [
    {
      q: "ما هي سولانا (SOL)؟",
      a: "سولانا شبكة بلوكتشين سريعة تدعم العقود الذكية والتطبيقات اللامركزية بمعاملات منخفضة التكلفة.",
    },
    {
      q: "كيف أتابع سعر سولانا؟",
      a: "عبر السعر المباشر وشارت TradingView في صفحة SOL.",
    },
    {
      q: "هل توفر المنصة تحليلات SOL؟",
      a: "نعم، عبر التحليلات اليومية وخدمات VIP وطلب تحليل مخصص.",
    },
    {
      q: "كيف أنشئ تنبيه سعري لسولانا؟",
      a: "انتقل إلى صفحة التنبيهات وأنشئ تنبيهاً لزوج SOL/USDT.",
    },
    {
      q: "أين أجد أخبار سولانا؟",
      a: "في قسم الأخبار المفلترة في صفحة SOL أو عبر أخبار الكريبتو.",
    },
  ],
  relatedAssets: [
    {
      symbol: "BTC",
      name: "البيتكوين",
      description: "المرجع الرئيسي لسوق الكريبتو.",
      href: "/btc",
    },
    {
      symbol: "ETH",
      name: "الإيثيريوم",
      description: "منصة العقود الذكية الرائدة.",
      href: "/crypto",
    },
    {
      symbol: "BNB",
      name: "BNB",
      description: "عملة منصة Binance ونظامها البيئي.",
      href: "/crypto",
    },
    {
      symbol: "XAU",
      name: "الذهب",
      description: "ملاذ آمن مرتبط بمعنويات المخاطرة.",
      href: "/gold",
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
      { name: "سولانا SOL", url: "/sol" },
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
      description: "توصيات لتداول سولانا والكريبتو في السوق الفوري.",
      href: "/vip-spot",
      cta: "استكشف VIP Spot",
    },
    {
      icon: "⚡",
      title: "VIP Futures",
      description: "إشارات عقود سولانا الآجلة.",
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
    title: "HasaN CharT World | سولانا SOL — مركز المعلومات",
    description:
      "مركز معلومات سولانا: السعر المباشر، شارت TradingView، ملخص السوق، أخبار وتحليلات SOL، التنبيهات السعرية وخدمات VIP.",
    keywords: [
      "HasaN CharT World",
      "سولانا",
      "SOL",
      "Solana",
      "سعر سولانا",
      "تحليل SOL",
    ],
  },
  jsonLd: {
    productName: "Solana",
    alternateNames: ["SOL", "سولانا"],
    productCategory: "Cryptocurrency",
    itemListName: "مركز معلومات سولانا في HasaN CharT World",
    fragmentId: "solana",
  },
  breadcrumbs: [
    { label: "الرئيسية", href: "/" },
    { label: "الأسواق المالية", href: "/markets" },
    { label: "العملات الرقمية", href: "/crypto" },
    { label: "سولانا", href: "/sol" },
  ],
};
