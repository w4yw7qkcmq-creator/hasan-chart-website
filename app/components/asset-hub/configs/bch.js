/** @type {import("./types").AssetHubConfig} */
export const bchAssetConfig = {
  id: "bch",
  slug: "bch",
  path: "/bch",
  name: "بيتكوين كاش",
  nameEn: "Bitcoin Cash",
  symbol: "BCH",
  tradingViewSymbol: "BINANCE:BCHUSDT",
  chartSymbol: "BCHUSDT",
  chartExchange: "BINANCE",
  pricePairLabel: "BCH / USDT",
  category: "crypto",
  categoryLabel: "العملات الرقمية",
  categoryPath: "/crypto",
  hero: {
    badge: "Crypto Growth Hub — Bitcoin Cash",
    title: "بيتكوين كاش (BCH)",
    description:
      "مركز معلومات متكامل لبيتكوين كاش: السعر المباشر، الشارت، ملخص السوق، آخر الأخبار والتحليلات، والخدمات المرتبطة — ضمن HasaN CharT World.",
    accentRgb: "8,166,80",
  },
  description: {
    marketSummary:
      "بيتكوين كاش فُرع من البيتكوين يستهدف معاملات أسرع ورسوم أقل، وتتأثر حركته باتجاه BTC ومعنويات سوق الكريبتو.",
    tradingHours: "24 / 7",
    platform: "Binance",
  },
  news: {
    keywords: ["bitcoin cash", "bch", "بيتكوين كاش"],
    tagHref: "/news/tag/crypto",
    archiveLabel: "أرشيف أخبار الكريبتو",
  },
  analysis: { keywords: ["bch", "bitcoin cash", "بيتكوين كاش", "bchusdt"] },
  faq: [
    {
      q: "ما هو بيتكوين كاش (BCH)؟",
      a: "بيتكوين كاش عملة رقمية انفصلت عن البيتكوين عام 2017 لتحسين سرعة المعاملات وخفض الرسوم.",
    },
    {
      q: "كيف أتابع سعر بيتكوين كاش؟",
      a: "عبر السعر المباشر وشارت TradingView في صفحة BCH.",
    },
    {
      q: "هل توفر المنصة تحليلات BCH؟",
      a: "نعم، عبر التحليلات اليومية وخدمات VIP وطلب تحليل مخصص.",
    },
    {
      q: "كيف أنشئ تنبيه سعري لبيتكوين كاش؟",
      a: "انتقل إلى صفحة التنبيهات وأنشئ تنبيهاً لزوج BCH/USDT.",
    },
    {
      q: "أين أجد أخبار بيتكوين كاش؟",
      a: "في قسم الأخبار المفلترة في صفحة BCH أو عبر أخبار الكريبتو.",
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
      symbol: "LTC",
      name: "لايتكوين",
      description: "عملة دفع سريعة مشابهة.",
      href: "/ltc",
    },
    {
      symbol: "ETH",
      name: "الإيثيريوم",
      description: "منصة العقود الذكية.",
      href: "/eth",
    },
    {
      symbol: "XRP",
      name: "ريبل",
      description: "عملة رقمية للمدفوعات.",
      href: "/xrp",
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
      { name: "بيتكوين كاش BCH", url: "/bch" },
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
      description: "توصيات لتداول بيتكوين كاش والكريبتو في السوق الفوري.",
      href: "/vip-spot",
      cta: "استكشف VIP Spot",
    },
    {
      icon: "⚡",
      title: "VIP Futures",
      description: "إشارات عقود بيتكوين كاش الآجلة.",
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
    title: "HasaN CharT World | بيتكوين كاش BCH — مركز المعلومات",
    description:
      "مركز معلومات بيتكوين كاش: السعر المباشر، شارت TradingView، ملخص السوق، أخبار وتحليلات BCH، التنبيهات السعرية وخدمات VIP.",
    keywords: [
      "HasaN CharT World",
      "بيتكوين كاش",
      "BCH",
      "Bitcoin Cash",
      "سعر BCH",
    ],
  },
  jsonLd: {
    productName: "Bitcoin Cash",
    alternateNames: ["BCH", "بيتكوين كاش"],
    productCategory: "Cryptocurrency",
    itemListName: "مركز معلومات بيتكوين كاش في HasaN CharT World",
    fragmentId: "bitcoin-cash",
  },
  breadcrumbs: [
    { label: "الرئيسية", href: "/" },
    { label: "الأسواق المالية", href: "/markets" },
    { label: "العملات الرقمية", href: "/crypto" },
    { label: "بيتكوين كاش", href: "/bch" },
  ],
};
