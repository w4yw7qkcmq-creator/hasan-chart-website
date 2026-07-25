export const PENDING_ADMIN_STATUS_VALUES = new Set([
  "pending",
  "new",
  "reviewing",
  "waiting",
  "قيد المراجعة",
  "بانتظار المراجعة",
  "بانتظار المعالجة",
  "جديد",
  "قيد المعالجة",
  "قيد التحليل",
]);

export const REVIEWED_ADMIN_STATUS_VALUES = new Set([
  "reviewed",
  "approved",
  "completed",
  "تمت المراجعة",
  "تم الرد",
  "مكتمل",
  "مفعل",
  "تم التواصل",
  "قيد التفعيل",
  "نشط",
  "active",
  "مرفوض",
  "مؤرشف",
  "مغلق",
  "بانتظار الدفع",
  "منتهي",
  "موقوف",
  "ملغى",
  "ملغي",
  "cancelled",
  "canceled",
  "expired",
  "ended",
  "rejected",
]);

export const PENDING_ANALYSIS_DB_STATUSES = [...PENDING_ADMIN_STATUS_VALUES];
export const PENDING_ADMIN_DB_STATUSES = [...PENDING_ADMIN_STATUS_VALUES];
export const PENDING_PARTNER_WITHDRAWAL_DB_STATUSES = ["pending"];
export const REVIEWED_ADMIN_DB_STATUSES = [
  "reviewed",
  "approved",
  "completed",
  "تمت المراجعة",
  "تم الرد",
  "مكتمل",
  "مفعل",
  "تم التواصل",
  "قيد التفعيل",
  "نشط",
  "مرفوض",
  "مؤرشف",
  "مغلق",
];

const normalizeAdminStatusValue = (status) => String(status || "").trim().toLowerCase();

export function isPendingAdminStatus(status) {
  const raw = String(status || "").trim();
  const normalized = normalizeAdminStatusValue(status);

  if (!raw) return true;
  if (PENDING_ADMIN_STATUS_VALUES.has(raw) || PENDING_ADMIN_STATUS_VALUES.has(normalized)) {
    return true;
  }
  if (REVIEWED_ADMIN_STATUS_VALUES.has(raw) || REVIEWED_ADMIN_STATUS_VALUES.has(normalized)) {
    return false;
  }

  return false;
}

export function isPendingAnalysisStatus(status) {
  return isPendingAdminStatus(status);
}

export function isReviewedAdminStatus(status) {
  const raw = String(status || "").trim();
  const normalized = normalizeAdminStatusValue(status);
  return REVIEWED_ADMIN_STATUS_VALUES.has(raw) || REVIEWED_ADMIN_STATUS_VALUES.has(normalized);
}

export function countPendingAnalysisRequests(items = []) {
  return items.filter((item) => isPendingAnalysisStatus(item?.status)).length;
}

export const ADMIN_STATS_SOURCES = {
  pendingAnalysis: {
    table: "analysis_requests",
    statuses: PENDING_ANALYSIS_DB_STATUSES,
    responseField: "analysisPending",
    uiField: "pendingAnalysis",
  },
  analysisReviewed: {
    table: "analysis_requests",
    statuses: REVIEWED_ADMIN_DB_STATUSES,
    responseField: "analysisReviewed",
    uiField: "completedAnalysis",
  },
  withdrawalsPending: {
    table: "partner_withdrawals",
    statuses: PENDING_PARTNER_WITHDRAWAL_DB_STATUSES,
    responseField: "withdrawalsPending",
    uiField: "withdrawalsPending",
  },
};
