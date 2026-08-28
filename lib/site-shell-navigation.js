export const siteShellMenuGroups = [
  {
    id: "markets",
    label: "الأسواق",
    icon: "📊",
    defaultOpen: true,
    items: [
      { href: "/", icon: "🏠", label: "الرئيسية" },
      { href: "/#market-windows", icon: "▣", label: "نوافذ السوق" },
      { href: "/#prices", icon: "📊", label: "الأسعار المباشرة" },
      { href: "/#chart", icon: "📈", label: "الشارت الحي" },
      { href: "/news", icon: "📰", label: "الأخبار" },
      { href: "/assets", icon: "🗂️", label: "الأصول والأسواق" },
      { href: "/order-book", icon: "📒", label: "دفتر الأوامر والسيولة" },
      { href: "/daily-analysis", icon: "📝", label: "التحليلات اليومية" },
      { href: "/academy", icon: "🎓", label: "HasaN CharT Academy" },
      { href: "/results", icon: "🏆", label: "HasaN CharT Result" },
    ],
  },
  {
    id: "services",
    label: "الخدمات",
    icon: "💼",
    defaultOpen: true,
    items: [
      { href: "/#analysis", icon: "🧠", label: "طلب تحليل عملة" },
      { href: "/#alerts", icon: "🔔", label: "تنبيه سعر" },
      { href: "/subscriptions", icon: "💎", label: "الاشتراكات" },
      { href: "/vip-spot", icon: "⭐", label: "توصيات VIP سبوت", auth: true, plan: "spot" },
      { href: "/vip-futures", icon: "🔥", label: "توصيات VIP فيوتشر", auth: true, plan: "futures" },
      { href: "/account-management", icon: "📂", label: "إدارة الحسابات" },
      { href: "/partner-center", icon: "🤝", label: "برنامج الشركاء" },
    ],
  },
  {
    id: "account",
    label: "الحساب",
    icon: "👤",
    defaultOpen: true,
    items: [
      { href: "/my-dashboard", icon: "👤", label: "لوحة المستخدم", auth: true },
      { href: "/my-analysis", icon: "📩", label: "طلباتي وردود الإدارة", auth: true },
      { href: "/notification-settings", icon: "🔔", label: "إعدادات الإشعارات", auth: true },
    ],
  },
  {
    id: "admin",
    label: "الإدارة",
    icon: "🛠",
    adminOnly: true,
    defaultOpen: false,
    items: [{ href: "/admin", icon: "🛠", label: "لوحة الإدارة", adminOnly: true }],
  },
];

export const publicStaticMenuGroups = siteShellMenuGroups.filter((group) => !group.adminOnly);

export const siteShellSocialLinks = [
  { label: "الدعم الفني", badge: "تليجرام", icon: "🛟", href: "https://t.me/HasaNCharTSupport" },
  { label: "القناة الرسمية", badge: "تليجرام", icon: "📢", href: "https://t.me/HsaNCharT" },
  { label: "د. حسن", badge: "تليجرام", icon: "👨‍🏫", href: "https://t.me/CEOHasaNCharT" },
  { label: "منصة إكس", badge: "إكس", icon: "𝕏", href: "https://x.com/HasanChart" },
];

export const HEAVY_PREFETCH_ROUTES = new Set([
  "/partner-center",
  "/subscriptions",
  "/my-dashboard",
  "/my-analysis",
  "/vip-spot",
  "/vip-futures",
  "/account-management",
  "/admin",
  "/daily-analysis",
  "/news",
  "/assets",
]);

export function shouldPrefetchSidebarHref(href) {
  const path = String(href || "").split("#")[0];
  return !HEAVY_PREFETCH_ROUTES.has(path);
}

export const PUBLIC_STATIC_BATCH_1_ROUTES = ["/about", "/brand", "/company", "/commodities", "/oil"];
