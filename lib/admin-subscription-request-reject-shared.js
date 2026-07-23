import { isValidUuid } from "./partner-security.js";

export const SUBSCRIPTION_NON_REJECTABLE_STATUSES = new Set([
  "مرفوض",
  "مفعل",
  "نشط",
  "active",
]);

const NUMERIC_SUBSCRIPTION_REQUEST_ID = /^[0-9]+$/;

export function normalizeSubscriptionRequestId(value) {
  if (value == null) return null;

  const normalized = String(value).trim();
  if (!normalized) return null;

  if (NUMERIC_SUBSCRIPTION_REQUEST_ID.test(normalized)) {
    return normalized;
  }

  if (isValidUuid(normalized)) {
    return normalized;
  }

  return null;
}

export function requireValidSubscriptionRequestId(value, label = "requestId") {
  const normalized = normalizeSubscriptionRequestId(value);
  if (!normalized) {
    const error = new Error(`INVALID_${label.toUpperCase()}`);
    error.code = "INVALID_REQUEST_ID";
    throw error;
  }
  return normalized;
}

export function canRejectSubscriptionRequest(status) {
  const normalized = String(status || "").trim();
  if (!normalized) return true;
  return !SUBSCRIPTION_NON_REJECTABLE_STATUSES.has(normalized);
}

export function validateSubscriptionRejectPayload({
  rejectionReason = "",
  rejectionNotes = "",
} = {}) {
  const normalizedReason = String(rejectionReason || "").trim();
  const normalizedNotes = String(rejectionNotes || "").trim();

  if (!normalizedReason) {
    const error = new Error("سبب الرفض مطلوب");
    error.status = 400;
    throw error;
  }

  if (normalizedNotes.length > 500) {
    const error = new Error("الملاحظات يجب ألا تتجاوز 500 حرفاً");
    error.status = 400;
    throw error;
  }

  return {
    rejectionReason: normalizedReason,
    rejectionNotes: normalizedNotes,
  };
}

export function assertAdminSubscriptionRejectAuthorized(adminCheck) {
  if (adminCheck?.ok) {
    return adminCheck;
  }

  const error = new Error(adminCheck?.error || "غير مصرح لك بالدخول");
  error.status = adminCheck?.status || 401;
  throw error;
}
