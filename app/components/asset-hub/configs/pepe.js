/** @type {import("./types").AssetHubConfig} */
export const pepeAssetConfig = {
  id: "pepe",
  slug: "pepe",
  path: "/pepe",
  name: "بيبي",
  nameEn: "Pepe",
  symbol: "PEPE",
  tradingViewSymbol: "BINANCE:PEPEUSDT",
  chartSymbol: "PEPEUSDT",
  chartExchange: "BINANCE",
  pricePairLabel: "PEPE / USDT",
  category: "crypto",
  categoryLabel: "العملات الرقمية",
  categoryPath: "/crypto",
  hero: {
    badge: "Crypto Meme Hub — Pepe",
    title: "بيبي (PEPE)",
    description:
      "مركز معلومات متكامل لبيبي: السعر المباشر، الشارت، ملخص السوق، آخر الأخبار والتحليلات، والخدمات المرتبطة — ضمن HasaN CharT World.",
    accentRgb: "0,180,0",
  },
  description: {
    marketSummary:
      "بيبي عملة ميم على إيثيريوم اكتسبت شعبية واسعة، وتتأثر حركتها بزخم المجتمع ومعنويات سوق الميم كوينز.",
    tradingHours: "24 / 7",
    platform: "Binance",
  },
  news: {
    keywords: ["pepe", "بيبي", "meme", "ميم", "frog"],
    tagHref: "/news/tag/crypto",
    archiveLabel: "أرشيف أخبار الكريبتو",
  },
  analysis: { keywords: ["pepe", "بيبي", "pepeusdt"] },
  faq: [
    {
      q: "ما هو بيبي (PEPE)؟",
      a: "بيبي عملة ميم لامركزية على إيثيريوم مستوحاة من ميم الضفدع الشهير.",
    },
    {
      q: "كيف أتابع سعر بيبي؟",
      a: "عبر السعر المباشر وشارت TradingView في صفحة PEPE.",
    },
    {
      q: "هل توفر المنصة تحليلات PEPE؟",
      a: "نعم، عبر التحليلات اليومية وخدمات VIP وطلب تحليل مخصص.",
    },
    {
      q: "كيف أنشئ تنبيه سعري لبيبي؟",
      a: "انتقل إلى صفحة التنبيهات وأنشئ تنبيهاً لزوج PEPE/USDT.",
    },
    {
      q: "أين أجد أخبار بيبي؟",
      a: "في قسم الأخبار المفلترة في صفحة PEPE أو عبر أخبار الكريبتو.",
    },
  ],
  relatedAssets: [
    {
      symbol: "SHIB",
      name: "شيبا إينو",
      description: "عملة ميم شهيرة.",
      href: "/shib",
    },
    {
      symbol: "DOGE",
      name: "دوجكوين",
      description: "عملة الميم الأصلية.",
      href: "/doge",
    },
    {
      symbol: "BTC",
      name: "البيتكوين",
      description: "المرجع الرئيسي لسوق الكريبتو.",
      href: "/btc",
    },
    {
      symbol: "ETH",
      name: "الإيثيريوم",
      description: "الشبكة الأساسية لـ PEPE.",
      href: "/eth",
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
      { name: "بيبي PEPE", url: "/pepe" },
      { name: "العملات الرقمية", url: "/crypto" },
      { name: "شيبا إينو", url: "/shib" },
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
      description: "توصيات لتداول بيبي والكريبتو في السوق الفوري.",
      href: "/vip-spot",
      cta: "استكشف VIP Spot",
    },
    {
      icon: "⚡",
      title: "VIP Futures",
      description: "إشارات عقود بيبي الآجلة.",
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
    title: "HasaN CharT World | بيبي PEPE — مركز المعلومات",
    description:
      "مركز معلومات بيبي: السعر المباشر، شارت TradingView، ملخص السوق، أخبار وتحليلات PEPE، التنبيهات السعرية وخدمات VIP.",
    keywords: [
      "HasaN CharT World",
      "بيبي",
      "PEPE",
      "Pepe",
      "ميم كوين",
      "سعر PEPE",
    ],
  },
  jsonLd: {
    productName: "Pepe",
    alternateNames: ["PEPE", "بيبي"],
    productCategory: "Cryptocurrency",
    itemListName: "مركز معلومات بيبي في HasaN CharT World",
    fragmentId: "pepe",
  },
  breadcrumbs: [
    { label: "الرئيسية", href: "/" },
    { label: "الأسواق المالية", href: "/markets" },
    { label: "العملات الرقمية", href: "/crypto" },
    { label: "بيبي", href: "/pepe" },
  ],
};
