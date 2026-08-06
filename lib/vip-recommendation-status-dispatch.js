import { recordAdminAction } from "./admin-audit-log.js";
import {
  VIP_NOTIFICATION_BATCH_SIZE,
  normalizeVipSignalType,
} from "./vip-subscriber-notify.js";
import { collectEligibleVipRecipientEmails } from "./vip-recommendation-eligibility.js";
import {
  normalizeTradeStatus,
  validateStatusTransition,
  VIP_STATUS_EVENT_TYPES,
} from "./vip-recommendation-status-copy.js";
import { createVipStatusDeliveryJobs, requeueFailedVipStatusDeliveries } from "./vip-status-delivery-jobs.js";
import {
  buildStatusDeliveryIdempotencyKey,
  buildStatusEventIdempotencyKey,
  buildVipStatusPushTag,
  buildVipStatusSiteNotificationKey,
  MAX_VIP_STATUS_DELIVERY_ATTEMPTS,
} from "./vip-status-delivery-keys.js";
import { buildVipStatusUpdateEmailContent } from "./vip-status-delivery-email-content.js";

export {
  buildStatusDeliveryIdempotencyKey,
  buildStatusEventIdempotencyKey,
  buildVipStatusPushTag,
  buildVipStatusSiteNotificationKey,
  buildVipStatusUpdateEmailContent,
  MAX_VIP_STATUS_DELIVERY_ATTEMPTS,
};
export const VIP_STATUS_PUSH_CONCURRENCY = 8;
export const VIP_ACTIVE_TRADE_STATUSES = Object.freeze(["active", "target_1_hit"]);
export const VIP_TERMINAL_TRADE_STATUSES = Object.freeze([
  "target_2_hit",
  "closed_immediately",
  "completed",
  "cancelled",
]);
export const VIP_ACTIVE_WINDOW_MS = 48 * 60 * 60 * 1000;
export const VIP_COMPLETED_HISTORY_LIMIT = 10;

const SIGNAL_SELECT =
  "id, signal_type, coin, entry, targets, stop_loss, notes, status, trade_status, created_at, publish_recipient_count, published_by_email, published_by, last_status_event, last_status_event_at, last_status_updated_by, closed_at, target_1_hit_at, target_2_hit_at";

function mapRpcError(error) {
  const message = String(error?.message || "");
  const code = String(error?.code || "");

  if (code === "P0002" || message.includes("signal_not_found")) {
    return { status: 404, error: "التوصية غير موجودة" };
  }
  if (
    code === "23505" ||
    message.includes("duplicate_target") ||
    message.includes("unique constraint")
  ) {
    return { status: 409, error: "تم تنفيذ هذا التحديث مسبقًا" };
  }
  if (message.includes("target_1_required") || message.includes("signal_closed")) {
    return { status: 409, error: message.includes("target_1") ? "يجب تحقيق الهدف الأول قبل الهدف الثاني" : "الصفقة مغلقة ولا يمكن تحديث حالتها" };
  }
  if (message.includes("invalid_event_type")) {
    return { status: 400, error: "eventType غير مدعوم" };
  }
  return { status: 500, error: "تعذر تحديث حالة الصفقة" };
}

async function atomicStatusTransition(supabase, { signalId, eventType, adminUser, requestId }) {
  const { data, error } = await supabase.rpc("update_vip_signal_status_event", {
    p_signal_id: signalId,
    p_event_type: eventType,
    p_admin_user_id: adminUser?.id || null,
    p_admin_email: adminUser?.email || null,
    p_request_id: requestId || null,
  });

  if (error) {
    return { ok: false, ...mapRpcError(error) };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.event_id && !row?.duplicate) {
    return { ok: false, status: 500, error: "تعذر تسجيل الحدث" };
  }

  if (row.duplicate) {
    return { ok: false, status: 409, error: "تم تنفيذ هذا التحديث مسبقًا", duplicate: true };
  }

  return {
    ok: true,
    eventId: row.event_id,
    previousStatus: row.previous_status,
    newStatus: row.new_status,
    coin: row.signal_coin,
    signalType: row.signal_type,
  };
}

