export const MAX_VIP_STATUS_DELIVERY_ATTEMPTS = 3;

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeEmailHash(email) {
  return normalizeEmail(email).replace(/[^a-z0-9]/g, "").slice(0, 24);
}

export function buildStatusDeliveryIdempotencyKey(signalId, eventType, email, channel) {
  return `vip_status:${signalId}:${eventType}:${normalizeEmailHash(email)}:${channel}`;
}

export function buildStatusEventIdempotencyKey(signalId, eventType) {
  return `vip_status_event:${signalId}:${eventType}`;
}

export function buildVipStatusSiteNotificationKey(signalId, eventType, email) {
  return `vip_status:${signalId}:${eventType}:${normalizeEmailHash(email)}:site`;
}

export function buildVipStatusPushTag(signalId, eventType) {
  return `vip-${signalId}-${eventType}`;
}
