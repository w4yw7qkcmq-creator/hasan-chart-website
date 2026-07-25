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

export const LEGACY_ENGLISH_PENDING_WITHOUT_PROOF_REASON = "legacy_english_pending_without_proof";

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

export function normalizePendingSubscriptionCandidate(row = {}) {
  const status = String(row?.status ?? row?.rawStatus ?? "").trim();
  const adminDisabled = Boolean(row?.admin_disabled ?? row?.adminDisabled);
  const paymentProofPath = String(row?.payment_proof_path ?? row?.paymentProofPath ?? "").trim();
  const paymentProof = String(row?.payment_proof ?? row?.paymentProof ?? "").trim();
  const hasPaymentProof = Boolean(
    row?.has_payment_proof ?? row?.hasPaymentProof ?? (paymentProofPath || paymentProof)
  );

  return {
    status,
    rawStatus: status,
    adminDisabled,
    admin_disabled: adminDisabled,
    hasPaymentProof,
    has_payment_proof: hasPaymentProof,
    payment_proof_path: paymentProofPath,
    payment_proof: paymentProof,
    paymentProofPath,
    paymentProof,
    isTerminal:
      TERMINAL_STATUS_SET.has(status) || TERMINAL_STATUS_SET.has(status.toLowerCase()),
  };
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
  if (Boolean(row?.has_payment_proof ?? row?.hasPaymentProof)) return true;
  if (hasStoredPaymentProof(row)) return true;
  if (legacyReadEnabled && hasLegacyPaymentProof(row)) return true;
  return false;
}

export function getPendingSubscriptionDiagnostic(row = {}, options = {}) {
  const candidate = normalizePendingSubscriptionCandidate(row);
  const normalizedStatus = candidate.status;
  const hasProof = rowHasSubscriptionRequestProof(candidate, options);
  const base = {
    normalizedStatus,
    hasProof,
    adminDisabled: candidate.adminDisabled,
  };

  if (!normalizedStatus) {
    return { ...base, isPending: false, reason: "empty_status" };
  }
  if (candidate.isTerminal) {
    return { ...base, isPending: false, reason: "terminal_status" };
  }
  if (isReviewedAdminStatus(normalizedStatus)) {
    return { ...base, isPending: false, reason: "reviewed_status" };
  }
  if (candidate.adminDisabled) {
    return { ...base, isPending: false, reason: "admin_disabled" };
  }
  if (!isPendingAdminStatus(normalizedStatus)) {
    return { ...base, isPending: false, reason: "unknown_status_without_mapping" };
  }
  if (
    LEGACY_ENGLISH_PENDING_STATUSES.has(normalizedStatus.toLowerCase()) &&
    !hasProof
  ) {
    return {
      ...base,
      isPending: false,
      reason: LEGACY_ENGLISH_PENDING_WITHOUT_PROOF_REASON,
    };
  }

  return { ...base, isPending: true, reason: "pending_subscription_request" };
}

export function isPendingSubscriptionRequestRow(row = {}, options = {}) {
  return getPendingSubscriptionDiagnostic(row, options).isPending;
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
  const diagnostic = getPendingSubscriptionDiagnostic(row, options);
  return {
    included: diagnostic.isPending,
    reason: diagnostic.reason,
  };
}

export function isLegacyEnglishPendingWithoutProof(row = {}, options = {}) {
  return (
    getPendingSubscriptionDiagnostic(row, options).reason ===
    LEGACY_ENGLISH_PENDING_WITHOUT_PROOF_REASON
  );
}
