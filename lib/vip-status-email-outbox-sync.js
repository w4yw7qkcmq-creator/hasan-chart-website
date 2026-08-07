import { syncVipStatusEventDeliverySummary } from "./vip-status-event-summary-sync.js";

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

  let deliveryRow = null;
  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  let signalId = meta.signalId || meta.signal_id || null;
  let eventType = meta.eventType || meta.event_type || null;

  if (!signalId || !eventType) {
    if (link.deliveryId) {
      const { data } = await supabase
        .from("vip_signal_status_deliveries")
        .select("id, signal_id, event_type")
        .eq("id", link.deliveryId)
        .maybeSingle();
      deliveryRow = data;
    } else {
      const { data } = await supabase
        .from("vip_signal_status_deliveries")
        .select("id, signal_id, event_type")
        .eq("idempotency_key", link.idempotencyKey)
        .maybeSingle();
      deliveryRow = data;
    }
    signalId = deliveryRow?.signal_id || signalId;
    eventType = deliveryRow?.event_type || eventType;
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

  if (signalId && eventType) {
    await syncVipStatusEventDeliverySummary(supabase, {
      signalId,
      eventType,
    });
  }

  return { synced: true, outcome, deliveryId: link.deliveryId || deliveryRow?.id || null };
}
