/** Arabic-friendly labels for IAM admin UI — IDs unchanged in backend. */

export const IAM_ROLE_LABELS = Object.freeze({
  super_admin: "المدير العام",
  admin: "مدير",
  support: "الدعم الفني",
  accountant: "المحاسب",
  analyst: "المحلل",
  news_editor: "محرر الأخبار",
  subscription_manager: "مدير الاشتراكات",
});

export const IAM_ROLE_DESCRIPTIONS = Object.freeze({
  super_admin: "صلاحيات كاملة على النظام بما في ذلك إدارة الصلاحيات والأدوار.",
  admin: "إدارة عامة للوحة الإدارة مع صلاحيات واسعة حسب التعيين.",
  support: "دعم المستخدمين والإشعارات والطلبات.",
  accountant: "الوصول للتقارير والعمليات المالية.",
  analyst: "إدارة ونشر التحليلات.",
  news_editor: "إنشاء وتحرير الأخبار.",
  subscription_manager: "إدارة الاشتراكات وطلبات الاشتراك.",
});

export const IAM_ROLE_RISK = Object.freeze({
  super_admin: "critical",
  admin: "high",
  support: "medium",
  accountant: "medium",
  analyst: "low",
  news_editor: "low",
  subscription_manager: "medium",
});

export const IAM_PERMISSION_GROUP_LABELS = Object.freeze({
  dashboard: "لوحة الإدارة",
  users: "المستخدمون",
  subscriptions: "الاشتراكات",
  finance: "المالية",
  news: "الأخبار",
  analysis: "التحليلات",
  partners: "الشركاء",
  support: "الدعم",
  iam: "إدارة الصلاحيات",
  system: "النظام",
  accounts: "الحسابات",
  email: "البريد",
});

export const IAM_PERMISSION_LABELS = Object.freeze({
  "iam.read": "عرض إعدادات الصلاحيات",
  "iam.manage": "إدارة نظام الصلاحيات",
  "iam.roles.manage": "إدارة الأدوار",
  "iam.assignments.grant": "إسناد الأدوار",
  "iam.assignments.revoke": "إلغاء التعيينات",
  "iam.audit.read": "عرض سجل التدقيق",
  "iam.sessions.read": "عرض الجلسات",
  "iam.sessions.force_logout": "إنهاء الجلسات",
  "iam.sessions.revoke": "إلغاء الجلسات",
  "iam.security.read": "عرض الأحداث الأمنية",
  "users.read": "عرض المستخدمين",
  "users.manage": "إدارة المستخدمين",
  "users.ban": "حظر المستخدمين",
  "users.notes.manage": "ملاحظات المستخدمين",
  "users.secrets.read": "عرض أسرار المستخدمين",
  "users.sessions.revoke": "إلغاء جلسات المستخدم",
  "subscriptions.read": "عرض الاشتراكات",
  "subscriptions.manage": "إدارة الاشتراكات",
  "finance.read": "عرض المالية",
  "finance.proofs.read": "عرض إثباتات الدفع",
  "finance.export": "تصدير البيانات المالية",
  "partners.read": "عرض الشركاء",
  "partners.analytics.read": "تحليلات الشركاء",
  "partners.settings.read": "عرض إعدادات الشركاء",
  "partners.settings.manage": "إدارة إعدادات الشركاء",
  "partners.withdrawals.read": "عرض سحوبات الشركاء",
  "partners.withdrawals.manage": "إدارة سحوبات الشركاء",
  "partners.finance.read": "مالية الشركاء",
  "partners.jobs.run": "تشغيل مهام الشركاء",
  "analysis.read": "عرض التحليلات",
  "analysis.manage": "إدارة التحليلات",
  "analysis.publish": "نشر التحليلات",
  "news.read": "عرض الأخبار",
  "news.manage": "إدارة الأخبار",
  "news.publish": "نشر الأخبار",
  "email.analytics.read": "تحليلات البريد",
  "dashboard.read": "عرض لوحة الإدارة",
  "dashboard.mutations": "تعديلات لوحة الإدارة",
  "accounts.read": "عرض طلبات الحساب",
  "accounts.secrets.manage": "إدارة أسرار الحساب",
  "system.notifications.test": "اختبار الإشعارات",
  "system.cron.read": "قراءة مهام النظام",
  "support.manage": "إدارة الدعم",
});

export const IAM_ASSIGNMENT_REASON_LABELS = Object.freeze({
  legacy_backfill: "ترحيل من النظام السابق",
  bootstrap_ceremony: "تهيئة المدير العام",
  manual: "تعيين يدوي",
  role_change: "تغيير الدور",
  temporary_access: "صلاحية مؤقتة",
  emergency: "وصول طارئ",
  revoked_from_iam_ui: "إلغاء من لوحة الإدارة",
});

