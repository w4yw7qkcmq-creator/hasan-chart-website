/**
 * Sync vip_signal_status_deliveries when email_outbox rows for vip_signal_status complete.
 */

export const VIP_STATUS_EMAIL_MESSAGE_TYPE = "vip_signal_status";

function extractVipDeliveryLink(metadata = {}) {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const deliveryId = metadata.vipDeliveryId || metadata.vip_delivery_id || null;
  const idempotencyKey =
    metadata.vipDeliveryIdempotencyKey || metadata.vip_delivery_idempotency_key || null;

  if (!deliveryId && !idempotencyKey) {
    return null;
  }

  return { deliveryId, idempotencyKey };
}

export async function syncVipStatusDeliveryFromOutbox(
  supabase,
  row,
  { outcome, providerMessageId = null, errorCode = null } = {}
) {
  if (!supabase || !row) {
    return { synced: false, reason: "missing-input" };
  }

  if (String(row.message_type || "").trim() !== VIP_STATUS_EMAIL_MESSAGE_TYPE) {
    return { synced: false, reason: "not-vip-status-email" };
  }

  const link = extractVipDeliveryLink(row.metadata);
  if (!link) {
    return { synced: false, reason: "missing-vip-delivery-link" };
  }

  const patch = { updated_at: new Date().toISOString() };

  if (outcome === "sent") {
    Object.assign(patch, {
      status: "delivered",
      delivered_at: new Date().toISOString(),
      failed_at: null,
      error_code: null,
      error_message_safe: null,
      provider_message_id: providerMessageId || row.provider_message_id || null,
    });
  } else if (outcome === "skipped") {
    Object.assign(patch, {
      status: "unavailable",
      error_code: errorCode || "outbox-skipped",
      error_message_safe: String(errorCode || "outbox-skipped").slice(0, 200),
    });
  } else if (outcome === "failed") {
    Object.assign(patch, {
      status: "failed",
      failed_at: new Date().toISOString(),
      error_code: errorCode || "outbox-failed",
      error_message_safe: String(errorCode || "outbox-failed").slice(0, 200),
    });
  } else {
    return { synced: false, reason: "unknown-outcome" };
  }

  let query = supabase.from("vip_signal_status_deliveries").update(patch);

  if (link.deliveryId) {
    query = query.eq("id", link.deliveryId);
  } else {
    query = query.eq("idempotency_key", link.idempotencyKey);
  }

  const { error } = await query;

  if (error) {
    return { synced: false, reason: error.message || "update-failed" };
  }

  return { synced: true, outcome, deliveryId: link.deliveryId || null };
}
