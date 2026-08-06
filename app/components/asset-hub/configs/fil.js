/** @type {import("./types").AssetHubConfig} */
export const filAssetConfig = {
  id: "fil",
  slug: "fil",
  path: "/fil",
  name: "فايلكوين",
  nameEn: "Filecoin",
  symbol: "FIL",
  tradingViewSymbol: "BINANCE:FILUSDT",
  chartSymbol: "FILUSDT",
  chartExchange: "BINANCE",
  pricePairLabel: "FIL / USDT",
  category: "crypto",
  categoryLabel: "العملات الرقمية",
  categoryPath: "/crypto",
  hero: {
    badge: "Crypto DeFi Hub — Filecoin",
    title: "فايلكوين (FIL)",
    description:
      "مركز معلومات متكامل لفايلكوين: السعر المباشر، الشارت، ملخص السوق، آخر الأخبار والتحليلات، والخدمات المرتبطة — ضمن HasaN CharT World.",
    accentRgb: "0,185,255",
  },
  description: {
    marketSummary:
      "فايلكوين شبكة تخزين لامركزية تتيح تأجير مساحة تخزين عبر البلوكتشين، وتتأثر حركة FIL بطلب التخزين ونشاط المعدّنين.",
    tradingHours: "24 / 7",
    platform: "Binance",
  },
  news: {
    keywords: ["filecoin", "fil", "فايلكوين", "storage", "web3"],
    tagHref: "/news/tag/crypto",
    archiveLabel: "أرشيف أخبار الكريبتو",
  },
  analysis: {
    keywords: ["fil", "filecoin", "فايلكوين", "filusdt"],
  },
  faq: [
    {
      q: "ما هو فايلكوين (FIL)؟",
      a: "فايلكوين شبكة تخزين لامركزية تربط بين مزودي التخزين والمستخدمين عبر البلوكتشين.",
    },
    {
      q: "كيف أتابع سعر فايلكوين؟",
      a: "عبر السعر المباشر وشارت TradingView في صفحة FIL.",
    },
    {
      q: "هل توفر المنصة تحليلات FIL؟",
      a: "نعم، عبر التحليلات اليومية وخدمات VIP وطلب تحليل مخصص.",
    },
    {
      q: "كيف أنشئ تنبيه سعري لفايلكوين؟",
      a: "انتقل إلى صفحة التنبيهات وأنشئ تنبيهاً لزوج FIL/USDT.",
    },
    {
      q: "أين أجد أخبار فايلكوين؟",
      a: "في قسم الأخبار المفلترة في صفحة FIL أو عبر أخبار الكريبتو.",
    },
  ],
  relatedAssets: [
    { symbol: "BTC", name: "البيتكوين", description: "المرجع الرئيسي لسوق الكريبتو.", href: "/btc" },
    { symbol: "ETH", name: "الإيثيريوم", description: "منصة Web3 الرائدة.", href: "/eth" },
    { symbol: "DOT", name: "بولكادوت", description: "شبكة متعددة السلاسل.", href: "/dot" },
    { symbol: "ATOM", name: "كوزموس", description: "شبكة Interchain.", href: "/atom" },
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
      { name: "فايلكوين FIL", url: "/fil" },
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
      description: "توصيات لتداول فايلكوين والكريبتو في السوق الفوري.",
      href: "/vip-spot",
      cta: "استكشف VIP Spot",
    },
    {
      icon: "⚡",
      title: "VIP Futures",
      description: "إشارات عقود فايلكوين الآجلة.",
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
    title: "HasaN CharT World | فايلكوين FIL — مركز المعلومات",
    description:
      "مركز معلومات فايلكوين: السعر المباشر، شارت TradingView، ملخص السوق، أخبار وتحليلات FIL، التنبيهات السعرية وخدمات VIP.",
    keywords: ["HasaN CharT World", "فايلكوين", "FIL", "Filecoin", "Web3", "سعر FIL"],
  },
  jsonLd: {
    productName: "Filecoin",
    alternateNames: ["FIL", "فايلكوين"],
    productCategory: "Cryptocurrency",
    itemListName: "مركز معلومات فايلكوين في HasaN CharT World",
    fragmentId: "filecoin",
  },
  breadcrumbs: [
    { label: "الرئيسية", href: "/" },
    { label: "الأسواق المالية", href: "/markets" },
    { label: "العملات الرقمية", href: "/crypto" },
    { label: "فايلكوين", href: "/fil" },
  ],
};
