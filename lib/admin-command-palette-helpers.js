export const ADMIN_COMMAND_USER_SEARCH_DEBOUNCE_MS = 300;
export const ADMIN_COMMAND_USER_SEARCH_MIN_CHARS = 2;
export const ADMIN_COMMAND_USER_RESULT_LIMIT = 5;

export const ADMIN_COMMAND_GROUPS = {
  navigation: "التنقل",
  users: "المستخدمون",
  actions: "الإجراءات السريعة",
};

export const ADMIN_COMMAND_NAV_ITEMS = [
  { id: "nav-overview", group: "navigation", label: "الرئيسية", tab: "overview", icon: "📊", keywords: ["overview", "home", "رئيسية", "dashboard"] },
  {
    id: "nav-user-management",
    group: "navigation",
    label: "إدارة المستخدمين",
    tab: "user-management",
    icon: "👥",
    keywords: ["users", "crm", "مستخدمين"],
  },
  {
    id: "nav-analysis",
    group: "navigation",
    label: "طلبات التحليل",
    tab: "analysis",
    icon: "🧠",
    keywords: ["analysis", "تحليل"],
  },
  {
    id: "nav-accounts",
    group: "navigation",
    label: "إدارة الحسابات",
    tab: "accounts",
    icon: "📂",
    keywords: ["accounts", "account management", "حسابات"],
  },
  {
    id: "nav-subscriptions",
    group: "navigation",
    label: "الاشتراكات",
    tab: "subscriptions",
    icon: "💳",
    keywords: ["subscriptions", "اشتراك"],
  },
  {
    id: "nav-alerts",
    group: "navigation",
    label: "تنبيهات الأسعار",
    href: "/alerts",
    icon: "🔔",
    keywords: ["alerts", "price alerts", "تنبيه"],
  },
  {
    id: "nav-vip",
    group: "navigation",
    label: "توصيات VIP",
    tab: "vip",
    icon: "⭐",
    keywords: ["vip", "signals", "توصية"],
  },
  {
    id: "nav-news",
    group: "navigation",
    label: "الأخبار",
    href: "/news",
    icon: "📰",
    keywords: ["news", "أخبار"],
  },
  {
    id: "nav-notifications",
    group: "navigation",
    label: "الإشعارات",
    href: "/notifications",
    icon: "📣",
    keywords: ["notifications", "إشعار"],
  },
  {
    id: "nav-email",
    group: "navigation",
    label: "البريد",
    href: "/admin/email-analytics",
    icon: "✉️",
    keywords: ["email", "بريد", "resend"],
  },
  {
    id: "nav-partners",
    group: "navigation",
    label: "الشركاء والسحوبات",
    href: "/admin/partners",
    icon: "🤝",
    keywords: ["partners", "withdrawals", "شركاء", "سحب"],
  },
  {
    id: "nav-financial-center",
    group: "navigation",
    label: "المركز المالي",
    tab: "financial-center",
    icon: "💰",
    keywords: ["finance", "revenue", "payments", "مالي", "إيراد"],
  },
];

export const ADMIN_COMMAND_ACTION_ITEMS = [
  {
    id: "action-refresh",
    group: "actions",
    label: "تحديث بيانات لوحة الإدارة",
    action: "refresh-dashboard",
    icon: "⟳",
    keywords: ["refresh", "تحديث"],
  },
  {
    id: "action-vip",
    group: "actions",
    label: "فتح إنشاء توصية VIP",
    tab: "vip",
    icon: "⭐",
    keywords: ["vip", "publish", "توصية"],
  },
  {
    id: "action-analysis",
    group: "actions",
    label: "فتح نموذج طلبات التحليل",
    tab: "analysis",
    icon: "🧠",
    keywords: ["analysis", "تحليل"],
  },
  {
    id: "action-user-management",
    group: "actions",
    label: "فتح إدارة المستخدمين",
    tab: "user-management",
    icon: "👥",
    keywords: ["users", "crm"],
  },
];

function normalizeCommandText(value) {
  return String(value || "").trim().toLowerCase();
}

export function scoreCommandMatch(item, query) {
  const normalizedQuery = normalizeCommandText(query);
  if (!normalizedQuery) return 1;

  const haystack = [item.label, ...(item.keywords || [])]
    .map(normalizeCommandText)
    .filter(Boolean);

  if (haystack.some((entry) => entry.includes(normalizedQuery))) {
    return 2;
  }

  if (haystack.some((entry) => normalizedQuery.split(/\s+/).every((part) => entry.includes(part)))) {
    return 1;
  }

  return 0;
}

export function filterStaticCommandItems(query) {
  const items = [...ADMIN_COMMAND_NAV_ITEMS, ...ADMIN_COMMAND_ACTION_ITEMS];
  const normalizedQuery = normalizeCommandText(query);

  if (!normalizedQuery) {
    return items;
  }

  return items
    .map((item) => ({ item, score: scoreCommandMatch(item, normalizedQuery) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.item.label.localeCompare(right.item.label, "ar"))
    .map((entry) => entry.item);
}

export function buildUserCommandItems(users) {
  return (users || []).slice(0, ADMIN_COMMAND_USER_RESULT_LIMIT).map((user) => ({
    id: `user:${user.id}`,
    group: "users",
    label: user.username || user.email || "مستخدم",
    subtitle: user.email || user.telegram || user.uid || "",
    icon: "👤",
    userId: user.id,
    accountStatus: user.accountStatusLabel || user.accountStatus || "",
  }));
}

export function groupCommandResults(items) {
  const order = ["navigation", "users", "actions"];
  const grouped = new Map();

  for (const item of items) {
    const key = item.group || "navigation";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  }

  return order
    .filter((key) => grouped.has(key))
    .map((key) => ({
      id: key,
      label: ADMIN_COMMAND_GROUPS[key] || key,
      items: grouped.get(key),
    }));
}

export function shouldIgnoreCommandPaletteShortcut(target) {
  if (!target) return false;
  const element = target;
  const tagName = String(element.tagName || "").toLowerCase();
  if (tagName === "input" || tagName === "textarea" || tagName === "select") return true;
  if (element.isContentEditable) return true;
  return false;
}

export function formatRelativeTimeArabic(value) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "—";

  const diffMs = Date.now() - time;
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) return "منذ لحظات";
  if (diffMinutes < 60) return `منذ ${diffMinutes} دقيقة`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `منذ ${diffHours} ساعة`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `منذ ${diffDays} يوم`;

  return new Date(time).toLocaleString("ar");
}
