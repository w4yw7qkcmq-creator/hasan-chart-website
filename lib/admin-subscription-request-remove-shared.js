export {
  normalizeSubscriptionRequestId,
  requireValidSubscriptionRequestId,
} from "./id-validation.js";

export { assertAdminSubscriptionRejectAuthorized as assertAdminSubscriptionRemoveAuthorized } from "./admin-subscription-request-reject-shared.js";

export const SUBSCRIPTION_ACTIVE_STATUSES = new Set(["مفعل", "نشط", "active"]);

export const SUBSCRIPTION_NON_REMOVABLE_STATUSES = new Set([
  "مرفوض",
  "منتهي",
  "موقوف",
  "ملغى",
  "ملغي",
  "مؤرشف",
  "cancelled",
  "canceled",
]);

export function canRemoveSubscriptionRequest(status, adminDisabled = false) {
  const normalized = String(status || "").trim();
  if (!normalized) return false;
  if (adminDisabled) return false;
  if (SUBSCRIPTION_NON_REMOVABLE_STATUSES.has(normalized)) return false;
  return SUBSCRIPTION_ACTIVE_STATUSES.has(normalized);
}

export function validateSubscriptionRemovePayload({ removalNotes = "" } = {}) {
  const normalizedNotes = String(removalNotes || "").trim();

  if (normalizedNotes.length > 500) {
    const error = new Error("الملاحظات يجب ألا تتجاوز 500 حرفاً");
    error.status = 400;
    throw error;
  }

  return {
    removalNotes: normalizedNotes,
  };
}

export function isAdminSubscriptionActiveDisplay(sub) {
  return sub?.status === "نشط";
}

export function resolveAdminSubscriptionBadgeClass(sub) {
  if (isAdminSubscriptionActiveDisplay(sub)) return "is-active";
  const status = String(sub?.status || "");
  if (status.includes("منتهي")) return "is-expired";
  if (status === "موقوف" || status === "ملغى") return "is-inactive";
  return "is-inactive";
}
