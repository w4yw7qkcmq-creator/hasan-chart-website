export const ADMIN_SUBSCRIPTION_UPDATED_EVENT = "hc:admin-subscription-updated";

export function buildAdminSubscriptionUpdatedDetail({
  requestId = "",
  userId = "",
  userEmail = "",
  previousStatus = "",
  newStatus = "",
  source = "",
} = {}) {
  return {
    requestId: requestId != null ? String(requestId) : "",
    userId: userId != null ? String(userId) : "",
    userEmail: String(userEmail || "").trim().toLowerCase(),
    previousStatus: String(previousStatus || "").trim(),
    newStatus: String(newStatus || "").trim(),
    source: String(source || "").trim(),
  };
}

export function dispatchAdminSubscriptionUpdatedEvent(detail = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(ADMIN_SUBSCRIPTION_UPDATED_EVENT, {
      detail: buildAdminSubscriptionUpdatedDetail(detail),
    })
  );
}

export function subscribeAdminSubscriptionUpdated(listener) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(ADMIN_SUBSCRIPTION_UPDATED_EVENT, listener);
  return () => window.removeEventListener(ADMIN_SUBSCRIPTION_UPDATED_EVENT, listener);
}
