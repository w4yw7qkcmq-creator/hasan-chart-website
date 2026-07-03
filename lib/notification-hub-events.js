import { enrichHubNotification } from "./notification-hub-registry.js";

export const NOTIFICATION_HUB_EVENT = "notification-hub:event";

const hubListeners = new Set();

export function subscribeNotificationHub(listener) {
  hubListeners.add(listener);

  return () => {
    hubListeners.delete(listener);
  };
}

function dispatchNotificationHubEvent(detail) {
  if (typeof window === "undefined") return;

  hubListeners.forEach((listener) => {
    try {
      listener(detail);
    } catch (error) {
      console.warn("Notification Hub listener failed:", error?.message || error);
    }
  });

  window.dispatchEvent(
    new CustomEvent(NOTIFICATION_HUB_EVENT, {
      detail,
    })
  );
}

export function emitNotificationHubUpsert(rawNotification, { source = "notification-center" } = {}) {
  const notification = enrichHubNotification(rawNotification);
  if (!notification?.id) return null;

  dispatchNotificationHubEvent({
    type: "upsert",
    source,
    notification,
  });

  return notification;
}

export function emitNotificationHubPatch(id, patch = {}, { source = "notification-hub" } = {}) {
  if (!id) return;

  dispatchNotificationHubEvent({
    type: "patch",
    source,
    id: String(id),
    patch,
  });
}

export function emitNotificationHubRemove(id, { source = "notification-hub" } = {}) {
  if (!id) return;

  dispatchNotificationHubEvent({
    type: "remove",
    source,
    id: String(id),
  });
}

export function emitNotificationHubBulkRead({ source = "notification-hub" } = {}) {
  dispatchNotificationHubEvent({
    type: "bulk-read",
    source,
  });
}

export function emitNotificationHubClear({ source = "notification-hub" } = {}) {
  dispatchNotificationHubEvent({
    type: "clear",
    source,
  });
}
