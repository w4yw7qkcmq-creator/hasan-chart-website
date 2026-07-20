export const SUBSCRIPTION_STATUSES = {
  PENDING: "pending",
  ACTIVE: "active",
  EXPIRED: "expired",
  SUSPENDED: "suspended",
  CANCELLED: "cancelled",
  REJECTED: "rejected",
  ARCHIVED: "archived",
  UNKNOWN: "unknown",
};

export const FINANCIAL_SERVICES = {
  VIP_SPOT: "vip_spot",
  VIP_FUTURES: "vip_futures",
  VIP_SIGNALS: "vip_signals",
  ACADEMY: "academy",
  ACCOUNT_MANAGEMENT: "account_management",
  UNKNOWN: "unknown",
};

export const ACTIVATION_SOURCES = {
  PAYMENT: "payment",
  ADMIN: "admin",
  REFERRAL: "referral",
  COMPLIMENTARY: "complimentary",
  UNKNOWN: "unknown",
};

export const PAYMENT_REVIEW_STATUSES = {
  PENDING_REVIEW: "pending_review",
  CONFIRMED: "confirmed",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
  UNKNOWN: "unknown",
};

export const FINANCIAL_CENTER_SECTIONS = new Set([
  "overview",
  "subscriptions",
  "payment-reviews",
  "revenue",
]);

export const RAW_ACTIVE_STATUSES = new Set(["مفعل", "نشط", "active"]);
export const RAW_PENDING_STATUSES = new Set([
  "pending",
  "new",
  "reviewing",
  "قيد المراجعة",
  "بانتظار المراجعة",
  "جديد",
  "قيد المعالجة",
  "قيد التحليل",
  "بانتظار الدفع",
]);
export const RAW_REJECTED_STATUSES = new Set(["مرفوض", "rejected", "declined"]);
export const RAW_CANCELLED_STATUSES = new Set(["ملغى", "cancelled", "canceled"]);
export const RAW_SUSPENDED_STATUSES = new Set(["موقوف", "suspended"]);
export const RAW_EXPIRED_STATUSES = new Set(["منتهي", "expired", "ended"]);
export const RAW_ARCHIVED_STATUSES = new Set(["مؤرشف", "archived"]);
