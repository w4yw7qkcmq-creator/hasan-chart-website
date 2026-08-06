/** @type {import("./types").AssetHubConfig} */
export const atomAssetConfig = {
  id: "atom",
  slug: "atom",
  path: "/atom",
  name: "كوزموس",
  nameEn: "Cosmos",
  symbol: "ATOM",
  tradingViewSymbol: "BINANCE:ATOMUSDT",
  chartSymbol: "ATOMUSDT",
  chartExchange: "BINANCE",
  pricePairLabel: "ATOM / USDT",
  category: "crypto",
  categoryLabel: "العملات الرقمية",
  categoryPath: "/crypto",
  hero: {
    badge: "Crypto DeFi Hub — Cosmos",
    title: "كوزموس (ATOM)",
    description:
      "مركز معلومات متكامل لكوزموس: السعر المباشر، الشارت، ملخص السوق، آخر الأخبار والتحليلات، والخدمات المرتبطة — ضمن HasaN CharT World.",
    accentRgb: "44,122,255",
  },
  description: {
    marketSummary:
      "كوزموس شبكة بلوكتشين تهدف لربط السلاسل المختلفة عبر IBC، وتتأثر حركة ATOM بتطور النظام البيئي والتطبيقات المبنية عليه.",
    tradingHours: "24 / 7",
    platform: "Binance",
  },
  news: {
    keywords: ["cosmos", "atom", "كوزموس", "ibc", "interchain"],
    tagHref: "/news/tag/crypto",
    archiveLabel: "أرشيف أخبار الكريبتو",
  },
  analysis: { keywords: ["atom", "cosmos", "كوزموس", "atomusdt"] },
  faq: [
    {
      q: "ما هو كوزموس (ATOM)؟",
      a: "كوزموس شبكة بلوكتشين تربط السلاسل المختلفة عبر بروتوكول Inter-Blockchain Communication (IBC).",
    },
    {
      q: "كيف أتابع سعر كوزموس؟",
      a: "عبر السعر المباشر وشارت TradingView في صفحة ATOM.",
    },
    {
      q: "هل توفر المنصة تحليلات ATOM؟",
      a: "نعم، عبر التحليلات اليومية وخدمات VIP وطلب تحليل مخصص.",
    },
    {
      q: "كيف أنشئ تنبيه سعري لكوزموس؟",
      a: "انتقل إلى صفحة التنبيهات وأنشئ تنبيهاً لزوج ATOM/USDT.",
    },
    {
      q: "أين أجد أخبار كوزموس؟",
      a: "في قسم الأخبار المفلترة في صفحة ATOM أو عبر أخبار الكريبتو.",
    },
  ],
  relatedAssets: [
    {
      symbol: "DOT",
      name: "بولكادوت",
      description: "شبكة متعددة السلاسل.",
      href: "/dot",
    },
    {
      symbol: "AVAX",
      name: "أفالانش",
      description: "بلوكتشين متعدد السلاسل.",
      href: "/avax",
    },
    {
      symbol: "ETH",
      name: "الإيثيريوم",
      description: "منصة العقود الذكية.",
      href: "/eth",
    },
    {
      symbol: "LINK",
      name: "تشين لينك",
      description: "شبكة أوراكل.",
      href: "/link",
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
      { name: "كوزموس ATOM", url: "/atom" },
      { name: "العملات الرقمية", url: "/crypto" },
      { name: "بولكادوت", url: "/dot" },
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
      description: "توصيات لتداول كوزموس والكريبتو في السوق الفوري.",
      href: "/vip-spot",
      cta: "استكشف VIP Spot",
    },
    {
      icon: "⚡",
      title: "VIP Futures",
      description: "إشارات عقود كوزموس الآجلة.",
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
    title: "HasaN CharT World | كوزموس ATOM — مركز المعلومات",
    description:
      "مركز معلومات كوزموس: السعر المباشر، شارت TradingView، ملخص السوق، أخبار وتحليلات ATOM، التنبيهات السعرية وخدمات VIP.",
    keywords: [
      "HasaN CharT World",
      "كوزموس",
      "ATOM",
      "Cosmos",
      "IBC",
      "سعر ATOM",
    ],
  },
  jsonLd: {
    productName: "Cosmos",
    alternateNames: ["ATOM", "كوزموس"],
    productCategory: "Cryptocurrency",
    itemListName: "مركز معلومات كوزموس في HasaN CharT World",
    fragmentId: "cosmos",
  },
  breadcrumbs: [
    { label: "الرئيسية", href: "/" },
    { label: "الأسواق المالية", href: "/markets" },
    { label: "العملات الرقمية", href: "/crypto" },
    { label: "كوزموس", href: "/atom" },
  ],
};
