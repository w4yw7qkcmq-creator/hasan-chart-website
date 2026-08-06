/** @type {import("./types").AssetHubConfig} */
export const ltcAssetConfig = {
  id: "ltc",
  slug: "ltc",
  path: "/ltc",
  name: "لايتكوين",
  nameEn: "Litecoin",
  symbol: "LTC",
  tradingViewSymbol: "BINANCE:LTCUSDT",
  chartSymbol: "LTCUSDT",
  chartExchange: "BINANCE",
  pricePairLabel: "LTC / USDT",
  category: "crypto",
  categoryLabel: "العملات الرقمية",
  categoryPath: "/crypto",
  hero: {
    badge: "Crypto Extended Hub — Litecoin",
    title: "لايتكوين (LTC)",
    description:
      "مركز معلومات متكامل للايتكوين: السعر المباشر، الشارت، ملخص السوق، آخر الأخبار والتحليلات، والخدمات المرتبطة — ضمن HasaN CharT World.",
    accentRgb: "52,93,157",
  },
  description: {
    marketSummary:
      "لايتكوين من أوائل العملات الرقمية البديلة، صُممت لمعاملات أسرع من البيتكوين، وتتأثر حركتها باتجاه BTC ومعنويات سوق الكريبتو.",
    tradingHours: "24 / 7",
    platform: "Binance",
  },
  news: {
    keywords: ["litecoin", "ltc", "لايتكوين"],
    tagHref: "/news/tag/crypto",
    archiveLabel: "أرشيف أخبار الكريبتو",
  },
  analysis: {
    keywords: ["ltc", "litecoin", "لايتكوين", "ltcusdt"],
  },
  faq: [
    {
      q: "ما هو لايتكوين (LTC)؟",
      a: "لايتكوين عملة رقمية مبنية على تقنية مشابهة للبيتكوين مع أوقات تأكيد أسرع ورسوم أقل.",
    },
    {
      q: "كيف أتابع سعر لايتكوين؟",
      a: "عبر السعر المباشر وشارت TradingView في صفحة LTC.",
    },
    {
      q: "هل توفر المنصة تحليلات LTC؟",
      a: "نعم، عبر التحليلات اليومية وخدمات VIP وطلب تحليل مخصص.",
    },
    {
      q: "كيف أنشئ تنبيه سعري للايتكوين؟",
      a: "انتقل إلى صفحة التنبيهات وأنشئ تنبيهاً لزوج LTC/USDT.",
    },
    {
      q: "أين أجد أخبار لايتكوين؟",
      a: "في قسم الأخبار المفلترة في صفحة LTC أو عبر أخبار الكريبتو.",
    },
  ],
  relatedAssets: [
    { symbol: "BTC", name: "البيتكوين", description: "المرجع الرئيسي لسوق الكريبتو.", href: "/btc" },
    { symbol: "ETH", name: "الإيثيريوم", description: "ثاني أكبر عملة رقمية.", href: "/eth" },
    { symbol: "DOGE", name: "دوجكوين", description: "عملة ميم مرتبطة بـ LTC تقنياً.", href: "/doge" },
    { symbol: "XRP", name: "ريبل", description: "عملة رقمية للمدفوعات.", href: "/xrp" },
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
      { name: "لايتكوين LTC", url: "/ltc" },
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
      description: "توصيات لتداول لايتكوين والكريبتو في السوق الفوري.",
      href: "/vip-spot",
      cta: "استكشف VIP Spot",
    },
    {
      icon: "⚡",
      title: "VIP Futures",
      description: "إشارات عقود لايتكوين الآجلة.",
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
    title: "HasaN CharT World | لايتكوين LTC — مركز المعلومات",
    description:
      "مركز معلومات لايتكوين: السعر المباشر، شارت TradingView، ملخص السوق، أخبار وتحليلات LTC، التنبيهات السعرية وخدمات VIP.",
    keywords: ["HasaN CharT World", "لايتكوين", "LTC", "Litecoin", "سعر LTC", "تحليل Litecoin"],
  },
  jsonLd: {
    productName: "Litecoin",
    alternateNames: ["LTC", "لايتكوين"],
    productCategory: "Cryptocurrency",
    itemListName: "مركز معلومات لايتكوين في HasaN CharT World",
    fragmentId: "litecoin",
  },
  breadcrumbs: [
    { label: "الرئيسية", href: "/" },
    { label: "الأسواق المالية", href: "/markets" },
    { label: "العملات الرقمية", href: "/crypto" },
    { label: "لايتكوين", href: "/ltc" },
  ],
};
