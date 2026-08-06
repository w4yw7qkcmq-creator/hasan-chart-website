import { getSiteUrl } from "./email.js";
import {
  buildEmailHeading,
  buildEmailHighlightCard,
  buildEmailParagraph,
  buildEmailToneCard,
  escapeEmailHtml,
} from "./email-layout.js";
import { dispatchTemplateTransactionalEmail } from "./template-transactional-email.js";
import { recordAdminAction } from "./admin-audit-log.js";
import { dispatchUnifiedSiteAlerts } from "./site-notification-dispatch.js";
import { sendTargetedPushNotification } from "./push-notifications.js";
import {
  VIP_NOTIFICATION_BATCH_SIZE,
  normalizeVipSignalType,
  signalTypeLabel,
} from "./vip-subscriber-notify.js";
import { collectEligibleVipRecipientEmails } from "./vip-recommendation-eligibility.js";
import {
  buildVipStatusNotificationCopy,
  mapEventToTradeStatus,
  normalizeTradeStatus,
  validateStatusTransition,
  VIP_STATUS_EVENT_TYPES,
} from "./vip-recommendation-status-copy.js";

export const MAX_VIP_STATUS_DELIVERY_ATTEMPTS = 3;
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

export function buildVipStatusUpdateEmailContent({ eventType, signal, copy }) {
  const symbol = escapeEmailHtml(String(signal?.coin || "").trim().toUpperCase());
  const label = escapeEmailHtml(signalTypeLabel(signal?.signal_type));
  const updatedAt = new Date().toLocaleString("ar-EG", {
    timeZone: "Asia/Riyadh",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short",
  });

  return `
${buildEmailHeading(escapeEmailHtml(copy.title), { level: 2 })}
${buildEmailHighlightCard({ label: "نوع الصفقة", value: label })}
${buildEmailHighlightCard({ label: "العملة", value: symbol })}
${buildEmailToneCard({
  tone: eventType === "close_now" ? "red" : "green",
  title: "تحديث الحالة",
  body: escapeEmailHtml(copy.message.replace(/\n/g, " ")),
})}
${buildEmailParagraph(`وقت التحديث: ${escapeEmailHtml(updatedAt)}`, { muted: true })}
${buildEmailParagraph("يرجى الالتزام بإدارة المخاطر وعدم المبالغة في حجم الصفقة.", { muted: true })}
  `.trim();
}

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

async function loadDeliveryByKey(supabase, idempotencyKey) {
  const { data } = await supabase
    .from("vip_signal_status_deliveries")
    .select("*")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  return data;
}