export async function sendVipRecommendationStatusUpdate(
  supabase,
  { recommendationId, eventType, adminUser, requestId = null, deps = {} }
) {
  if (!VIP_STATUS_EVENT_TYPES.includes(eventType)) {
    return { ok: false, status: 400, error: "eventType غير مدعوم" };
  }

  const { data: signalPreview, error: previewError } = await supabase
    .from("vip_signals")
    .select(SIGNAL_SELECT)
    .eq("id", recommendationId)
    .maybeSingle();

  if (previewError) {
    return { ok: false, status: 500, error: "تعذر قراءة التوصية" };
  }
  if (!signalPreview?.id) {
    return { ok: false, status: 404, error: "التوصية غير موجودة" };
  }

  const currentStatus = normalizeTradeStatus(signalPreview.trade_status || signalPreview.status);
  const transition = validateStatusTransition(currentStatus, eventType);
  if (!transition.allowed) {
    return { ok: false, status: 409, error: transition.reason };
  }

  const atomic = await atomicStatusTransition(supabase, {
    signalId: recommendationId,
    eventType,
    adminUser,
    requestId,
  });

  if (!atomic.ok) {
    return { ok: false, status: atomic.status, error: atomic.error };
  }

  const signal = {
    ...signalPreview,
    signal_type: normalizeVipSignalType(signalPreview.signal_type),
    trade_status: atomic.newStatus,
  };

  const normalizedSignalType = signal.signal_type;

  let eligibleEmails = [];
  try {
    eligibleEmails = await collectEligibleVipRecipientEmails(
      supabase,
      normalizedSignalType,
      deps.batchSize || VIP_NOTIFICATION_BATCH_SIZE
    );
  } catch {
    eligibleEmails = [];
  }

  const jobStats = await createVipStatusDeliveryJobs(supabase, {
    signalId: signal.id,
    eventType,
    emails: eligibleEmails,
  });

  const eventIdempotencyKey = buildStatusEventIdempotencyKey(signal.id, eventType);
  await supabase
    .from("vip_signal_status_events")
    .update({
      eligible_recipient_count: jobStats.eligibleRecipients,
      updated_at: new Date().toISOString(),
    })
    .eq("idempotency_key", eventIdempotencyKey);

  await recordAdminAction(supabase, {
    adminId: adminUser?.id || null,
    adminEmail: adminUser?.email || null,
    action: "vip-recommendation-status-update",
    targetTable: "vip_signals",
    targetId: signal.id,
    details: {
      eventType,
      previousStatus: atomic.previousStatus,
      newStatus: atomic.newStatus,
      eligibleRecipientCount: jobStats.eligibleRecipients,
      deliveryJobsRequested: jobStats.deliveryJobsRequested,
      deliveryJobsCreated: jobStats.deliveryJobsCreated,
      requestId,
      idempotencyKey: eventIdempotencyKey,
      asyncDelivery: true,
    },
  });

  return {
    ok: true,
    status: 202,
    accepted: true,
    deliveryStatus: "processing",
    summary: {
      eligibleRecipients: jobStats.eligibleRecipients,
      deliveryJobsCreated: jobStats.deliveryJobsCreated,
      deliveryJobsRequested: jobStats.deliveryJobsRequested,
    },
    signal: {
      id: signal.id,
      coin: signal.coin,
      tradeStatus: atomic.newStatus,
      eventType,
    },
    eventId: atomic.eventId,
  };
}

export async function retryFailedVipStatusDeliveries(
  supabase,
  { recommendationId, eventType, adminUser, requestId = null }
) {
  if (!VIP_STATUS_EVENT_TYPES.includes(eventType)) {
    return { ok: false, status: 400, error: "eventType غير مدعوم" };
  }

  const { data: signal, error: fetchError } = await supabase
    .from("vip_signals")
    .select(SIGNAL_SELECT)
    .eq("id", recommendationId)
    .maybeSingle();

  if (fetchError) return { ok: false, status: 500, error: "تعذر قراءة التوصية" };
  if (!signal?.id) return { ok: false, status: 404, error: "التوصية غير موجودة" };

  const eventKey = buildStatusEventIdempotencyKey(signal.id, eventType);
  const { data: eventRow } = await supabase
    .from("vip_signal_status_events")
    .select("id")
    .eq("idempotency_key", eventKey)
    .maybeSingle();

  if (!eventRow?.id) {
    return { ok: false, status: 409, error: "لا يوجد حدث مسجّل لإعادة المحاولة" };
  }

  const requeue = await requeueFailedVipStatusDeliveries(supabase, {
    signalId: signal.id,
    eventType,
  });

  if (!requeue.requeued) {
    return {
      ok: true,
      status: 200,
      noOp: true,
      summary: { requeued: 0, message: "لا توجد قنوات فاشلة قابلة لإعادة المحاولة" },
    };
  }

  await recordAdminAction(supabase, {
    adminId: adminUser?.id || null,
    adminEmail: adminUser?.email || null,
    action: "vip-recommendation-status-retry",
    targetTable: "vip_signals",
    targetId: signal.id,
    details: {
      eventType,
      requeuedDeliveries: requeue.requeued,
      requestId,
      asyncDelivery: true,
    },
  });

  return {
    ok: true,
    status: 202,
    accepted: true,
    deliveryStatus: "processing",
    summary: {
      requeued: requeue.requeued,
      deliveryIds: requeue.deliveryIds,
    },
  };
}

