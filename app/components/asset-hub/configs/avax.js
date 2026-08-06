/** @type {import("./types").AssetHubConfig} */
export const avaxAssetConfig = {
  id: "avax",
  slug: "avax",
  path: "/avax",
  name: "أفالانش",
  nameEn: "Avalanche",
  symbol: "AVAX",
  tradingViewSymbol: "BINANCE:AVAXUSDT",
  chartSymbol: "AVAXUSDT",
  chartExchange: "BINANCE",
  pricePairLabel: "AVAX / USDT",
  category: "crypto",
  categoryLabel: "العملات الرقمية",
  categoryPath: "/crypto",
  hero: {
    badge: "Crypto Extended Hub — Avalanche",
    title: "أفالانش (AVAX)",
    description:
      "مركز معلومات متكامل لأفالانش: السعر المباشر، الشارت، ملخص السوق، آخر الأخبار والتحليلات، والخدمات المرتبطة — ضمن HasaN CharT World.",
    accentRgb: "232,65,66",
  },
  description: {
    marketSummary:
      "أفالانش منصة بلوكتشين متعددة السلاسل تستهدف DeFi وNFTs والتطبيقات اللامركزية، وتتأثر حركتها بزخم النظام البيئي والتدفقات على المنصات المركزية.",
    tradingHours: "24 / 7",
    platform: "Binance",
  },
  news: {
    keywords: ["avalanche", "avax", "أفالانش"],
    tagHref: "/news/tag/crypto",
    archiveLabel: "أرشيف أخبار الكريبتو",
  },
  analysis: { keywords: ["avax", "avalanche", "أفالانش", "avaxusdt"] },
  faq: [
    {
      q: "ما هي أفالانش (AVAX)؟",
      a: "أفالانش شبكة بلوكتشين سريعة تدعم العقود الذكية والتطبيقات اللامركزية عبر سلاسل فرعية متعددة.",
    },
    {
      q: "كيف أتابع سعر أفالانش؟",
      a: "عبر السعر المباشر وشارت TradingView في صفحة AVAX.",
    },
    {
      q: "هل توفر المنصة تحليلات AVAX؟",
      a: "نعم، عبر التحليلات اليومية وخدمات VIP وطلب تحليل مخصص.",
    },
    {
      q: "كيف أنشئ تنبيه سعري لأفالانش؟",
      a: "انتقل إلى صفحة التنبيهات وأنشئ تنبيهاً لزوج AVAX/USDT.",
    },
    {
      q: "أين أجد أخبار أفالانش؟",
      a: "في قسم الأخبار المفلترة في صفحة AVAX أو عبر أخبار الكريبتو.",
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
      href: "/eth",
    },
    {
      symbol: "SOL",
      name: "سولانا",
      description: "بلوكتشين عالي الأداء منافس.",
      href: "/sol",
    },
    {
      symbol: "DOT",
      name: "بولكادوت",
      description: "شبكة متعددة السلاسل.",
      href: "/dot",
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
      { name: "أفالانش AVAX", url: "/avax" },
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
      description: "توصيات لتداول أفالانش والكريبتو في السوق الفوري.",
      href: "/vip-spot",
      cta: "استكشف VIP Spot",
    },
    {
      icon: "⚡",
      title: "VIP Futures",
      description: "إشارات عقود أفالانش الآجلة.",
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
    title: "HasaN CharT World | أفالانش AVAX — مركز المعلومات",
    description:
      "مركز معلومات أفالانش: السعر المباشر، شارت TradingView، ملخص السوق، أخبار وتحليلات AVAX، التنبيهات السعرية وخدمات VIP.",
    keywords: [
      "HasaN CharT World",
      "أفالانش",
      "AVAX",
      "Avalanche",
      "سعر أفالانش",
      "تحليل AVAX",
    ],
  },
  jsonLd: {
    productName: "Avalanche",
    alternateNames: ["AVAX", "أفالانش"],
    productCategory: "Cryptocurrency",
    itemListName: "مركز معلومات أفالانش في HasaN CharT World",
    fragmentId: "avalanche",
  },
  breadcrumbs: [
    { label: "الرئيسية", href: "/" },
    { label: "الأسواق المالية", href: "/markets" },
    { label: "العملات الرقمية", href: "/crypto" },
    { label: "أفالانش", href: "/avax" },
  ],
};
