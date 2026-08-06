/** @type {import("./types").AssetHubConfig} */
export const dogeAssetConfig = {
  id: "doge",
  slug: "doge",
  path: "/doge",
  name: "دوجكوين",
  nameEn: "Dogecoin",
  symbol: "DOGE",
  tradingViewSymbol: "BINANCE:DOGEUSDT",
  chartSymbol: "DOGEUSDT",
  chartExchange: "BINANCE",
  pricePairLabel: "DOGE / USDT",
  category: "crypto",
  categoryLabel: "العملات الرقمية",
  categoryPath: "/crypto",
  hero: {
    badge: "Asset Hub — Dogecoin",
    title: "دوجكوين (DOGE)",
    description:
      "مركز معلومات متكامل لدوجكوين: السعر المباشر، الشارت، ملخص السوق، آخر الأخبار والتحليلات، والخدمات المرتبطة — ضمن HasaN CharT World.",
    accentRgb: "234,179,8",
  },
  description: {
    marketSummary:
      "دوجكوين عملة رقمية مجتمعية عالية التقلب، تتأثر بقوة بمعنويات السوق والأخبار الاجتماعية والتدفقات السريعة.",
    tradingHours: "24 / 7",
    platform: "Binance",
  },
  news: {
    keywords: ["dogecoin", "doge", "دوج", "دوجكوين"],
    tagHref: "/news/tag/crypto",
    archiveLabel: "أرشيف أخبار الكريبتو",
  },
  analysis: {
    keywords: ["doge", "dogecoin", "دوج", "دوجكوين", "dogeusdt"],
  },
  faq: [
    {
      q: "ما هو دوجكوين (DOGE)؟",
      a: "دوجكوين عملة رقمية بدأت كميم ثم أصبحت من أكثر العملات تداولاً، معروفة بتقلباتها العالية.",
    },
    {
      q: "كيف أتابع سعر دوجكوين؟",
      a: "عبر السعر المباشر وشارت TradingView في صفحة DOGE.",
    },
    {
      q: "هل توفر المنصة تحليلات DOGE؟",
      a: "نعم، عبر التحليلات اليومية وخدمات VIP وطلب تحليل مخصص.",
    },
    {
      q: "كيف أنشئ تنبيه سعري لدوجكوين؟",
      a: "انتقل إلى صفحة التنبيهات وأنشئ تنبيهاً لزوج DOGE/USDT.",
    },
    {
      q: "أين أجد أخبار دوجكوين؟",
      a: "في قسم الأخبار المفلترة في صفحة DOGE أو عبر أخبار الكريبتو.",
    },
  ],
  relatedAssets: [
    { symbol: "BTC", name: "البيتكوين", description: "المرجع الرئيسي لسوق الكريبتو.", href: "/btc" },
    { symbol: "SOL", name: "سولانا", description: "عملة بديلة عالية الزخم.", href: "/crypto" },
    { symbol: "BNB", name: "BNB", description: "عملة منصة Binance.", href: "/crypto" },
    { symbol: "XAU", name: "الذهب", description: "ملاذ آمن عالمي.", href: "/gold" },
  ],
  links: {
    internal: [
      { label: "الأسواق المالية", href: "/markets" },
      { label: "العملات الرقمية", href: "/crypto" },
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "طلب تحليل", href: "/analysis/request" },
      { label: "التنبيهات", href: "/alerts" },
      { label: "VIP Spot", href: "/vip-spot" },
    ],
    jsonLd: [
      { name: "دوجكوين DOGE", url: "/doge" },
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
      description: "توصيات لتداول دوجكوين والكريبتو في السوق الفوري.",
      href: "/vip-spot",
      cta: "استكشف VIP Spot",
    },
    {
      icon: "⚡",
      title: "VIP Futures",
      description: "إشارات عقود DOGE الآجلة.",
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
    title: "HasaN CharT World | دوجكوين DOGE — مركز المعلومات",
    description:
      "مركز معلومات دوجكوين: السعر المباشر، شارت TradingView، ملخص السوق، أخبار وتحليلات DOGE، التنبيهات السعرية وخدمات VIP.",
    keywords: ["HasaN CharT World", "دوجكوين", "DOGE", "Dogecoin", "سعر دوجكوين"],
  },
  jsonLd: {
    productName: "Dogecoin",
    alternateNames: ["DOGE", "دوجكوين"],
    productCategory: "Cryptocurrency",
    itemListName: "مركز معلومات دوجكوين في HasaN CharT World",
    fragmentId: "dogecoin",
  },
  breadcrumbs: [
    { label: "الرئيسية", href: "/" },
    { label: "الأسواق المالية", href: "/markets" },
    { label: "العملات الرقمية", href: "/crypto" },
    { label: "دوجكوين", href: "/doge" },
  ],
};
