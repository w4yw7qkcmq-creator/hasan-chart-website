export const SUBSCRIPTIONS_HUB_LINKS = [
  { label: "VIP Spot", href: "/vip-spot" },
  { label: "VIP Futures", href: "/vip-futures" },
  { label: "إدارة الحسابات", href: "/account-management" },
  { label: "التحليلات اليومية", href: "/daily-analysis" },
  { label: "طلب تحليل", href: "/analysis/request" },
  { label: "الأصول", href: "/assets" },
  { label: "برنامج الشركاء", href: "/partner-center" },
];

export const SUBSCRIPTION_PLANS = [
  {
    category: "باقات السبوت",
    name: "سبوت - شهر",
    price: "$50",
    period: "/شهر",
    icon: "⚡",
    glow: "from-cyan-400/20 to-blue-500/10",
    badge: "Spot",
    features: [
      "توصيات سبوت لمدة شهر",
      "متابعة العملات الرئيسية",
      "نقاط دخول وخروج واضحة",
      "دعم عبر التليجرام",
    ],
  },
  {
    category: "باقات السبوت",
    name: "سبوت - 3 أشهر",
    price: "$125",
    period: "/ثلاثة أشهر",
    icon: "📈",
    glow: "from-blue-500/25 to-cyan-400/10",
    badge: "Spot Plus",
    featured: true,
    features: [
      "توصيات سبوت لمدة 3 أشهر",
      "متابعة مستمرة للصفقات",
      "تحديثات سوق يومية",
      "دعم مباشر مع الفريق",
    ],
  },
  {
    category: "باقات السبوت",
    name: "سبوت - سنة",
    price: "$500",
    period: "/سنة",
    icon: "💎",
    glow: "from-indigo-500/25 to-cyan-400/10",
    badge: "Spot VIP",
    features: [
      "توصيات سبوت لمدة سنة كاملة",
      "متابعة طويلة المدى",
      "تحديثات وتحليلات دورية",
      "أولوية في الدعم الفني",
    ],
  },
  {
    category: "باقات الفيوتشر",
    name: "فيوتشر - شهر",
    price: "$99",
    period: "/شهر",
    icon: "🚀",
    glow: "from-cyan-400/20 to-blue-500/10",
    badge: "Futures",
    features: [
      "توصيات فيوتشر لمدة شهر",
      "متابعة فرص قصيرة المدى",
      "إدارة مخاطر أساسية",
      "تنبيهات دخول وخروج",
    ],
  },
  {
    category: "باقات الفيوتشر",
    name: "فيوتشر - 3 أشهر",
    price: "$250",
    period: "/ثلاثة أشهر",
    icon: "🔥",
    glow: "from-blue-500/30 to-cyan-400/10",
    badge: "Futures Plus",
    featured: true,
    features: [
      "توصيات فيوتشر لمدة 3 أشهر",
      "متابعة مستمرة للصفقات",
      "إدارة مخاطر احترافية",
      "دعم مباشر مع الفريق",
    ],
  },
  {
    category: "باقات الفيوتشر",
    name: "فيوتشر - سنة",
    price: "$800",
    period: "/سنة",
    icon: "👑",
    glow: "from-indigo-500/30 to-cyan-400/10",
    badge: "Futures VIP",
    features: [
      "توصيات فيوتشر لمدة سنة كاملة",
      "متابعة احترافية للصفقات",
      "خطة إدارة مخاطر متقدمة",
      "أولوية كاملة بالدعم الفني",
    ],
  },
];

export function formatSubscriptionDate(value) {
  if (!value) return "غير محدد";

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "غير محدد";

  return date.toLocaleDateString("ar-SY-u-nu-latn", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function getRemainingDays(expiresAt) {
  if (!expiresAt) return null;

  const expiresTime = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresTime)) return null;

  const diff = expiresTime - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}
