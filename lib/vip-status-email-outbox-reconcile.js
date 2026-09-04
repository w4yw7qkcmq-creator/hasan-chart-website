import { syncVipStatusEventDeliverySummary } from "./vip-status-event-summary-sync.js";

const VIP_STATUS_EMAIL_MESSAGE_TYPE = "vip_signal_status";
const RECONCILABLE_STATUSES = ["pending", "processing", "failed"];

function outboxLinksDelivery(outbox, deliveryId, providerMessageId) {
  if (!outbox?.id) return false;
  const outboxId = String(outbox.id);
  if (providerMessageId && outboxId === String(providerMessageId)) return true;
  const metaDeliveryId =
    outbox.metadata?.vipDeliveryId || outbox.metadata?.vip_delivery_id || null;
  return metaDeliveryId && String(metaDeliveryId) === String(deliveryId);
}

/**
 * Reconcile VIP email delivery rows whose linked outbox is already sent.
 * Idempotent: only updates non-terminal delivery rows.
 */
export async function reconcileVipEmailDeliveriesFromSentOutbox(supabase, options = {}) {
  if (!supabase) return { reconciled: 0, skipped: 0, pairs: [] };

  const batchSize = Math.min(Math.max(Number(options.batchSize) || 100, 1), 500);
  const { data: deliveries, error: deliveryError } = await supabase
    .from("vip_signal_status_deliveries")
    .select("id, signal_id, event_type, status, provider_message_id")
    .eq("channel", "email")
    .in("status", RECONCILABLE_STATUSES)
    .order("updated_at", { ascending: true })
    .limit(batchSize);

  if (deliveryError) {
    throw new Error(deliveryError.message || "Failed to load VIP email deliveries");
  }

  const candidates = Array.isArray(deliveries) ? deliveries : [];
  if (!candidates.length) {
    return { reconciled: 0, skipped: 0, pairs: [] };
  }

  const outboxIds = [
    ...new Set(
      candidates
        .map((row) => String(row.provider_message_id || "").trim())
        .filter(Boolean)
    ),
  ];

  let outboxRows = [];
  if (outboxIds.length) {
    const { data, error } = await supabase
      .from("email_outbox")
      .select("id, status, sent_at, resend_id, metadata")
      .in("id", outboxIds)
      .eq("message_type", VIP_STATUS_EMAIL_MESSAGE_TYPE)
      .eq("status", "sent");
    if (error) {
      throw new Error(error.message || "Failed to load sent VIP outbox rows");
    }
    outboxRows = Array.isArray(data) ? data : [];
  }

  const { data: metaLinkedOutbox, error: metaError } = await supabase
    .from("email_outbox")
    .select("id, status, sent_at, resend_id, metadata")
    .eq("message_type", VIP_STATUS_EMAIL_MESSAGE_TYPE)
    .eq("status", "sent")
    .in(
      "metadata->>vipDeliveryId",
      candidates.map((row) => String(row.id))
    );

  if (metaError) {
    throw new Error(metaError.message || "Failed to load metadata-linked VIP outbox rows");
  }

  const sentOutboxById = new Map();
  for (const row of [...outboxRows, ...(Array.isArray(metaLinkedOutbox) ? metaLinkedOutbox : [])]) {
    sentOutboxById.set(String(row.id), row);
  }

  let reconciled = 0;
  let skipped = 0;
  const pairs = [];
  const syncPairs = new Set();

  for (const delivery of candidates) {
    let matchedOutbox = null;
    for (const outbox of sentOutboxById.values()) {
      if (outboxLinksDelivery(outbox, delivery.id, delivery.provider_message_id)) {
        matchedOutbox = outbox;
        break;
      }
    }

    if (!matchedOutbox) {
      skipped += 1;
      continue;
    }

    const { error: updateError } = await supabase
      .from("vip_signal_status_deliveries")
      .update({
        status: "delivered",
        delivered_at: matchedOutbox.sent_at || new Date().toISOString(),
        provider_message_id: matchedOutbox.resend_id || matchedOutbox.id,
        error_code: null,
        error_message_safe: null,
        failed_at: null,
        processing_started_at: null,
        processing_worker_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", delivery.id)
      .in("status", RECONCILABLE_STATUSES);

    if (updateError) {
      throw new Error(updateError.message || `Failed to reconcile delivery ${delivery.id}`);
    }

    reconciled += 1;
    pairs.push({
      deliveryId: delivery.id,
      oldStatus: delivery.status,
      newStatus: "delivered",
      outboxId: matchedOutbox.id,
      outboxStatus: matchedOutbox.status,
      outboxSentAt: matchedOutbox.sent_at || null,
    });
    syncPairs.add(`${delivery.signal_id}:${delivery.event_type}`);
  }

  for (const pair of syncPairs) {
    const [signalId, eventType] = pair.split(":");
    await syncVipStatusEventDeliverySummary(supabase, { signalId, eventType });
  }

  return { reconciled, skipped, pairs };
}