async function fetchStatusEventsForSignals(supabase, signalIds) {
  if (!signalIds.length) return {};

  const { data } = await supabase
    .from("vip_signal_status_events")
    .select(
      "id, signal_id, event_type, previous_trade_status, new_trade_status, admin_email, created_at, eligible_recipient_count, site_notifications_sent, push_sent, push_failed, push_unavailable, email_sent, email_failed"
    )
    .in("signal_id", signalIds)
    .order("created_at", { ascending: true });

  const map = {};
  for (const row of data || []) {
    if (!map[row.signal_id]) map[row.signal_id] = [];
    map[row.signal_id].push({
      id: row.id,
      eventType: row.event_type,
      previousStatus: row.previous_trade_status,
      newStatus: row.new_trade_status,
      adminEmail: maskAdminEmail(row.admin_email),
      createdAt: row.created_at,
      summary: {
        siteNotifications: row.site_notifications_sent,
        pushSent: row.push_sent,
        pushFailed: row.push_failed,
        pushUnavailable: row.push_unavailable,
        emailSent: row.email_sent,
        emailFailed: row.email_failed,
      },
      partialFailure:
        (row.push_failed || 0) > 0 ||
        (row.email_failed || 0) > 0 ||
        (row.site_notifications_sent || 0) < (row.eligible_recipient_count || 0),
    });
  }
  return map;
}

function maskAdminEmail(email) {
  const text = String(email || "").trim();
  if (!text.includes("@")) return null;
  return text.replace(/(.{2}).+(@.*)/, "$1***$2");
}

export function getActiveWindowCutoffIso(nowMs = Date.now()) {
  return new Date(nowMs - VIP_ACTIVE_WINDOW_MS).toISOString();
}

export function isActiveVipRecommendation(row, nowMs = Date.now()) {
  const status = normalizeTradeStatus(row?.trade_status ?? row?.tradeStatus);
  if (!VIP_ACTIVE_TRADE_STATUSES.includes(status)) return false;
  const createdMs = new Date(row?.created_at ?? row?.createdAt).getTime();
  return Number.isFinite(createdMs) && createdMs >= nowMs - VIP_ACTIVE_WINDOW_MS;
}

export function isCompletedVipRecommendation(row, nowMs = Date.now()) {
  const status = normalizeTradeStatus(row?.trade_status ?? row?.tradeStatus);
  if (VIP_TERMINAL_TRADE_STATUSES.includes(status)) return true;
  if (VIP_ACTIVE_TRADE_STATUSES.includes(status)) {
    const createdMs = new Date(row?.created_at ?? row?.createdAt).getTime();
    return Number.isFinite(createdMs) && createdMs < nowMs - VIP_ACTIVE_WINDOW_MS;
  }
  return false;
}

function mapSignalRowToItem(row, eventsBySignal = {}) {
  return {
    id: row.id,
    signalType: normalizeVipSignalType(row.signal_type),
    coin: row.coin,
    entry: row.entry,
    targets: row.targets,
    stopLoss: row.stop_loss,
    notes: row.notes,
    createdAt: row.created_at,
    tradeStatus: normalizeTradeStatus(row.trade_status || row.status),
    publishRecipientCount: row.publish_recipient_count,
    publishedByEmail: maskAdminEmail(row.published_by_email),
    lastStatusEvent: row.last_status_event,
    lastStatusEventAt: row.last_status_event_at,
    lastStatusUpdatedBy: maskAdminEmail(row.last_status_updated_by),
    closedAt: row.closed_at,
    target1HitAt: row.target_1_hit_at,
    target2HitAt: row.target_2_hit_at,
    statusHistory: eventsBySignal[row.id] || [],
  };
}

async function fetchVipSignalsWithHistory(supabase, rows) {
  const eventsBySignal = await fetchStatusEventsForSignals(
    supabase,
    rows.map((r) => r.id)
  );
  return rows.map((row) => mapSignalRowToItem(row, eventsBySignal));
}

export async function listActiveVipRecommendations(supabase, { nowMs = Date.now() } = {}) {
  const cutoff = getActiveWindowCutoffIso(nowMs);

  const { data, error } = await supabase
    .from("vip_signals")
    .select(SIGNAL_SELECT)
    .in("trade_status", [...VIP_ACTIVE_TRADE_STATUSES])
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (error) {
    return { ok: false, error: error.message || "تعذر قراءة التوصيات النشطة" };
  }

  const rows = data || [];
  return {
    ok: true,
    items: await fetchVipSignalsWithHistory(supabase, rows),
  };
}

export async function listCompletedVipRecommendations(
  supabase,
  { limit = VIP_COMPLETED_HISTORY_LIMIT, nowMs = Date.now() } = {}
) {
  const cutoff = getActiveWindowCutoffIso(nowMs);
  const safeLimit = Math.min(Math.max(Number(limit) || VIP_COMPLETED_HISTORY_LIMIT, 1), 25);

  const { data, error } = await supabase
    .from("vip_signals")
    .select(SIGNAL_SELECT)
    .or(
      `trade_status.in.(${VIP_TERMINAL_TRADE_STATUSES.join(",")}),and(trade_status.in.(${VIP_ACTIVE_TRADE_STATUSES.join(",")}),created_at.lt.${cutoff})`
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(safeLimit);

  if (error) {
    return { ok: false, error: error.message || "تعذر قراءة سجل التوصيات المنتهية" };
  }

  const rows = data || [];
  return {
    ok: true,
    items: await fetchVipSignalsWithHistory(supabase, rows),
  };
}

/** @deprecated Use listActiveVipRecommendations — kept for backward-compatible imports. */
export async function listRecentVipRecommendations(supabase, options = {}) {
  return listActiveVipRecommendations(supabase, options);
}
