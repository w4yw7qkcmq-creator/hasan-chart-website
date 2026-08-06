import { isVipStatusDeliveryWorkerEnabled } from "./vip-status-delivery-worker-flag.js";
import {
  buildVipStatusWorkerId,
  getVipStatusDeliveryWorkerConfig,
} from "./vip-status-delivery-config.js";
import {
  buildVipStatusDeliveryContext,
  loadVipSignalForDelivery,
  processVipStatusDeliveryRow,
} from "./vip-status-delivery-processor.js";

export function logVipStatusDeliveryEvent(event, meta = {}) {
  const payload = {
    level: meta.level || "info",
    event,
    timestamp: new Date().toISOString(),
    workerId: meta.workerId || null,
    deliveryId: meta.deliveryId || null,
    channel: meta.channel || null,
    signalId: meta.signalId || null,
    outcome: meta.outcome || null,
    claimed: meta.claimed ?? null,
    processed: meta.processed ?? null,
    delivered: meta.delivered ?? null,
    failed: meta.failed ?? null,
    unavailable: meta.unavailable ?? null,
    queued: meta.queued ?? null,
    skipped: meta.skipped ?? null,
    staleReleased: meta.staleReleased ?? null,
    staleFailed: meta.staleFailed ?? null,
    durationMs: meta.durationMs ?? null,
    error: meta.error || null,
  };

  const line = JSON.stringify(payload);
  if (payload.level === "error") {
    console.error(line);
    return;
  }
  console.log(line);
}

export async function claimVipStatusDeliveryBatch(
  supabase,
  { workerId, batchSize, maxAttempts } = {}
) {
  const { data, error } = await supabase.rpc("claim_vip_status_deliveries", {
    p_worker_id: workerId || buildVipStatusWorkerId(),
    p_limit: batchSize,
    p_max_attempts: maxAttempts,
  });

  if (error) {
    throw new Error(error.message || "Failed to claim VIP status deliveries");
  }

  return Array.isArray(data) ? data : [];
}

export async function releaseStaleVipStatusDeliveries(supabase, options = {}) {
  const config = getVipStatusDeliveryWorkerConfig(options);
  const { data, error } = await supabase.rpc("release_stale_vip_status_deliveries", {
    p_stale_minutes: config.staleTimeoutMinutes,
    p_max_attempts: config.maxAttempts,
  });

  if (error) {
    throw new Error(error.message || "Failed to release stale VIP status deliveries");
  }

  return {
    releasedPending: Number(data?.releasedPending || 0),
    markedFailed: Number(data?.markedFailed || 0),
  };
}

export async function runVipStatusDeliveryBatch(supabase, options = {}) {
  if (!isVipStatusDeliveryWorkerEnabled()) {
    logVipStatusDeliveryEvent("VIP_STATUS_DELIVERY_WORKER_SKIPPED");
    return { skipped: true, processed: 0 };
  }

  const config = getVipStatusDeliveryWorkerConfig(options);
  const workerId = options.workerId || buildVipStatusWorkerId();
  const deps = options.deps || {};
  const startedAt = Date.now();
  const signalCache = new Map();

  const stale = await releaseStaleVipStatusDeliveries(supabase, config);
  if (stale.releasedPending > 0 || stale.markedFailed > 0) {
    logVipStatusDeliveryEvent("VIP_STATUS_DELIVERY_STALE_RECOVERED", {
      workerId,
      staleReleased: stale.releasedPending,
      staleFailed: stale.markedFailed,
    });
  }

  const rows = await claimVipStatusDeliveryBatch(supabase, {
    workerId,
    batchSize: config.batchSize,
    maxAttempts: config.maxAttempts,
  });

  const summary = {
    skipped: false,
    claimed: rows.length,
    processed: 0,
    delivered: 0,
    failed: 0,
    unavailable: 0,
    queued: 0,
    skippedRows: 0,
    siteDelivered: 0,
    pushDelivered: 0,
    emailQueued: 0,
    retries: 0,
    durationMs: 0,
  };

  logVipStatusDeliveryEvent("VIP_STATUS_DELIVERY_BATCH_CLAIMED", {
    workerId,
    claimed: rows.length,
  });

  for (const row of rows) {
    summary.processed += 1;
    try {
      let signal = signalCache.get(row.signal_id);
      if (!signal) {
        signal = await loadVipSignalForDelivery(supabase, row.signal_id);
        signalCache.set(row.signal_id, signal);
      }

      const ctx = buildVipStatusDeliveryContext(signal, row.event_type);
      const result = await processVipStatusDeliveryRow(supabase, row, ctx, deps);

      if (result.outcome === "delivered") {
        summary.delivered += 1;
        if (row.channel === "site") summary.siteDelivered += 1;
        if (row.channel === "push") summary.pushDelivered += 1;
      } else if (result.outcome === "queued") {
        summary.queued += 1;
        if (row.channel === "email") summary.emailQueued += 1;
      } else if (result.outcome === "unavailable") {
        summary.unavailable += 1;
      } else if (result.outcome === "skipped") {
        summary.skippedRows += 1;
      } else {
        summary.failed += 1;
        if (result.retryScheduled) summary.retries += 1;
      }

      logVipStatusDeliveryEvent("VIP_STATUS_DELIVERY_ROW_PROCESSED", {
        workerId,
        deliveryId: row.id,
        channel: row.channel,
        signalId: row.signal_id,
        outcome: result.outcome,
      });
    } catch (err) {
      summary.failed += 1;
      logVipStatusDeliveryEvent("VIP_STATUS_DELIVERY_ROW_FAILED", {
        level: "error",
        workerId,
        deliveryId: row.id,
        channel: row.channel,
        signalId: row.signal_id,
        error: String(err?.message || "row-processing-failed").slice(0, 200),
      });
    }
  }

  summary.durationMs = Date.now() - startedAt;
  logVipStatusDeliveryEvent("VIP_STATUS_DELIVERY_BATCH_FINISHED", {
    workerId,
    ...summary,
  });

  return summary;
}

export async function runVipStatusDeliveryCron(supabase, options = {}) {
  logVipStatusDeliveryEvent("VIP_STATUS_DELIVERY_CRON_STARTED", {
    workerId: options.workerId || buildVipStatusWorkerId(),
  });
  const summary = await runVipStatusDeliveryBatch(supabase, options);
  logVipStatusDeliveryEvent("VIP_STATUS_DELIVERY_CRON_FINISHED", summary);
  return summary;
}

export async function getVipStatusDeliveryQueueMetrics(supabase) {
  const statuses = ["pending", "processing", "delivered", "failed", "unavailable", "skipped"];
  const counts = {};

  await Promise.all(
    statuses.map(async (status) => {
      const { count, error } = await supabase
        .from("vip_signal_status_deliveries")
        .select("id", { count: "exact", head: true })
        .eq("status", status);

      counts[status] = error ? null : count || 0;
    })
  );

  return counts;
}
