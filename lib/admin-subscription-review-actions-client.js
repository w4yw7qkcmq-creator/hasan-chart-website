import { PAYMENT_REVIEW_STATUSES } from "./financial-center/financial-types.js";
import { canRejectSubscriptionRequest } from "./admin-subscription-request-reject-shared.js";
import { canActivateSubscriptionRequest } from "./admin-subscription-request-activate-shared.js";

export function mapPaymentReviewToSubscriptionRequest(item = {}) {
  return {
    id: item.requestId ?? item.id,
    userEmail: item.userEmail || "",
    username: item.username || "",
    planName: item.plan || item.planName || "",
    price: item.priceRaw || item.price || "",
    status: item.rawStatus || item.status || "",
    hasPaymentProof: Boolean(item.proofAvailable ?? item.hasPaymentProof),
  };
}

export function isPaymentReviewDecisionPending(status) {
  return String(status || "").trim().toLowerCase() === PAYMENT_REVIEW_STATUSES.PENDING_REVIEW;
}

export function canActivatePaymentReviewItem(item = {}) {
  if (!isPaymentReviewDecisionPending(item.status)) return false;
  return canActivateSubscriptionRequest(item.rawStatus || item.status);
}

export function canRejectPaymentReviewItem(item = {}) {
  if (!isPaymentReviewDecisionPending(item.status)) return false;
  return canRejectSubscriptionRequest(item.rawStatus || item.status);
}

export async function postSubscriptionActivateViaDashboard(
  adminFetch,
  request,
  { signal } = {}
) {
  const requestId = String(request?.id ?? request?.requestId ?? "").trim();
  const response = await adminFetch("/api/admin/dashboard", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "update-subscription-request",
      requestId,
      status: "مفعل",
      userEmail: request.userEmail,
      planName: request.planName || request.plan,
    }),
    signal,
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok || !result?.success) {
    const error = new Error(result?.error || "تعذر تفعيل طلب الاشتراك");
    error.status = response.status;
    error.code = result?.errorCode || null;
    throw error;
  }

  return result;
}

export async function postSubscriptionRejectViaApi(
  adminFetch,
  requestId,
  { rejectionReason = "", rejectionNotes = "", signal } = {}
) {
  const normalizedRequestId = String(requestId ?? "").trim();
  const response = await adminFetch(
    `/api/admin/subscription-requests/${encodeURIComponent(normalizedRequestId)}/reject`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        rejectionReason,
        rejectionNotes,
      }),
      signal,
    }
  );

  const result = await response.json().catch(() => ({}));

  if (!response.ok || !result?.success) {
    const error = new Error(result?.error || "تعذر رفض طلب الاشتراك");
    error.status = response.status;
    error.code = result?.errorCode || null;
    throw error;
  }

  return result;
}

export function buildSubscriptionOpenHref(requestId) {
  const normalizedRequestId = String(requestId ?? "").trim();
  if (!normalizedRequestId) return "/admin?tab=subscriptions";
  const params = new URLSearchParams({
    section: "subscriptions",
    tab: "subscriptions",
    requestId: normalizedRequestId,
  });
  return `/admin?${params.toString()}`;
}
