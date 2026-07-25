import { isPendingAdminStatus, PENDING_ADMIN_DB_STATUSES } from "../admin-status-constants.js";
import {
  hasLegacyPaymentProof,
  hasStoredPaymentProof,
  isPaymentProofLegacyReadEnabled,
} from "../payment-proof-storage.js";
import {
  RAW_ACTIVE_STATUSES,
  RAW_ARCHIVED_STATUSES,
  RAW_CANCELLED_STATUSES,
  RAW_EXPIRED_STATUSES,
  RAW_REJECTED_STATUSES,
} from "./financial-types.js";

export function rowHasPendingPaymentReviewProof(
  row = {},
  { legacyReadEnabled = isPaymentProofLegacyReadEnabled() } = {}
) {
  if (hasStoredPaymentProof(row)) return true;
  if (legacyReadEnabled && hasLegacyPaymentProof(row)) return true;
  return false;
}

export function buildPendingPaymentReviewProofOrFilter({
  legacyReadEnabled = isPaymentProofLegacyReadEnabled(),
} = {}) {
  if (legacyReadEnabled) {
    return "payment_proof_path.not.is.null,and(payment_proof.not.is.null,payment_proof.neq.)";
  }
  return "payment_proof_path.not.is.null";
}

function isExcludedPendingPaymentReviewStatus(row = {}) {
  const rawStatus = String(row?.status || "").trim();
  const lower = rawStatus.toLowerCase();

  if (RAW_REJECTED_STATUSES.has(rawStatus) || RAW_REJECTED_STATUSES.has(lower)) return true;
  if (RAW_ACTIVE_STATUSES.has(rawStatus) && row?.started_at) return true;
  if (RAW_EXPIRED_STATUSES.has(rawStatus) || RAW_ARCHIVED_STATUSES.has(rawStatus)) return true;
  if (RAW_CANCELLED_STATUSES.has(rawStatus) || RAW_CANCELLED_STATUSES.has(lower)) return true;

  return false;
}

export function isPendingPaymentReviewRow(row = {}, options = {}) {
  if (!rowHasPendingPaymentReviewProof(row, options)) return false;
  if (!isPendingAdminStatus(row?.status)) return false;
  if (isExcludedPendingPaymentReviewStatus(row)) return false;
  return true;
}

export function filterPendingPaymentReviewRows(rows = [], options = {}) {
  return rows.filter((row) => isPendingPaymentReviewRow(row, options));
}

export function countPendingPaymentReviewRows(rows = [], options = {}) {
  return filterPendingPaymentReviewRows(rows, options).length;
}

export async function countPendingPaymentReviews(supabase, options = {}) {
  const legacyReadEnabled = options.legacyReadEnabled ?? isPaymentProofLegacyReadEnabled();
  const { count, error } = await supabase
    .from("subscription_requests")
    .select("id", { count: "exact", head: true })
    .in("status", PENDING_ADMIN_DB_STATUSES)
    .or(buildPendingPaymentReviewProofOrFilter({ legacyReadEnabled }));

  if (error) throw error;
  return count || 0;
}