export const IAM_STATUS_LABELS = Object.freeze({
  active: "نشط",
  revoked: "أُلغي التعيين",
  expired: "انتهت الصلاحية",
  scheduled: "مجدول",
  suspended: "موقوف",
  no_assignment: "بدون تعيين",
});

export const IAM_SEVERITY_LABELS = Object.freeze({
  low: "منخفض",
  medium: "متوسط",
  high: "مرتفع",
  critical: "حرج",
  warning: "تحذير",
  info: "معلومة",
});

export const IAM_EVENT_LABELS = Object.freeze({
  "iam.assignment_required": "محاولة دخول بدون تعيين",
  "iam.grant": "إسناد دور",
  "iam.revoke": "إلغاء تعيين",
  "iam.login": "تسجيل دخول إداري",
  "iam.logout": "تسجيل خروج",
  "iam.denied": "رفض صلاحية",
  "iam.bootstrap": "تهيئة النظام",
});

export const IAM_AUDIT_ACTION_LABELS = Object.freeze({
  grant: "إسناد",
  revoke: "إلغاء",
  login: "دخول",
  logout: "خروج",
  bootstrap: "تهيئة",
  denied: "رفض",
  force_logout: "إنهاء جلسة",
});

export const IAM_FLAG_LABELS = Object.freeze({
  IAM_DB: "قاعدة الصلاحيات",
  IAM_API: "حماية واجهات API",
  IAM_UI: "حماية لوحة الإدارة",
  IAM_RLS: "حماية قاعدة البيانات",
});

export const IAM_TAB_DEFS = Object.freeze([
  { id: "overview", label: "نظرة عامة", icon: "◉", permission: "iam.read" },
  { id: "users", label: "المستخدمون الإداريون", icon: "👤", permission: "iam.read" },
  { id: "roles", label: "الأدوار والصلاحيات", icon: "🛡", permission: "iam.read" },
  { id: "assignments", label: "التعيينات", icon: "📋", permission: "iam.read" },
  { id: "overrides", label: "الاستثناءات الفردية", icon: "⚡", permission: "iam.read" },
  { id: "sessions", label: "الجلسات النشطة", icon: "🖥", permission: "iam.sessions.read" },
  { id: "security", label: "الأحداث الأمنية", icon: "🔒", permission: "iam.security.read" },
  { id: "audit", label: "سجل التدقيق", icon: "📜", permission: "iam.audit.read" },
]);

export function labelRole(roleId) {
  if (!roleId) return "—";
  return IAM_ROLE_LABELS[roleId] || formatTechnicalId(roleId);
}

export function labelPermission(permissionId) {
  if (!permissionId) return "—";
  return IAM_PERMISSION_LABELS[permissionId] || formatTechnicalId(permissionId);
}

export function labelPermissionGroup(categoryOrPrefix) {
  const key = String(categoryOrPrefix || "").split(".")[0];
  return IAM_PERMISSION_GROUP_LABELS[key] || key || "أخرى";
}

export function labelAssignmentReason(reason) {
  if (!reason) return "إجراء إداري";
  const normalized = String(reason).trim();
  return IAM_ASSIGNMENT_REASON_LABELS[normalized] || "إجراء إداري";
}

export function labelSeverity(severity) {
  if (!severity) return "—";
  return IAM_SEVERITY_LABELS[String(severity).toLowerCase()] || severity;
}

export function labelEventType(eventType) {
  if (!eventType) return "—";
  return IAM_EVENT_LABELS[eventType] || formatTechnicalId(eventType);
}

export function labelAuditAction(action) {
  if (!action) return "—";
  return IAM_AUDIT_ACTION_LABELS[action] || formatTechnicalId(action);
}

export function labelAssignmentStatus(assignment) {
  if (!assignment) return IAM_STATUS_LABELS.no_assignment;
  if (assignment.revoked_at) return IAM_STATUS_LABELS.revoked;
  return IAM_STATUS_LABELS.active;
}

export function formatTechnicalId(id) {
  return String(id || "")
    .replace(/[._]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function groupPermissionsByCategory(permissions = []) {
  const groups = new Map();
  for (const perm of permissions) {
    const id = perm.id || perm.permissionId || perm.permission_id;
    const category = perm.category || String(id || "").split(".")[0] || "other";
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push({ ...perm, id });
  }
  return [...groups.entries()].map(([category, items]) => ({
    category,
    label: labelPermissionGroup(category),
    permissions: items,
  }));
}
