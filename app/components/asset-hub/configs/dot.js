/** @type {import("./types").AssetHubConfig} */
export const dotAssetConfig = {
  id: "dot",
  slug: "dot",
  path: "/dot",
  name: "بولكادوت",
  nameEn: "Polkadot",
  symbol: "DOT",
  tradingViewSymbol: "BINANCE:DOTUSDT",
  chartSymbol: "DOTUSDT",
  chartExchange: "BINANCE",
  pricePairLabel: "DOT / USDT",
  category: "crypto",
  categoryLabel: "العملات الرقمية",
  categoryPath: "/crypto",
  hero: {
    badge: "Crypto Extended Hub — Polkadot",
    title: "بولكادوت (DOT)",
    description:
      "مركز معلومات متكامل لبولكادوت: السعر المباشر، الشارت، ملخص السوق، آخر الأخبار والتحليلات، والخدمات المرتبطة — ضمن HasaN CharT World.",
    accentRgb: "230,0,122",
  },
  description: {
    marketSummary:
      "بولكادوت بروتوكول متعدد السلاسل يربط البلوكتشينات المختلفة عبر Parachains، وتتأثر حركته بتطور النظام البيئي وإطلاق المشاريع الجديدة.",
    tradingHours: "24 / 7",
    platform: "Binance",
  },
  news: {
    keywords: ["polkadot", "dot", "بولكادوت", "parachain"],
    tagHref: "/news/tag/crypto",
    archiveLabel: "أرشيف أخبار الكريبتو",
  },
  analysis: {
    keywords: ["dot", "polkadot", "بولكادوت", "dotusdt"],
  },
  faq: [
    {
      q: "ما هو بولكادوت (DOT)؟",
      a: "بولكادوت شبكة متعددة السلاسل تتيح تفاعل البلوكتشينات المختلفة عبر نظام Parachains.",
    },
    {
      q: "كيف أتابع سعر بولكادوت؟",
      a: "عبر السعر المباشر وشارت TradingView في صفحة DOT.",
    },
    {
      q: "هل توفر المنصة تحليلات DOT؟",
      a: "نعم، عبر التحليلات اليومية وخدمات VIP وطلب تحليل مخصص.",
    },
    {
      q: "كيف أنشئ تنبيه سعري لبولكادوت؟",
      a: "انتقل إلى صفحة التنبيهات وأنشئ تنبيهاً لزوج DOT/USDT.",
    },
    {
      q: "أين أجد أخبار بولكادوت؟",
      a: "في قسم الأخبار المفلترة في صفحة DOT أو عبر أخبار الكريبتو.",
    },
  ],
  relatedAssets: [
    { symbol: "BTC", name: "البيتكوين", description: "المرجع الرئيسي لسوق الكريبتو.", href: "/btc" },
    { symbol: "ETH", name: "الإيثيريوم", description: "منصة العقود الذكية الرائدة.", href: "/eth" },
    { symbol: "AVAX", name: "أفالانش", description: "بلوكتشين متعدد السلاسل.", href: "/avax" },
    { symbol: "LINK", name: "تشين لينك", description: "شبكة أوراكل لامركزية.", href: "/link" },
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
      { name: "بولكادوت DOT", url: "/dot" },
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
      description: "توصيات لتداول بولكادوت والكريبتو في السوق الفوري.",
      href: "/vip-spot",
      cta: "استكشف VIP Spot",
    },
    {
      icon: "⚡",
      title: "VIP Futures",
      description: "إشارات عقود بولكادوت الآجلة.",
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
    title: "HasaN CharT World | بولكادوت DOT — مركز المعلومات",
    description:
      "مركز معلومات بولكادوت: السعر المباشر، شارت TradingView، ملخص السوق، أخبار وتحليلات DOT، التنبيهات السعرية وخدمات VIP.",
    keywords: ["HasaN CharT World", "بولكادوت", "DOT", "Polkadot", "سعر DOT", "تحليل Polkadot"],
  },
  jsonLd: {
    productName: "Polkadot",
    alternateNames: ["DOT", "بولكادوت"],
    productCategory: "Cryptocurrency",
    itemListName: "مركز معلومات بولكادوت في HasaN CharT World",
    fragmentId: "polkadot",
  },
  breadcrumbs: [
    { label: "الرئيسية", href: "/" },
    { label: "الأسواق المالية", href: "/markets" },
    { label: "العملات الرقمية", href: "/crypto" },
    { label: "بولكادوت", href: "/dot" },
  ],
};
