import { syncVipStatusEventDeliverySummary } from "./vip-status-event-summary-sync.js";
import {
  buildStatusDeliveryIdempotencyKey,
  MAX_VIP_STATUS_DELIVERY_ATTEMPTS,
} from "./vip-status-delivery-keys.js";

const DELIVERY_CHANNELS = Object.freeze(["site", "push", "email"]);
const INSERT_BATCH_SIZE = 200;

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

/**
 * Bulk-create pending delivery jobs for async worker processing.
 * No provider calls — DB inserts only.
 */
export async function createVipStatusDeliveryJobs(
  supabase,
  { signalId, eventType, emails = [] }
) {
  const normalizedEmails = [...new Set(emails.map(normalizeEmail).filter(Boolean))];
  const rows = [];

  for (const email of normalizedEmails) {
    for (const channel of DELIVERY_CHANNELS) {
      rows.push({
        signal_id: signalId,
        event_type: eventType,
        user_email: email,
        channel,
        idempotency_key: buildStatusDeliveryIdempotencyKey(signalId, eventType, email, channel),
        status: "pending",
        attempt_count: 0,
      });
    }
  }

  if (!rows.length) {
    return {
      eligibleRecipients: 0,
      deliveryJobsRequested: 0,
      deliveryJobsCreated: 0,
    };
  }

  let created = 0;

  for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
    const chunk = rows.slice(i, i + INSERT_BATCH_SIZE);
    const { data, error } = await supabase
      .from("vip_signal_status_deliveries")
      .upsert(chunk, {
        onConflict: "idempotency_key",
        ignoreDuplicates: true,
      })
      .select("id");

    if (error) {
      if (error.code === "23505" || /duplicate/i.test(String(error.message || ""))) {
        continue;
      }
      throw new Error(error.message || "Failed to create VIP status delivery jobs");
    }

    created += Array.isArray(data) ? data.length : 0;
  }

  return {
    eligibleRecipients: normalizedEmails.length,
    deliveryJobsRequested: rows.length,
    deliveryJobsCreated: created,
  };
}

/**
 * Admin retry: re-queue failed deliveries without creating a new event.
 */
export async function requeueFailedVipStatusDeliveries(
  supabase,
  { signalId, eventType, maxAttempts = MAX_VIP_STATUS_DELIVERY_ATTEMPTS } = {}
) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("vip_signal_status_deliveries")
    .update({
      status: "pending",
      next_retry_at: now,
      processing_started_at: null,
      processing_worker_id: null,
      updated_at: now,
    })
    .eq("signal_id", signalId)
    .eq("event_type", eventType)
    .eq("status", "failed")
    .lt("attempt_count", maxAttempts)
    .select("id");

  if (error) {
    throw new Error(error.message || "Failed to requeue VIP status deliveries");
  }

  const ids = Array.isArray(data) ? data : [];

  if (ids.length) {
    await syncVipStatusEventDeliverySummary(supabase, { signalId, eventType });
  }

  return {
    requeued: ids.length,
    deliveryIds: ids.map((row) => row.id),
  };
}