async function beginDeliveryAttempt(supabase, row, { retryOnly = false } = {}) {
  const existing = await loadDeliveryByKey(supabase, row.idempotency_key);

  if (existing) {
    if (existing.status === "delivered" || existing.status === "skipped") {
      return { proceed: false, reason: "already-delivered", existing };
    }
    if (existing.status === "unavailable") {
      return { proceed: false, reason: "unavailable", existing };
    }
    if (retryOnly && existing.status !== "failed") {
      return { proceed: false, reason: "not-retryable", existing };
    }
    if ((existing.attempt_count || 0) >= MAX_VIP_STATUS_DELIVERY_ATTEMPTS) {
      return { proceed: false, reason: "max-attempts", existing };
    }

    const nextAttempt = (existing.attempt_count || 0) + 1;
    await supabase
      .from("vip_signal_status_deliveries")
      .update({
        status: "sending",
        attempt_count: nextAttempt,
        last_attempt_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    return { proceed: true, existing, deliveryId: existing.id, retry: true };
  }

  if (retryOnly) {
    return { proceed: false, reason: "no-row" };
  }

  const { data, error } = await supabase
    .from("vip_signal_status_deliveries")
    .insert({
      ...row,
      status: "pending",
      attempt_count: 1,
      last_attempt_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505" || /duplicate/i.test(String(error.message || ""))) {
      const dup = await loadDeliveryByKey(supabase, row.idempotency_key);
      return { proceed: false, reason: "duplicate-race", existing: dup };
    }
    return { proceed: false, error };
  }

  return { proceed: true, deliveryId: data?.id, retry: false };
}

async function finalizeDelivery(supabase, deliveryId, patch) {
  if (!deliveryId) return;
  await supabase
    .from("vip_signal_status_deliveries")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", deliveryId);
}

async function deliverSiteChannel(supabase, ctx, deps) {
  const { signal, eventType, copy, email, signalPagePath, deliveryId } = ctx;
  const siteKey = buildVipStatusSiteNotificationKey(signal.id, eventType, email);
  const dispatchUnified = deps.dispatchUnifiedSiteAlerts || dispatchUnifiedSiteAlerts;

  try {
    const alertResult = await dispatchUnified(supabase, {
      preset: "vip_signal",
      userEmail: email,
      title: copy.title,
      message: copy.message,
      notificationKey: siteKey,
      type: copy.siteType,
      url: signalPagePath,
      metadata: {
        signalId: signal.id,
        signalType: signal.signal_type,
        coin: signal.coin,
        eventType: copy.eventTypeKey,
        notification_key: siteKey,
      },
      sendEmail: null,
    });

    if (alertResult.notificationCreated) {
      await finalizeDelivery(supabase, deliveryId, {
        status: "delivered",
        delivered_at: new Date().toISOString(),
      });
      return { sent: 1, failed: 0, skipped: 0 };
    }

    await finalizeDelivery(supabase, deliveryId, {
      status: "skipped",
      error_message_safe: alertResult.reason || "skipped",
    });
    return { sent: 0, failed: 0, skipped: 1 };
  } catch (err) {
    await finalizeDelivery(supabase, deliveryId, {
      status: "failed",
      failed_at: new Date().toISOString(),
      error_message_safe: String(err?.message || "site-failed").slice(0, 200),
    });
    return { sent: 0, failed: 1, skipped: 0 };
  }
}

async function deliverPushChannel(supabase, ctx, deps) {
  const { signal, eventType, copy, email, signalPageUrl, deliveryId } = ctx;
  const dispatchPush = deps.sendTargetedPushNotification || sendTargetedPushNotification;

  try {
    const pushResult = await dispatchPush({
      supabase,
      email,
      title: copy.title,
      body: copy.message,
      url: signalPageUrl,
      type: copy.siteType,
      notificationKey: copy.notificationKey,
      tag: buildVipStatusPushTag(signal.id, eventType),
      successLogTag: "VIP_STATUS_PUSH_SENT",
      meta: { signalId: signal.id, eventType, coin: signal.coin },
    });

    if ((pushResult?.sent || 0) > 0) {
      await finalizeDelivery(supabase, deliveryId, {
        status: "delivered",
        delivered_at: new Date().toISOString(),
        provider_message_id: pushResult?.messageId || null,
      });
      return { sent: 1, failed: 0, unavailable: 0 };
    }

    const unavailable =
      pushResult?.skipReason === "expired" ||
      pushResult?.skipReason === "no-subscription" ||
      (pushResult?.skipped || 0) > 0;

    await finalizeDelivery(supabase, deliveryId, {
      status: unavailable ? "unavailable" : "failed",
      failed_at: unavailable ? null : new Date().toISOString(),
      error_code: pushResult?.skipReason || "push-not-sent",
      error_message_safe: String(pushResult?.skipReason || "push-unavailable").slice(0, 200),
    });
    return { sent: 0, failed: unavailable ? 0 : 1, unavailable: unavailable ? 1 : 0 };
  } catch (err) {
    await finalizeDelivery(supabase, deliveryId, {
      status: "failed",
      failed_at: new Date().toISOString(),
      error_message_safe: String(err?.message || "push-failed").slice(0, 200),
    });
    return { sent: 0, failed: 1, unavailable: 0 };
  }
}

async function deliverEmailChannel(supabase, ctx, deps) {
  const { signal, eventType, copy, email, signalPageUrl, emailContent, deliveryId } = ctx;
  const emailKey = buildStatusDeliveryIdempotencyKey(signal.id, eventType, email, "email");
  const dispatchEmail = deps.dispatchTemplateTransactionalEmail || dispatchTemplateTransactionalEmail;

  if (!email.includes("@")) {
    await finalizeDelivery(supabase, deliveryId, {
      status: "unavailable",
      error_code: "invalid-email",
    });
    return { sent: 0, failed: 0, unavailable: 1 };
  }

  try {
    const emailResult = await dispatchEmail({
      idempotencyKey: emailKey,
      recipientEmail: email,
      messageType: "vip_signal_status",
      recordId: signal.id,
      subject: copy.subject,
      title: copy.title,
      content: emailContent,
      actionText: "فتح صفحة التوصيات",
      actionUrl: signalPageUrl,
      metadata: {
        source: "vip_signal_status",
        signalId: signal.id,
        eventType,
        coin: signal.coin,
      },
    });

    if (emailResult?.sent || emailResult?.queued || emailResult?.duplicate) {
      await finalizeDelivery(supabase, deliveryId, {
        status: "delivered",
        delivered_at: new Date().toISOString(),
        provider_message_id: emailResult?.providerId || emailResult?.id || null,
      });
      return { sent: 1, failed: 0, unavailable: 0 };
    }

    await finalizeDelivery(supabase, deliveryId, {
      status: "failed",
      failed_at: new Date().toISOString(),
      error_message_safe: String(emailResult?.error || "email-failed").slice(0, 200),
    });
    return { sent: 0, failed: 1, unavailable: 0 };
  } catch (err) {
    await finalizeDelivery(supabase, deliveryId, {
      status: "failed",
      failed_at: new Date().toISOString(),
      error_message_safe: String(err?.message || "email-failed").slice(0, 200),
    });
    return { sent: 0, failed: 1, unavailable: 0 };
  }
}

async function dispatchStatusToRecipient(supabase, ctx, deps, { retryOnly = false } = {}) {
  const { signal, eventType, email } = ctx;
  const summary = {
    site: { sent: 0, failed: 0, skipped: 0 },
    push: { sent: 0, failed: 0, unavailable: 0 },
    email: { sent: 0, failed: 0, unavailable: 0 },
  };

  const channels = [
    {
      channel: "site",
      deliver: deliverSiteChannel,
      mapResult: (r) => {
        summary.site.sent += r.sent;
        summary.site.failed += r.failed;
        summary.site.skipped += r.skipped;
      },
    },
    {
      channel: "push",
      deliver: deliverPushChannel,
      mapResult: (r) => {
        summary.push.sent += r.sent;
        summary.push.failed += r.failed;
        summary.push.unavailable += r.unavailable;
      },
    },
    {
      channel: "email",
      deliver: deliverEmailChannel,
      mapResult: (r) => {
        summary.email.sent += r.sent;
        summary.email.failed += r.failed;
        summary.email.unavailable += r.unavailable || 0;
      },
    },
  ];

  for (const { channel, deliver, mapResult } of channels) {
    const idempotencyKey = buildStatusDeliveryIdempotencyKey(signal.id, eventType, email, channel);
    const gate = await beginDeliveryAttempt(
      supabase,
      {
        signal_id: signal.id,
        event_type: eventType,
        user_email: email,
        channel,
        idempotency_key: idempotencyKey,
      },
      { retryOnly }
    );

    if (!gate.proceed) {
      if (gate.reason === "already-delivered" || gate.reason === "duplicate-race") {
        if (channel === "site") summary.site.skipped += 1;
        if (channel === "push") summary.push.unavailable += 1;
      }
      continue;
    }

    const result = await deliver(supabase, { ...ctx, deliveryId: gate.deliveryId }, deps);
    mapResult(result);
  }

  return summary;
}

function aggregateTotals(totals, result) {
  totals.siteNotifications += result.site.sent;
  totals.pushSent += result.push.sent;
  totals.pushUnavailable += result.push.unavailable;
  totals.pushFailed += result.push.failed;
  totals.emailSent += result.email.sent;
  totals.emailFailed += result.email.failed;
  totals.emailUnavailable += result.email.unavailable || 0;
}

async function runDeliveries(supabase, ctx, deps, { emails, retryOnly = false } = {}) {
  const totals = {
    eligibleRecipients: emails.length,
    siteNotifications: 0,
    pushSent: 0,
    pushUnavailable: 0,
    pushFailed: 0,
    emailSent: 0,
    emailFailed: 0,
    emailUnavailable: 0,
  };

  for (let i = 0; i < emails.length; i += VIP_STATUS_PUSH_CONCURRENCY) {
    const chunk = emails.slice(i, i + VIP_STATUS_PUSH_CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map((email) =>
        dispatchStatusToRecipient(supabase, { ...ctx, email }, deps, { retryOnly })
      )
    );

    for (const settled of results) {
      if (settled.status === "fulfilled") {
        aggregateTotals(totals, settled.value);
      } else {
        totals.pushFailed += 1;
      }
    }
  }

  return totals;
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
  const signalPagePath = normalizedSignalType === "futures" ? "/vip-futures" : "/vip-spot";
  const signalPageUrl = `${getSiteUrl()}${signalPagePath}`;
  const copy = buildVipStatusNotificationCopy(eventType, signal);
  const emailContent = buildVipStatusUpdateEmailContent({ eventType, signal, copy });

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

  const totals = await runDeliveries(
    supabase,
    {
      signal,
      eventType,
      copy,
      signalPagePath,
      signalPageUrl,
      emailContent,
    },
    deps,
    { emails: eligibleEmails, retryOnly: false }
  );

  const eventIdempotencyKey = buildStatusEventIdempotencyKey(signal.id, eventType);
  await supabase
    .from("vip_signal_status_events")
    .update({
      eligible_recipient_count: totals.eligibleRecipients,
      site_notifications_sent: totals.siteNotifications,
      push_sent: totals.pushSent,
      push_unavailable: totals.pushUnavailable,
      push_failed: totals.pushFailed,
      email_sent: totals.emailSent,
      email_failed: totals.emailFailed,
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
      eligibleRecipientCount: totals.eligibleRecipients,
      ...totals,
      requestId,
      idempotencyKey: eventIdempotencyKey,
    },
  });

  const partialFailure =
    totals.pushFailed > 0 ||
    totals.emailFailed > 0 ||
    totals.siteNotifications < totals.eligibleRecipients;

  return {
    ok: true,
    status: 200,
    partialFailure,
    summary: {
      ...totals,
      retryableFailures: totals.pushFailed + totals.emailFailed,
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
  { recommendationId, eventType, adminUser, requestId = null, deps = {} }
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

  const { data: failedRows } = await supabase
    .from("vip_signal_status_deliveries")
    .select("user_email")
    .eq("signal_id", signal.id)
    .eq("event_type", eventType)
    .eq("status", "failed")
    .lt("attempt_count", MAX_VIP_STATUS_DELIVERY_ATTEMPTS);

  const retryEmails = [...new Set((failedRows || []).map((r) => normalizeEmail(r.user_email)).filter(Boolean))];

  if (!retryEmails.length) {
    return {
      ok: true,
      status: 200,
      noOp: true,
      summary: { retried: 0, message: "لا توجد قنوات فاشلة قابلة لإعادة المحاولة" },
    };
  }

  const normalizedSignalType = normalizeVipSignalType(signal.signal_type);
  const signalPagePath = normalizedSignalType === "futures" ? "/vip-futures" : "/vip-spot";
  const signalPageUrl = `${getSiteUrl()}${signalPagePath}`;
  const copy = buildVipStatusNotificationCopy(eventType, {
    ...signal,
    signal_type: normalizedSignalType,
  });
  const emailContent = buildVipStatusUpdateEmailContent({
    eventType,
    signal: { ...signal, signal_type: normalizedSignalType },
    copy,
  });

  const totals = await runDeliveries(
    supabase,
    {
      signal: { ...signal, signal_type: normalizedSignalType },
      eventType,
      copy,
      signalPagePath,
      signalPageUrl,
      emailContent,
    },
    deps,
    { emails: retryEmails, retryOnly: true }
  );

  await recordAdminAction(supabase, {
    adminId: adminUser?.id || null,
    adminEmail: adminUser?.email || null,
    action: "vip-recommendation-status-retry",
    targetTable: "vip_signals",
    targetId: signal.id,
    details: {
      eventType,
      retriedRecipients: retryEmails.length,
      requestId,
      ...totals,
    },
  });

  return {
    ok: true,
    status: 200,
    partialFailure: totals.pushFailed > 0 || totals.emailFailed > 0,
    summary: { ...totals, retriedRecipients: retryEmails.length },
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
