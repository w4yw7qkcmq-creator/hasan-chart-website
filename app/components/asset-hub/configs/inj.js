/** @type {import("./types").AssetHubConfig} */
export const injAssetConfig = {
  id: "inj",
  slug: "inj",
  path: "/inj",
  name: "إينجكتيف",
  nameEn: "Injective",
  symbol: "INJ",
  tradingViewSymbol: "BINANCE:INJUSDT",
  chartSymbol: "INJUSDT",
  chartExchange: "BINANCE",
  pricePairLabel: "INJ / USDT",
  category: "crypto",
  categoryLabel: "العملات الرقمية",
  categoryPath: "/crypto",
  hero: {
    badge: "Crypto Growth Hub — Injective",
    title: "إينجكتيف (INJ)",
    description:
      "مركز معلومات متكامل لإينجكتيف: السعر المباشر، الشارت، ملخص السوق، آخر الأخبار والتحليلات، والخدمات المرتبطة — ضمن HasaN CharT World.",
    accentRgb: "0,193,222",
  },
  description: {
    marketSummary:
      "Injective بلوكتشين Layer 1 مبني للتمويل اللامركزي والتداول عبر السلاسل، وتتأثر حركة INJ بزخم DeFi ونشاط التداول على الشبكة.",
    tradingHours: "24 / 7",
    platform: "Binance",
  },
  news: {
    keywords: ["injective", "inj", "إينجكتيف", "defi", "cosmos"],
    tagHref: "/news/tag/crypto",
    archiveLabel: "أرشيف أخبار الكريبتو",
  },
  analysis: {
    keywords: ["inj", "injective", "إينجكتيف", "injusdt"],
  },
  faq: [
    {
      q: "ما هو Injective (INJ)؟",
      a: "Injective بلوكتشين Layer 1 يستهدف التداول اللامركزي والمشتقات المالية عبر السلاسل.",
    },
    {
      q: "كيف أتابع سعر إينجكتيف؟",
      a: "عبر السعر المباشر وشارت TradingView في صفحة INJ.",
    },
    {
      q: "هل توفر المنصة تحليلات INJ؟",
      a: "نعم، عبر التحليلات اليومية وخدمات VIP وطلب تحليل مخصص.",
    },
    {
      q: "كيف أنشئ تنبيه سعري لإينجكتيف؟",
      a: "انتقل إلى صفحة التنبيهات وأنشئ تنبيهاً لزوج INJ/USDT.",
    },
    {
      q: "أين أجد أخبار إينجكتيف؟",
      a: "في قسم الأخبار المفلترة في صفحة INJ أو عبر أخبار الكريبتو.",
    },
  ],
  relatedAssets: [
    { symbol: "ATOM", name: "كوزموس", description: "شبكة Interchain مرتبطة.", href: "/atom" },
    { symbol: "UNI", name: "يونيسواب", description: "بروتوكول DEX.", href: "/uni" },
    { symbol: "ETH", name: "الإيثيريوم", description: "منصة DeFi الرائدة.", href: "/eth" },
    { symbol: "SOL", name: "سولانا", description: "بلوكتشين عالي الأداء.", href: "/sol" },
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
      { name: "إينجكتيف INJ", url: "/inj" },
      { name: "العملات الرقمية", url: "/crypto" },
      { name: "كوزموس", url: "/atom" },
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
      description: "توصيات لتداول إينجكتيف والكريبتو في السوق الفوري.",
      href: "/vip-spot",
      cta: "استكشف VIP Spot",
    },
    {
      icon: "⚡",
      title: "VIP Futures",
      description: "إشارات عقود إينجكتيف الآجلة.",
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
    title: "HasaN CharT World | إينجكتيف INJ — مركز المعلومات",
    description:
      "مركز معلومات Injective: السعر المباشر، شارت TradingView، ملخص السوق، أخبار وتحليلات INJ، التنبيهات السعرية وخدمات VIP.",
    keywords: ["HasaN CharT World", "إينجكتيف", "INJ", "Injective", "DeFi", "سعر INJ"],
  },
  jsonLd: {
    productName: "Injective",
    alternateNames: ["INJ", "إينجكتيف"],
    productCategory: "Cryptocurrency",
    itemListName: "مركز معلومات Injective في HasaN CharT World",
    fragmentId: "injective",
  },
  breadcrumbs: [
    { label: "الرئيسية", href: "/" },
    { label: "الأسواق المالية", href: "/markets" },
    { label: "العملات الرقمية", href: "/crypto" },
    { label: "إينجكتيف", href: "/inj" },
  ],
};
