import {
  PENDING_ADMIN_STATUS_VALUES,
  REVIEWED_ADMIN_STATUS_VALUES,
  isPendingAdminStatus,
  isReviewedAdminStatus,
} from "../../../lib/admin-status-constants.js";
import {
  isPendingSubscriptionRequestRow,
  SUBSCRIPTION_TERMINAL_STATUS_VALUES,
} from "../../../lib/admin-pending-subscription-request.js";

export { SUBSCRIPTION_TERMINAL_STATUS_VALUES };

export const ADMIN_STATUS_FILTERS = [
  ["pending", "بانتظار المراجعة"],
  ["reviewed", "تمت المراجعة"],
  ["all", "الكل"],
];

export const ADMIN_TABS = [
  { id: "overview", label: "نظرة عامة", icon: "📊" },
  { id: "analysis", label: "طلبات التحليل", icon: "🧠" },
  { id: "daily-publish", label: "نشر تحليل يومي", icon: "📝" },
  { id: "accounts", label: "إدارة الحسابات", icon: "📂" },
  { id: "subscriptions", label: "الاشتراكات", icon: "💳" },
  { id: "vip", label: "نشر VIP", icon: "⭐" },
];

export const SIMPLE_STATUS_OPTIONS = [
  { value: "pending", label: "بانتظار المراجعة" },
  { value: "reviewed", label: "تمت المراجعة" },
];

const PENDING_STATUS_VALUES = PENDING_ADMIN_STATUS_VALUES;
const REVIEWED_STATUS_VALUES = REVIEWED_ADMIN_STATUS_VALUES;

export function isNewPendingSubscriptionRequest(statusOrRow) {
  if (typeof statusOrRow === "object" && statusOrRow !== null) {
    return isPendingSubscriptionRequestRow(statusOrRow);
  }
  return isPendingSubscriptionRequestRow({ status: statusOrRow });
}

export function matchesSubscriptionStatusFilter(row, filterKey) {
  if (filterKey === "all") return true;
  if (filterKey === "pending") return isPendingSubscriptionRequestRow(row);
  return getAdminStatusKey(row?.status) === filterKey;
}

export function countSubscriptionStatusFilter(list, filterKey) {
  if (filterKey === "pending") {
    return list.filter((item) => isPendingSubscriptionRequestRow(item)).length;
  }
  return countAdminStatusFilter(list, filterKey);
}

export const ADMIN_ANALYSIS_LIMIT = 50;
export const ADMIN_USERS_LIMIT = 200;
export const ADMIN_SUBSCRIPTIONS_LIMIT = 50;

const normalizeAdminStatusValue = (status) => String(status || "").trim().toLowerCase();

export const getAdminStatusKey = (status) => {
  if (isReviewedAdminStatus(status)) {
    return "reviewed";
  }

  if (isPendingAdminStatus(status)) {
    return "pending";
  }

  return "pending";
};

export const getAdminStatusLabel = (status) => {
  if (status === "reviewed") return "تمت المراجعة";
  if (status === "pending") return "بانتظار المراجعة";
  return getAdminStatusKey(status) === "reviewed" ? "تمت المراجعة" : "بانتظار المراجعة";
};

export const matchesAdminStatusFilter = (status, filterKey) => {
  if (filterKey === "all") return true;
  return getAdminStatusKey(status) === filterKey;
};

export const countAdminStatusFilter = (list, filterKey, getStatus = (item) => item.status) =>
  list.filter((item) => matchesAdminStatusFilter(getStatus(item), filterKey)).length;

export const getSimpleStatusSelectValue = (status) => getAdminStatusKey(status);

const normalizeAdminSearch = (value) => String(value || "").trim().toLowerCase();

export const isValidPreviewUrl = (value) => {
  const src = String(value || "").trim();
  if (!src || src === "null" || src === "undefined" || src.startsWith("about:")) {
    return false;
  }
  return true;
};

import {
  getPaymentNetworkAddress,
  getPaymentNetworkLabel,
} from "../../../lib/payment-networks.js";

export const matchesAdminSearch = (item, searchValue, fields) => {
  const query = normalizeAdminSearch(searchValue);
  if (!query) return true;

  return fields.some((field) => normalizeAdminSearch(item?.[field]).includes(query));
};

export const formatAnalysisRequest = (item) => ({
  id: item.id,
  userEmail: item.user_email,
  username: item.username,
  coin: item.coin,
  frame: item.frame,
  status: item.status || "قيد المراجعة",
  reply: item.reply || "",
  replyImage: item.reply_image || "",
  createdAt: item.created_at ? new Date(item.created_at).toLocaleString("ar") : "",
});

export const formatSubscriptionRequest = (item) => ({
  id: item.id,
  userEmail: item.user_email,
  username: item.username,
  planName: item.plan_name,
  category: item.category,
  price: item.price,
  telegramUsername: item.telegram_username || "",
  paymentNetwork: item.payment_network || "",
  paymentNetworkLabel: getPaymentNetworkLabel(item.payment_network) || "",
  paymentNetworkAddress: getPaymentNetworkAddress(item.payment_network) || "",
  hasPaymentProof: Boolean(item.has_payment_proof),
  paymentProofPath: item.payment_proof_path || "",
  paymentProof: "",
  adminDisabled: Boolean(item.admin_disabled),
  status: item.status || "قيد المعالجة",
  createdAt: item.created_at ? new Date(item.created_at).toLocaleString("ar") : "",
  rejectionDetails: item.rejection_details
    ? {
        rejectionReason: item.rejection_details.rejectionReason || "",
        adminNotes: item.rejection_details.adminNotes || "",
        rejectedAt: item.rejection_details.rejectedAt
          ? new Date(item.rejection_details.rejectedAt).toLocaleString("ar")
          : "",
        rejectedByEmail: item.rejection_details.rejectedByEmail || "",
        notificationCreated: Boolean(item.rejection_details.notificationCreated),
        emailQueued: Boolean(item.rejection_details.emailQueued),
      }
    : null,
  timeline: Array.isArray(item.timeline) ? item.timeline : [],
  timelineSummary: item.timeline_summary
    ? {
        totalEvents: Number(item.timeline_summary.totalEvents) || 0,
        lastUpdateLabel: item.timeline_summary.lastUpdateLabel || "—",
        lastAdminEmail: item.timeline_summary.lastAdminEmail || "—",
        hasAdminHistory: Boolean(item.timeline_summary.hasAdminHistory),
      }
    : {
        totalEvents: 0,
        lastUpdateLabel: "—",
        lastAdminEmail: "—",
        hasAdminHistory: false,
      },
  timelineSparse: Boolean(item.timeline_sparse),
});

export const formatAccountManagementRequest = (item) => ({
  id: item.id,
  type: item.account_type || item.platform || "طلب إدارة حساب",
  platform: item.platform || "",
  email: item.email || "",
  telegram: item.contact_method || "",
  capital: item.capital || "",
  notes: item.notes || "",
  status: item.status || "جديد",
  createdAt: item.created_at ? new Date(item.created_at).toLocaleString("ar") : "",
  apiKey: item.has_sensitive_keys ? "محفوظ بشكل مشفر" : "",
  secretKey: item.has_sensitive_keys ? "محفوظ بشكل مشفر" : "",
  password: item.has_sensitive_keys ? "محفوظ بشكل مشفر" : "",
  hasSensitiveKeys: Boolean(item.has_sensitive_keys),
});
