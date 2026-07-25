import {
  isPendingAdminStatus,
  isReviewedAdminStatus,
  PENDING_ADMIN_DB_STATUSES,
} from "./admin-status-constants.js";

export const SUBSCRIPTION_TERMINAL_STATUS_VALUES = [
  "منتهي",
  "مرفوض",
  "ملغى",
  "ملغي",
  "expired",
  "ended",
  "cancelled",
  "canceled",
  "rejected",
  "موقوف",
  "مؤرشف",
];

const TERMINAL_STATUS_SET = new Set(
  SUBSCRIPTION_TERMINAL_STATUS_VALUES.flatMap((value) => [value, value.toLowerCase()])
);

// Legacy English seed statuses require proof to count as actionable pending.
const LEGACY_ENGLISH_PENDING_STATUSES = new Set(["pending", "new", "reviewing", "waiting"]);

function isPaymentProofLegacyReadEnabled() {
  const flag = String(process.env.PAYMENT_PROOF_LEGACY_READ_ENABLED || "true")
    .trim()
    .toLowerCase();
  return flag !== "false" && flag !== "0" && flag !== "off";
}

function hasStoredPaymentProof(row = {}) {
  return Boolean(String(row.payment_proof_path || "").trim());
}

function hasLegacyPaymentProof(row = {}) {
  return Boolean(String(row.payment_proof || "").trim());
}

export function rowHasSubscriptionRequestProof(
  row = {},
  { legacyReadEnabled = isPaymentProofLegacyReadEnabled() } = {}
) {
  if (hasStoredPaymentProof(row)) return true;
  if (legacyReadEnabled && hasLegacyPaymentProof(row)) return true;
  return false;
}

export function isPendingSubscriptionRequestRow(row = {}, options = {}) {
  const rawStatus = String(row?.status ?? "").trim();
  if (!rawStatus) return false;

  const lower = rawStatus.toLowerCase();
  if (TERMINAL_STATUS_SET.has(rawStatus) || TERMINAL_STATUS_SET.has(lower)) return false;
  if (isReviewedAdminStatus(rawStatus)) return false;
  if (Boolean(row?.admin_disabled)) return false;
  if (!isPendingAdminStatus(rawStatus)) return false;

  if (LEGACY_ENGLISH_PENDING_STATUSES.has(lower) && !rowHasSubscriptionRequestProof(row, options)) {
    return false;
  }

  return true;
}

export function filterPendingSubscriptionRequestRows(rows = [], options = {}) {
  return rows.filter((row) => isPendingSubscriptionRequestRow(row, options));
}

export function countPendingSubscriptionRequestRows(rows = [], options = {}) {
  return filterPendingSubscriptionRequestRows(rows, options).length;
}

export async function countPendingSubscriptionRequests(supabase, options = {}) {
  const { data, error } = await supabase
    .from("subscription_requests")
    .select("id,status,admin_disabled,payment_proof_path,payment_proof")
    .in("status", PENDING_ADMIN_DB_STATUSES);

  if (error) throw error;
  return countPendingSubscriptionRequestRows(data || [], options);
}

export function explainPendingSubscriptionRequestRow(row = {}, options = {}) {
  const rawStatus = String(row?.status ?? "").trim();
  const hasProof = rowHasSubscriptionRequestProof(row, options);

  if (!rawStatus) {
    return { included: false, reason: "empty_status" };
  }
  if (TERMINAL_STATUS_SET.has(rawStatus) || TERMINAL_STATUS_SET.has(rawStatus.toLowerCase())) {
    return { included: false, reason: "terminal_status" };
  }
  if (isReviewedAdminStatus(rawStatus)) {
    return { included: false, reason: "reviewed_status" };
  }
  if (Boolean(row?.admin_disabled)) {
    return { included: false, reason: "admin_disabled" };
  }
  if (!isPendingAdminStatus(rawStatus)) {
    return { included: false, reason: "unknown_status_without_mapping" };
  }
  if (
    LEGACY_ENGLISH_PENDING_STATUSES.has(rawStatus.toLowerCase()) &&
    !hasProof
  ) {
    return { included: false, reason: "legacy_english_pending_without_proof" };
  }

  return { included: true, reason: "pending_subscription_request" };
}
