export const ADMIN_SUBSCRIPTION_REMOVED_EVENT = "hc:admin-subscription-removed";

export function buildSubscriptionRequestCreatedNotificationId(requestId) {
  return `subscription_request_created:${String(requestId || "").trim()}`;
}

export function buildSubscriptionEndedNotificationId(requestId) {
  return `subscription_ended:${String(requestId || "").trim()}`;
}

export function resolveAdminSubscriptionEndedNotifyDecision(
  requestId,
  { isAcknowledged = () => false, isRendered = () => false, sessionSentIds = null } = {}
) {
  const id = buildSubscriptionEndedNotificationId(requestId);
  const normalizedRequestId = String(requestId || "").trim();

  if (!normalizedRequestId) {
    return { shouldNotify: false, id, reason: "missing-request-id" };
  }

  if (sessionSentIds?.has?.(id)) {
    return { shouldNotify: false, id, reason: "session-sent" };
  }

  if (isAcknowledged(id)) {
    return { shouldNotify: false, id, reason: "acknowledged" };
  }

  if (isRendered(id)) {
    return { shouldNotify: false, id, reason: "rendered" };
  }

  return { shouldNotify: true, id, reason: "new" };
}

export function createAdminSubscriptionEndedNotifySession() {
  return new Set();
}

export function markAdminSubscriptionEndedNotificationSent(requestId, sessionSentIds = null) {
  const id = buildSubscriptionEndedNotificationId(requestId);
  sessionSentIds?.add?.(id);
  return id;
}

export function dispatchAdminSubscriptionRemovedEvent(detail = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(ADMIN_SUBSCRIPTION_REMOVED_EVENT, {
      detail: {
        requestId: detail.requestId != null ? String(detail.requestId) : "",
        userEmail: String(detail.userEmail || "").trim().toLowerCase(),
        userId: detail.userId != null ? String(detail.userId) : "",
        planName: detail.planName || "",
        status: detail.status || "منتهي",
      },
    })
  );
}

export async function postAdminSubscriptionRemove(
  adminFetch,
  requestId,
  { removalNotes = "", signal } = {}
) {
  const normalizedRequestId = String(requestId ?? "").trim();
  const response = await adminFetch(
    `/api/admin/subscription-requests/${encodeURIComponent(normalizedRequestId)}/remove`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        removalNotes: String(removalNotes || "").trim(),
      }),
      signal,
    }
  );

  const result = await response.json().catch(() => ({}));

  if (!response.ok || !result?.success) {
    const error = new Error(result?.error || "تعذر إزالة الاشتراك");
    error.code = result?.errorCode || null;
    error.status = response.status;
    throw error;
  }

  return result;
}

export function mapSubscriptionRowForRemoveModal(sub, user) {
  return {
    id: sub?.id,
    userEmail: user?.email || "",
    username: user?.username || user?.email || "",
    planName: sub?.planName || sub?.serviceName || "",
    price: sub?.price || "",
    status: sub?.rawStatus || sub?.status || "",
  };
}
