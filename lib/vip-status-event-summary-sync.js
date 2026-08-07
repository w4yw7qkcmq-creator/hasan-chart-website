const TERMINAL_DELIVERY_STATUSES = Object.freeze([
  "delivered",
  "failed",
  "unavailable",
  "skipped",
]);

/**
 * Idempotent recompute of stored event counters from delivery rows (RPC).
 */
export async function syncVipStatusEventDeliverySummary(
  supabase,
  { signalId, eventType } = {}
) {
  const sid = Number(signalId);
  const evt = String(eventType || "").trim();
  if (!supabase || !Number.isFinite(sid) || sid <= 0 || !evt) {
    return { synced: false, reason: "invalid-input" };
  }

  if (typeof supabase.rpc !== "function") {
    return { synced: false, reason: "rpc-unavailable" };
  }

  const { error } = await supabase.rpc("sync_vip_status_event_delivery_summary", {
    p_signal_id: sid,
    p_event_type: evt,
  });

  if (error) {
    return { synced: false, reason: error.message || "rpc-failed" };
  }

  return { synced: true, signalId: sid, eventType: evt };
}

function channelBucket() {
  return { delivered: 0, failed: 0, unavailable: 0, pending: 0, processing: 0, skipped: 0 };
}

function bumpChannel(bucket, status) {
  const normalized = String(status || "").trim();
  if (normalized === "delivered") bucket.delivered += 1;
  else if (normalized === "failed") bucket.failed += 1;
  else if (normalized === "unavailable") bucket.unavailable += 1;
  else if (normalized === "skipped") bucket.skipped += 1;
  else if (normalized === "processing") bucket.processing += 1;
  else bucket.pending += 1;
}

/**
 * Build unified delivery summary contract from delivery rows.
 * unavailable is explicit; partialFailure only when failed > 0.
 */
export function buildVipStatusEventDeliveryContract(deliveries = [], eligibleRecipientCount = 0) {
  const channels = {
    site: channelBucket(),
    push: channelBucket(),
    email: channelBucket(),
  };

  for (const row of deliveries || []) {
    const channel = String(row.channel || "").trim();
    if (!channels[channel]) continue;
    bumpChannel(channels[channel], row.status);
  }

  const requested = (deliveries || []).length;
  let pending = 0;
  let processing = 0;
  let delivered = 0;
  let failed = 0;
  let unavailable = 0;

  for (const bucket of Object.values(channels)) {
    pending += bucket.pending;
    processing += bucket.processing;
    delivered += bucket.delivered;
    failed += bucket.failed;
    unavailable += bucket.unavailable;
  }

  const terminalCount = (deliveries || []).filter((row) =>
    TERMINAL_DELIVERY_STATUSES.includes(String(row.status || "").trim())
  ).length;

  const completed = requested > 0 && terminalCount === requested;
  const partialFailure = failed > 0;

  return {
    requested,
    eligibleRecipients: Number(eligibleRecipientCount) || 0,
    pending,
    processing,
    delivered,
    failed,
    unavailable,
    channels,
    completed,
    partialFailure,
  };
}

export async function fetchDeliveriesForSignals(supabase, signalIds = []) {
  const ids = [...new Set(signalIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))];
  if (!ids.length) return {};

  const { data, error } = await supabase
    .from("vip_signal_status_deliveries")
    .select("id, signal_id, event_type, channel, status")
    .in("signal_id", ids);

  if (error) {
    throw new Error(error.message || "Failed to load VIP status deliveries");
  }

  const map = {};
  for (const row of data || []) {
    const key = `${row.signal_id}:${row.event_type}`;
    if (!map[key]) map[key] = [];
    map[key].push(row);
  }
  return map;
}
