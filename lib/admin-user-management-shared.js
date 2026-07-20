const MISSING_RESOURCE_PATTERNS = [
  /relation .* does not exist/i,
  /could not find (the )?table/i,
  /table .* not found/i,
  /schema cache/i,
  /42P01/i,
  /PGRST205/i,
  /PGRST204/i,
];

export const ADMIN_SECTION_NOT_ENABLED_MESSAGE = "هذه الميزة غير مفعلة بعد.";
export const ADMIN_SECTION_PHASE_MESSAGE = "يحتاج هذا القسم إلى تفعيل المرحلة التالية.";
export const ADMIN_NOTES_TABLE_MISSING_MESSAGE =
  "جدول الملاحظات الإدارية غير موجود بعد. طبّق Migration admin_user_notes في Supabase SQL Editor.";
export const ADMIN_NOTES_TABLE_MISSING_DETAIL =
  "بعد تطبيق Migration، أعد تحميل هذا القسم. لن تُعرض رسائل Supabase الخام هنا.";
export const ADMIN_PAYMENTS_DISCLAIMER =
  "هذه البيانات مبنية على طلبات الاشتراك وإثباتات الدفع اليدوية، وليست سجل معاملات مصرفية.";

export const ACTIVITY_FILTER_TYPES = {
  admin: new Set(["admin_action", "account_management_request"]),
  subscription: new Set(["subscription_request"]),
  alert: new Set(["price_alert", "notification"]),
  email: new Set(["email_sent"]),
  analysis: new Set(["analysis_request"]),
  sign_in: new Set(["sign_in", "account_created"]),
};

export function filterActivityEventsByType(events, filterId) {
  if (!filterId || filterId === "all") return events || [];
  const allowed = ACTIVITY_FILTER_TYPES[filterId];
  if (!allowed) return events || [];
  return (events || []).filter((event) => allowed.has(event.type));
}
export const ADMIN_SECTION_EMPTY_MESSAGE = "لا توجد بيانات حالياً.";
export const ADMIN_SECTION_LOAD_ERROR_MESSAGE = "تعذر تحميل هذا القسم.";

export function isMissingDatabaseResourceError(error) {
  const message = String(error?.message || error?.error || error || "");
  const code = String(error?.code || "");
  if (code === "42P01" || code === "PGRST205" || code === "PGRST204") {
    return true;
  }
  return MISSING_RESOURCE_PATTERNS.some((pattern) => pattern.test(message));
}

export function isTechnicalAdminError(message) {
  const text = String(message || "");
  if (!text) return false;
  return (
    isMissingDatabaseResourceError({ message: text }) ||
    /supabase|postgres|\bsql\b|schema cache|PGRST\d+|42P01/i.test(text)
  );
}

export function sanitizeAdminUserFacingError(error, { fallback = ADMIN_SECTION_LOAD_ERROR_MESSAGE } = {}) {
  if (isMissingDatabaseResourceError(error)) {
    return {
      kind: "not_enabled",
      message: ADMIN_SECTION_NOT_ENABLED_MESSAGE,
      detail: ADMIN_SECTION_PHASE_MESSAGE,
    };
  }

  const raw = String(error?.message || error?.error || error || "").trim();
  if (!raw || isTechnicalAdminError(raw)) {
    return {
      kind: "generic",
      message: fallback,
      detail: null,
    };
  }

  return {
    kind: "generic",
    message: raw,
    detail: null,
  };
}

export function defaultAdminSectionPagination(page = 1, pageSize = 20) {
  return { page, pageSize, total: 0, totalPages: 1 };
}

export function buildUnavailableSectionPayload(section, page = 1, pageSize = 20) {
  const pagination = defaultAdminSectionPagination(page, pageSize);
  const base = {
    success: true,
    section,
    available: false,
    message: ADMIN_SECTION_NOT_ENABLED_MESSAGE,
    detail: ADMIN_SECTION_PHASE_MESSAGE,
    pagination,
  };

  switch (section) {
    case "notes":
      return {
        ...base,
        notes: [],
        message: ADMIN_NOTES_TABLE_MISSING_MESSAGE,
        detail: ADMIN_NOTES_TABLE_MISSING_DETAIL,
      };
    case "audit":
      return { ...base, logs: [] };
    case "notifications":
      return { ...base, notifications: [] };
    case "emails":
      return { ...base, emails: [] };
    case "activity":
      return { ...base, events: [] };
    case "subscriptions":
      return { ...base, subscriptions: [] };
    case "payments":
      return { ...base, payments: [] };
    case "services":
      return { ...base, services: [] };
    default:
      return base;
  }
}

export const ACCOUNT_STATUS_LABELS = {
  active: "نشط",
  suspended: "معلق",
  banned: "محظور",
  deleted: "محذوف",
};

export const ACCOUNT_STATUS_ICONS = {
  active: "🟢",
  suspended: "🟡",
  banned: "🔴",
  deleted: "⚫",
};

export function getAccountStatusLabel(status) {
  return ACCOUNT_STATUS_LABELS[status] || ACCOUNT_STATUS_LABELS.active;
}

export function getAccountStatusIcon(status) {
  return ACCOUNT_STATUS_ICONS[status] || ACCOUNT_STATUS_ICONS.active;
}

/** @deprecated use resolveAccountStatusFromProfile */
export function resolveAccountStatus(authUser) {
  if (!authUser) return "active";
  const metadata = authUser.user_metadata || {};
  if (metadata.deleted_at || metadata.soft_deleted || metadata.account_status === "deleted") return "deleted";
  const bannedUntil = authUser.banned_until ? new Date(authUser.banned_until).getTime() : 0;
  if (bannedUntil > Date.now()) return "banned";
  if (metadata.account_suspended || metadata.account_disabled) return "suspended";
  return "active";
}
