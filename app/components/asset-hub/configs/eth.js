/** @type {import("./types").AssetHubConfig} */
export const ethAssetConfig = {
  id: "eth",
  slug: "eth",
  path: "/eth",
  name: "الإيثيريوم",
  nameEn: "Ethereum",
  symbol: "ETH",
  tradingViewSymbol: "BINANCE:ETHUSDT",
  chartSymbol: "ETHUSDT",
  chartExchange: "BINANCE",
  pricePairLabel: "ETH / USDT",
  category: "crypto",
  categoryLabel: "العملات الرقمية",
  categoryPath: "/crypto",
  hero: {
    badge: "Asset Hub — Ethereum",
    title: "الإيثيريوم (ETH)",
    description:
      "مركز معلومات متكامل للإيثيريوم: السعر المباشر، الشارت، ملخص السوق، آخر الأخبار والتحليلات، والخدمات المرتبطة — ضمن HasaN CharT World.",
    accentRgb: "99,102,241",
  },
  description: {
    marketSummary:
      "الإيثيريوم منصة العقود الذكية وطبقة Web3، ويتحرك بقوة مع تطورات التمويل اللامركزي وترقيات الشبكة والتدفقات المؤسسية.",
    tradingHours: "24 / 7",
    platform: "Binance",
  },
  news: {
    keywords: ["ethereum", "eth", "إيثيريوم", "إيثريوم"],
    tagHref: "/news/tag/crypto",
    archiveLabel: "أرشيف أخبار الكريبتو",
  },
  analysis: {
    keywords: ["eth", "ethereum", "إيثيريوم", "إيثريوم", "ethusdt"],
  },
  faq: [
    {
      q: "ما هو الإيثيريوم (ETH)؟",
      a: "الإيثيريوم بلوكتشين يدعم العقود الذكية والتطبيقات اللامركزية، ويُعد ثاني أكبر أصل رقمي بعد البيتكوين.",
    },
    {
      q: "كيف أتابع سعر الإيثيريوم؟",
      a: "عبر السعر المباشر وشارت TradingView في صفحة ETH، أو من خلال التنبيهات السعرية.",
    },
    {
      q: "هل توفر المنصة تحليلات ETH؟",
      a: "نعم، عبر التحليلات اليومية وخدمات VIP وطلب تحليل مخصص.",
    },
    {
      q: "كيف أنشئ تنبيه سعري للإيثيريوم؟",
      a: "انتقل إلى صفحة التنبيهات وأنشئ تنبيهاً لزوج ETH/USDT.",
    },
    {
      q: "أين أجد أخبار الإيثيريوم؟",
      a: "في قسم الأخبار المفلترة في صفحة ETH أو عبر أخبار الكريبتو.",
    },
  ],
  relatedAssets: [
    { symbol: "BTC", name: "البيتكوين", description: "المرجع الأول لسوق الكريبتو.", href: "/btc" },
    { symbol: "SOL", name: "سولانا", description: "بلوكتشين عالي السرعة للتطبيقات اللامركزية.", href: "/crypto" },
    { symbol: "XAU", name: "الذهب", description: "ملاذ آمن مرتبط بمعنويات المخاطرة.", href: "/xauusd" },
    { symbol: "FX", name: "الفوركس", description: "أسواق العملات — ارتباط الدولار بالكريبتو.", href: "/forex" },
  ],
  links: {
    internal: [
      { label: "الأسواق المالية", href: "/markets" },
      { label: "العملات الرقمية", href: "/crypto" },
      { label: "تحليل الكريبتو", href: "/crypto-analysis" },
      { label: "أخبار الكريبتو", href: "/news/category/crypto" },
      { label: "التحليلات اليومية", href: "/daily-analysis" },
      { label: "طلب تحليل", href: "/analysis/request" },
      { label: "التنبيهات", href: "/alerts" },
      { label: "VIP Spot", href: "/vip-spot" },
      { label: "VIP Futures", href: "/vip-futures" },
    ],
    jsonLd: [
      { name: "الإيثيريوم ETH", url: "/eth" },
      { name: "العملات الرقمية", url: "/crypto" },
      { name: "البيتكوين", url: "/btc" },
      { name: "التحليلات اليومية", url: "/daily-analysis" },
      { name: "VIP Spot", url: "/vip-spot" },
      { name: "VIP Futures", url: "/vip-futures" },
    ],
    marketSummary: [
      { label: "سوق الكريبتو", href: "/crypto" },
      { label: "أخبار الكريبتو", href: "/news/category/crypto" },
      { label: "التحليل الفني", href: "/technical-analysis" },
    ],
  },
  services: [
    {
      icon: "💎",
      title: "VIP Spot",
      description: "توصيات لتداول الإيثيريوم والكريبتو في السوق الفوري.",
      href: "/vip-spot",
      cta: "استكشف VIP Spot",
    },
    {
      icon: "⚡",
      title: "VIP Futures",
      description: "إشارات عقود الإيثيريوم الآجلة مع إدارة مخاطر.",
      href: "/vip-futures",
      cta: "استكشف VIP Futures",
    },
    {
      icon: "🛡️",
      title: "إدارة الحسابات",
      description: "إدارة محافظ الكريبتو باحترافية.",
      href: "/account-management",
      cta: "إدارة الحسابات",
    },
  ],
  metadata: {
    title: "HasaN CharT World | الإيثيريوم ETH — مركز المعلومات",
    description:
      "مركز معلومات الإيثيريوم: السعر المباشر، شارت TradingView، ملخص السوق، أخبار وتحليلات ETH، التنبيهات السعرية وخدمات VIP.",
    keywords: ["HasaN CharT World", "الإيثيريوم", "ETH", "Ethereum", "سعر الإيثيريوم", "تحليل ETH"],
  },
  jsonLd: {
    productName: "Ethereum",
    alternateNames: ["ETH", "الإيثيريوم"],
    productCategory: "Cryptocurrency",
    itemListName: "مركز معلومات الإيثيريوم في HasaN CharT World",
    fragmentId: "ethereum",
  },
  breadcrumbs: [
    { label: "الرئيسية", href: "/" },
    { label: "الأسواق المالية", href: "/markets" },
    { label: "العملات الرقمية", href: "/crypto" },
    { label: "الإيثيريوم", href: "/eth" },
  ],
};
