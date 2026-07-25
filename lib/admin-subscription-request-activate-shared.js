export {
  normalizeSubscriptionRequestId,
  requireValidSubscriptionRequestId,
} from "./id-validation.js";

export const SUBSCRIPTION_ALREADY_ACTIVE_STATUSES = new Set(["مفعل", "نشط", "active"]);

export const SUBSCRIPTION_NON_ACTIVATABLE_STATUSES = new Set([
  "مرفوض",
  "منتهي",
  "موقوف",
  "مؤرشف",
]);

export function canActivateSubscriptionRequest(status) {
  const normalized = String(status || "").trim();
  if (!normalized) return true;
  if (SUBSCRIPTION_ALREADY_ACTIVE_STATUSES.has(normalized)) return false;
  if (SUBSCRIPTION_NON_ACTIVATABLE_STATUSES.has(normalized)) return false;
  return true;
}

export function getSubscriptionDurationDays(planName) {
  const text = String(planName || "").toLowerCase();

  if (text.includes("year") || text.includes("سنة") || text.includes("سنو")) return 365;
  if (text.includes("6 month") || text.includes("6 months") || text.includes("6 أشهر") || text.includes("ستة")) {
    return 180;
  }
  if (text.includes("3 month") || text.includes("3 months") || text.includes("3 أشهر") || text.includes("ثلاث")) {
    return 90;
  }
  if (text.includes("week") || text.includes("أسبوع") || text.includes("اسبوع")) return 7;
  return 30;
}

export function addDays(baseDate, days) {
  const date = new Date(baseDate || Date.now());
  date.setDate(date.getDate() + Number(days || 0));
  return date.toISOString();
}

export function validateSubscriptionActivatePayload({
  userEmail = "",
  planName = "",
} = {}) {
  return {
    userEmail: String(userEmail || "").trim().toLowerCase(),
    planName: String(planName || "").trim(),
  };
}
