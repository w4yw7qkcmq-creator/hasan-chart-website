import { evaluateNotificationDelivery } from "./notification-delivery-gate.js";
import { getActiveNotificationSettings } from "./notification-settings-store.js";

export function getClientNotificationDelivery(notificationKey) {
  return evaluateNotificationDelivery(getActiveNotificationSettings(), notificationKey);
}
