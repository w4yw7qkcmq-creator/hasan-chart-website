import { dispatchAdminSiteNotification } from "./site-notification-dispatch.js";

export const VIP_STATUS_DELIVERY_WORKER_NAME = "vip_status_delivery";
export const VIP_PENDING_UNHEALTHY_SECONDS = 5 * 60;
export const VIP_HEARTBEAT_STALE_SECONDS = 10 * 60;

function buildNotificationKey(suffix) {
  return `vip_worker_health:${VIP_STATUS_DELIVERY_WORKER_NAME}:${suffix}`;
}

export function evaluateVipWorkerHealth({
  pendingCount = 0,
  processingCount = 0,
  oldestPendingAgeSeconds = 0,
  staleProcessingCount = 0,
  lastSuccessAt = null,
  now = Date.now(),
} = {}) {
  const reasons = [];
  const heartbeatAgeSeconds = lastSuccessAt
    ? Math.max(0, Math.floor((now - new Date(lastSuccessAt).getTime()) / 1000))
    : Number.POSITIVE_INFINITY;

  if (oldestPendingAgeSeconds > VIP_PENDING_UNHEALTHY_SECONDS) {
    reasons.push("oldest_pending_stale");
  }
  if (staleProcessingCount > 0) {
    reasons.push("stale_processing");
  }
  if (heartbeatAgeSeconds > VIP_HEARTBEAT_STALE_SECONDS) {
    reasons.push("heartbeat_stale");
  }

  return {
    healthy: reasons.length === 0,
    reasons,
    pendingCount,
    processingCount,
    oldestPendingAgeSeconds,
    staleProcessingCount,
    heartbeatAgeSeconds: Number.isFinite(heartbeatAgeSeconds) ? heartbeatAgeSeconds : null,
    evaluatedAt: new Date(now).toISOString(),
  };
}

export async function loadVipWorkerHeartbeat(supabase) {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("worker_service_heartbeats")
    .select("*")
    .eq("worker_name", VIP_STATUS_DELIVERY_WORKER_NAME)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to load VIP worker heartbeat");
  }

  return data || null;
}

export async function maybeSendVipWorkerHealthAlert(
  supabase,
  { previousRow, health, source = "worker" } = {},
  deps = {}
) {
  const dispatchAdmin =
    deps.dispatchAdminSiteNotification || dispatchAdminSiteNotification;
  const previousState = previousRow?.alert_state || "healthy";
  const nextState = health.healthy ? "healthy" : "unhealthy";
  const reasonKey = health.reasons.join(",") || "unknown";

  if (previousState === nextState) {
    return { alerted: false, alertState: nextState, reason: "no-transition" };
  }

  const isRecovery = nextState === "healthy";
  const title = isRecovery
    ? "VIP Status Delivery Worker — recovered"
    : "VIP Status Delivery Worker — unhealthy";
  const message = isRecovery
    ? `Worker health recovered (source: ${source}).`
    : `Worker unhealthy (${reasonKey}). pending=${health.pendingCount}, processing=${health.processingCount}, oldestPendingAgeSeconds=${health.oldestPendingAgeSeconds}, heartbeatAgeSeconds=${health.heartbeatAgeSeconds ?? "n/a"}.`;

  if (supabase) {
    await dispatchAdmin(supabase, {
      preset: "admin",
      title,
      message,
      notificationKey: buildNotificationKey(isRecovery ? "recovery" : "unhealthy"),
      url: "/admin",
      metadata: {
        workerName: VIP_STATUS_DELIVERY_WORKER_NAME,
        source,
        reasons: health.reasons,
        healthy: health.healthy,
      },
    });
  }

  return {
    alerted: true,
    alertState: nextState,
    reason: reasonKey,
    recovery: isRecovery,
  };
}

export async function persistVipWorkerHeartbeat(
  supabase,
  {
    metrics = {},
    cycleSucceeded = true,
    buildCommit = null,
    source = "worker",
  } = {},
  deps = {}
) {
  if (!supabase) {
    return { persisted: false, reason: "missing-supabase" };
  }

  const nowIso = new Date().toISOString();
  const oldestPendingAgeSeconds = Math.floor((metrics.oldestPendingAgeMs || 0) / 1000);
  const previousRow = await loadVipWorkerHeartbeat(supabase);

  const health = evaluateVipWorkerHealth({
    pendingCount: metrics.pending ?? 0,
    processingCount: metrics.processing ?? 0,
    oldestPendingAgeSeconds,
    staleProcessingCount: metrics.staleProcessingCount ?? 0,
    lastSuccessAt: cycleSucceeded ? nowIso : previousRow?.last_success_at || null,
  });

  const alertResult = await maybeSendVipWorkerHealthAlert(
    supabase,
    { previousRow, health, source },
    deps
  );

  const row = {
    worker_name: VIP_STATUS_DELIVERY_WORKER_NAME,
    last_cycle_at: nowIso,
    last_success_at: cycleSucceeded ? nowIso : previousRow?.last_success_at || null,
    healthy: health.healthy,
    pending_count: health.pendingCount,
    processing_count: health.processingCount,
    oldest_pending_age_seconds: health.oldestPendingAgeSeconds,
    stale_processing_count: health.staleProcessingCount,
    alert_state: alertResult.alertState,
    last_alert_at: alertResult.alerted ? nowIso : previousRow?.last_alert_at || null,
    last_alert_reason: alertResult.alerted
      ? alertResult.reason
      : previousRow?.last_alert_reason || null,
    build_commit: buildCommit,
    updated_at: nowIso,
  };

  const { error } = await supabase.from("worker_service_heartbeats").upsert(row, {
    onConflict: "worker_name",
  });

  if (error) {
    throw new Error(error.message || "Failed to persist VIP worker heartbeat");
  }

  return { persisted: true, health, alertResult, row };
}

export async function evaluatePersistedVipWorkerHealth(supabase, deps = {}) {
  const previousRow = await loadVipWorkerHeartbeat(supabase);
  if (!previousRow) {
    return {
      previousRow: null,
      health: evaluateVipWorkerHealth({
        pendingCount: 0,
        processingCount: 0,
        oldestPendingAgeSeconds: 0,
        staleProcessingCount: 0,
        lastSuccessAt: new Date().toISOString(),
      }),
      alertResult: { alerted: false, reason: "no-heartbeat-row" },
    };
  }

  const health = evaluateVipWorkerHealth({
    pendingCount: previousRow.pending_count ?? 0,
    processingCount: previousRow.processing_count ?? 0,
    oldestPendingAgeSeconds: previousRow.oldest_pending_age_seconds ?? 0,
    staleProcessingCount: previousRow.stale_processing_count ?? 0,
    lastSuccessAt: previousRow.last_success_at,
  });

  const alertResult = await maybeSendVipWorkerHealthAlert(
    supabase,
    { previousRow, health, source: deps.source || "cron" },
    deps
  );

  if (alertResult.alerted) {
    const nowIso = new Date().toISOString();
    await supabase
      .from("worker_service_heartbeats")
      .update({
        alert_state: alertResult.alertState,
        last_alert_at: nowIso,
        last_alert_reason: alertResult.reason,
        healthy: health.healthy,
        updated_at: nowIso,
      })
      .eq("worker_name", VIP_STATUS_DELIVERY_WORKER_NAME);
  }

  return { previousRow, health, alertResult };
}
