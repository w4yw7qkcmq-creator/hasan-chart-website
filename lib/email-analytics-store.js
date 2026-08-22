import {
  extractEngagementMeta,
  extractMessageType,
  extractOutboxIdFromTags,
  extractRecipientEmail,
  mapEventToStatus,
  parseResendEventTimestamp,
} from "./resend-webhook.js";
import { applySuppressionFromResendEvent } from "./email-suppression.js";
import { syncCampaignRecipientFromWebhook } from "./email-campaign/delivery-sync.js";
import {
  EMAIL_ANALYTICS_EVENT_COLUMNS,
  EMAIL_MESSAGE_COLUMNS,
} from "./supabase-query-columns.js";

const TRACKED_EVENTS = new Set([
  "email.sent",
  "email.delivered",
  "email.failed",
  "email.bounced",
  "email.complained",
  "email.opened",
  "email.clicked",
  "email.suppressed",
  "email.delivery_delayed",
]);

const STATUS_LABELS = {
  sent: "تم الإرسال",
  delivered: "تم التسليم",
  failed: "فشل",
  bounced: "مرتد",
  complained: "شكوى",
  suppressed: "مُقمع",
  delayed: "تأخير",
};

function formatTimestamp(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ar");
}

function percent(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function averageDeliveryMs(messages) {
  const durations = messages
    .filter((item) => item.sent_at && item.delivered_at)
    .map((item) => new Date(item.delivered_at).getTime() - new Date(item.sent_at).getTime())
    .filter((value) => Number.isFinite(value) && value >= 0);

  if (!durations.length) return null;
  return Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length);
}

function formatDuration(ms) {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} ث`;
  return `${(ms / 60000).toFixed(1)} د`;
}

function getTopMessageType(messages) {
  const counts = new Map();
  for (const item of messages) {
    const key = item.message_type || "general";
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  let topType = "—";
  let topCount = 0;
  for (const [type, count] of counts.entries()) {
    if (count > topCount) {
      topType = type;
      topCount = count;
    }
  }

  return topCount ? { type: topType, count: topCount } : { type: "—", count: 0 };
}

function getMessageTimestamp(item) {
  return item.sent_at || item.created_at;
}

function buildHourlySeries(messages, hours = 24) {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  const buckets = [];

  for (let offset = hours - 1; offset >= 0; offset -= 1) {
    const date = new Date(now);
    date.setHours(now.getHours() - offset);
    buckets.push({
      key: date.toISOString(),
      label: date.toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" }),
      count: 0,
    });
  }

  for (const item of messages) {
    const source = getMessageTimestamp(item);
    if (!source) continue;
    const date = new Date(source);
    const diffHours = Math.floor((now.getTime() - date.getTime()) / (60 * 60 * 1000));
    if (diffHours < 0 || diffHours >= hours) continue;
    const bucket = buckets[buckets.length - 1 - diffHours];
    if (bucket) bucket.count += 1;
  }

  return buckets;
}

function buildDailySeries(messages, days = 7) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    const key = date.toISOString().slice(0, 10);
    buckets.push({
      key,
      label: date.toLocaleDateString("ar", { month: "short", day: "numeric" }),
      count: 0,
    });
  }

  const bucketMap = new Map(buckets.map((item) => [item.key, item]));

  for (const item of messages) {
    const source = getMessageTimestamp(item);
    if (!source) continue;
    const key = new Date(source).toISOString().slice(0, 10);
    const bucket = bucketMap.get(key);
    if (bucket) bucket.count += 1;
  }

  return buckets;
}

export function buildChartSeries(messages = []) {
  return {
    "24h": buildHourlySeries(messages, 24),
    "7d": buildDailySeries(messages, 7),
    "30d": buildDailySeries(messages, 30),
  };
}

export function computeEmailAnalytics(messages = []) {
  const totalSent = messages.length;
  const delivered = messages.filter((item) => item.status === "delivered" || item.delivered_at).length;
  const failed = messages.filter((item) => item.status === "failed").length;
  const bounced = messages.filter((item) => item.status === "bounced").length;
  const complaints = messages.filter((item) => item.status === "complained").length;
  const opened = messages.filter((item) => (item.open_count || 0) > 0 || item.opened).length;
  const clicked = messages.filter((item) => (item.click_count || 0) > 0 || item.clicked).length;
  const deliverabilityBase = delivered + failed + bounced;
  const now = Date.now();

  const last24h = messages.filter((item) => {
    const source = getMessageTimestamp(item);
    if (!source) return false;
    return now - new Date(source).getTime() <= 24 * 60 * 60 * 1000;
  });

  const lastHour = messages.filter((item) => {
    const source = getMessageTimestamp(item);
    if (!source) return false;
    return now - new Date(source).getTime() <= 60 * 60 * 1000;
  });

  const topMessageType = getTopMessageType(last24h);

  return {
    summary: {
      totalSent,
      delivered,
      openRate: percent(opened, delivered),
      clickRate: percent(clicked, delivered),
      failed,
      bounced,
      complaints,
      deliverability: percent(delivered, deliverabilityBase),
      opened,
      clicked,
    },
    todayActivity: {
      last24Hours: last24h.length,
      lastHour: lastHour.length,
      averageSendTime: formatDuration(averageDeliveryMs(last24h)),
      averageSendTimeMs: averageDeliveryMs(last24h),
      topMessageType: topMessageType.type,
      topMessageTypeCount: topMessageType.count,
    },
    chartSeries: buildChartSeries(messages),
  };
}

export function formatEmailMessageRow(item) {
  const sentAt = item.sent_at || item.created_at;

  return {
    id: item.id,
    resendId: item.resend_id,
    email: item.recipient_email,
    subject: item.subject || "—",
    messageType: item.message_type || "general",
    status: item.status || "sent",
    statusLabel: STATUS_LABELS[item.status] || item.status || "—",
    opened: Boolean(item.opened || (item.open_count || 0) > 0),
    clicked: Boolean(item.clicked || (item.click_count || 0) > 0),
    openCount: item.open_count || 0,
    clickCount: item.click_count || 0,
    device: item.device || "—",
    country: item.country || "—",
    ipAddress: item.ip_address || "—",
    sentAt,
    sentAtLabel: formatTimestamp(sentAt),
    openedAt: item.opened_at,
    openedAtLabel: formatTimestamp(item.opened_at),
    clickedAt: item.clicked_at,
    clickedAtLabel: formatTimestamp(item.clicked_at),
    deliveredAt: item.delivered_at,
    deliveredAtLabel: formatTimestamp(item.delivered_at),
    time: sentAt,
    timeLabel: formatTimestamp(sentAt),
  };
}

function formatEventRow(event) {
  return {
    id: event.id,
    type: event.event_type,
    createdAt: event.created_at,
    createdAtLabel: formatTimestamp(event.created_at),
    payload: event.payload,
  };
}

export async function recordResendWebhookEvent(supabase, event) {
  const eventType = String(event?.type || "").trim();
  const data = event?.data || {};
  const resendId = String(data.email_id || data.id || "").trim();
  const recipientEmail = extractRecipientEmail(data);
  const messageType = extractMessageType(data);
  const outboxId = extractOutboxIdFromTags(data);
  const createdAt = parseResendEventTimestamp(event?.created_at || data.created_at);
  const engagement = extractEngagementMeta(data, eventType);

  if (!TRACKED_EVENTS.has(eventType)) {
    return { ok: true, ignored: true };
  }

  const { error: eventError } = await supabase.from("email_analytics_events").insert({
    resend_id: resendId || null,
    event_type: eventType,
    recipient_email: recipientEmail || null,
    message_type: messageType,
    payload: event,
    created_at: createdAt || new Date().toISOString(),
  });

  if (eventError) {
    throw new Error(eventError.message || "Failed to store webhook event");
  }

  let suppressionResult = { applied: false };
  try {
    suppressionResult = await applySuppressionFromResendEvent(supabase, event);
  } catch (suppressionError) {
    console.error("EMAIL_SUPPRESSION_WEBHOOK_ERROR:", suppressionError?.message || suppressionError);
  }

  if (!resendId) {
    return { ok: true, stored: true, updatedMessage: false, suppression: suppressionResult };
  }

  const { data: existing, error: existingError } = await supabase
    .from("email_messages")
    .select(EMAIL_MESSAGE_COLUMNS)
    .eq("resend_id", resendId)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message || "Failed to load email message");
  }

  const nowIso = createdAt || new Date().toISOString();
  const nextStatus = mapEventToStatus(eventType);
  const baseRow = {
    resend_id: resendId,
    recipient_email: recipientEmail || existing?.recipient_email || "unknown@unknown",
    subject: data.subject || existing?.subject || null,
    message_type: messageType || existing?.message_type || "general",
    outbox_id: outboxId || existing?.outbox_id || null,
    last_event_at: nowIso,
    updated_at: new Date().toISOString(),
  };

  if (engagement.ip) baseRow.ip_address = engagement.ip;
  if (engagement.device) baseRow.device = engagement.device;
  if (engagement.country) baseRow.country = engagement.country;

  if (eventType === "email.sent") {
    baseRow.sent_at = nowIso;
    baseRow.status = "sent";
  }

  if (eventType === "email.delivered") {
    baseRow.delivered_at = nowIso;
    baseRow.status = "delivered";
  }

  if (eventType === "email.failed") {
    baseRow.failed_at = nowIso;
    baseRow.status = "failed";
  }

  if (eventType === "email.bounced") {
    baseRow.bounced_at = nowIso;
    baseRow.status = "bounced";
  }

  if (eventType === "email.complained") {
    baseRow.complained_at = nowIso;
    baseRow.status = "complained";
  }

  if (eventType === "email.opened") {
    baseRow.opened = true;
    baseRow.opened_at = existing?.opened_at || nowIso;
    baseRow.open_count = (existing?.open_count || 0) + 1;
    console.log("EMAIL_ANALYTICS_OPENED", {
      resendId,
      recipientEmail,
      openCount: baseRow.open_count,
      openedAt: baseRow.opened_at,
    });
    if (!existing?.status || existing.status === "sent") {
      baseRow.status = existing?.delivered_at ? "delivered" : existing?.status || "sent";
    }
  }

  if (eventType === "email.clicked") {
    baseRow.clicked = true;
    baseRow.clicked_at = existing?.clicked_at || nowIso;
    baseRow.click_count = (existing?.click_count || 0) + 1;
    console.log("EMAIL_ANALYTICS_CLICKED", {
      resendId,
      recipientEmail,
      clickCount: baseRow.click_count,
      clickedAt: baseRow.clicked_at,
      ip: engagement.ip || null,
      device: engagement.device || null,
      link: data.click?.link || null,
    });
    if (!existing?.status || existing.status === "sent") {
      baseRow.status = existing?.delivered_at ? "delivered" : existing?.status || "sent";
    }
  }

  if (eventType === "email.delivery_delayed") {
    baseRow.status = existing?.status && existing.status !== "sent" ? existing.status : "delayed";
  }

  if (existing) {
    if (!nextStatus && !baseRow.status) baseRow.status = existing.status;
    else if (!baseRow.status) baseRow.status = existing.status;

    const { error: updateError } = await supabase
      .from("email_messages")
      .update({
        ...baseRow,
        opened: baseRow.opened ?? existing.opened,
        clicked: baseRow.clicked ?? existing.clicked,
        open_count: baseRow.open_count ?? existing.open_count ?? 0,
        click_count: baseRow.click_count ?? existing.click_count ?? 0,
        device: baseRow.device || existing.device,
        country: baseRow.country || existing.country,
        ip_address: baseRow.ip_address || existing.ip_address,
        sent_at: baseRow.sent_at || existing.sent_at,
        delivered_at: baseRow.delivered_at || existing.delivered_at,
        failed_at: baseRow.failed_at || existing.failed_at,
        bounced_at: baseRow.bounced_at || existing.bounced_at,
        complained_at: baseRow.complained_at || existing.complained_at,
        opened_at: baseRow.opened_at || existing.opened_at,
        clicked_at: baseRow.clicked_at || existing.clicked_at,
        outbox_id: baseRow.outbox_id || existing.outbox_id,
      })
      .eq("resend_id", resendId);

    if (updateError) {
      throw new Error(updateError.message || "Failed to update email message");
    }
  } else {
    if (!baseRow.status) baseRow.status = nextStatus || "sent";

    const { error: insertError } = await supabase.from("email_messages").insert({
      ...baseRow,
      opened: Boolean(baseRow.opened),
      clicked: Boolean(baseRow.clicked),
      open_count: baseRow.open_count || 0,
      click_count: baseRow.click_count || 0,
      created_at: nowIso,
    });

    if (insertError) {
      throw new Error(insertError.message || "Failed to insert email message");
    }
  }

  let campaignSync = { synced: false };
  try {
    campaignSync = await syncCampaignRecipientFromWebhook(supabase, {
      outboxId: outboxId || existing?.outbox_id || null,
      resendId,
      eventType,
      eventAt: nowIso,
    });
  } catch (campaignSyncError) {
    console.error("EMAIL_CAMPAIGN_DELIVERY_SYNC_ERROR:", campaignSyncError?.message || campaignSyncError);
  }

  return {
    ok: true,
    stored: true,
    updatedMessage: true,
    suppression: suppressionResult,
    campaignSync,
  };
}

function applyMessageFilters(query, filters = {}) {
  const email = String(filters.email || "").trim();
  const status = String(filters.status || "").trim();
  const messageType = String(filters.messageType || "").trim();
  const dateFrom = String(filters.dateFrom || "").trim();
  const dateTo = String(filters.dateTo || "").trim();

  if (email) query = query.ilike("recipient_email", `%${email}%`);
  if (status && status !== "all") query = query.eq("status", status);
  if (messageType && messageType !== "all") query = query.eq("message_type", messageType);
  if (dateFrom) query = query.gte("sent_at", `${dateFrom}T00:00:00.000Z`);
  if (dateTo) query = query.lte("sent_at", `${dateTo}T23:59:59.999Z`);

  return query;
}

export async function syncRecentEmailsFromResend(supabase, { limit = 100 } = {}) {
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  if (!resendApiKey) {
    return { ok: false, skipped: true, reason: "Missing RESEND_API_KEY" };
  }

  const response = await fetch(`https://api.resend.com/emails?limit=${Math.min(limit, 100)}`, {
    headers: { Authorization: `Bearer ${resendApiKey}` },
    cache: "no-store",
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, error: payload?.message || payload?.error || "Resend API sync failed" };
  }

  const emails = Array.isArray(payload?.data) ? payload.data : [];
  let synced = 0;

  for (const email of emails) {
    const resendId = String(email.id || "").trim();
    if (!resendId) continue;

    const row = {
      resend_id: resendId,
      recipient_email: extractRecipientEmail(email) || "unknown@unknown",
      subject: email.subject || null,
      message_type: extractMessageType(email),
      status: String(email.last_event || email.status || "sent").replace("email.", ""),
      sent_at: parseResendEventTimestamp(email.created_at),
      last_event_at: parseResendEventTimestamp(
        email.last_event || email.updated_at || email.created_at
      ),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("email_messages").upsert(row, {
      onConflict: "resend_id",
      ignoreDuplicates: false,
    });

    if (!error) synced += 1;
  }

  return { ok: true, synced, total: emails.length };
}

export async function getWebhookHealth(supabase) {
  const webhookSecretConfigured = Boolean(process.env.RESEND_WEBHOOK_SECRET?.trim());
  const webhookUrl = "/api/webhooks/resend";

  const { data: latestEvent, error } = await supabase
    .from("email_analytics_events")
    .select("created_at, event_type")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error && !/relation .* does not exist/i.test(error.message || "")) {
    throw new Error(error.message || "Failed to load webhook health");
  }

  const lastWebhookEventAt = latestEvent?.created_at || null;
  const lastWebhookEventType = latestEvent?.event_type || null;
  const webhookConnected = webhookSecretConfigured && Boolean(lastWebhookEventAt);

  return {
    webhookUrl,
    webhookSecretConfigured,
    webhookConnected,
    webhookStatus: webhookConnected ? "connected" : "setup_required",
    lastWebhookEventAt,
    lastWebhookEventType,
    lastWebhookEventLabel: lastWebhookEventAt
      ? new Date(lastWebhookEventAt).toLocaleString("ar")
      : null,
  };
}

export async function fetchEmailAnalyticsData(
  supabase,
  { limit = 500, syncResend = false, filters = {} } = {}
) {
  if (syncResend) {
    await syncRecentEmailsFromResend(supabase).catch(() => null);
  }

  const webhookHealth = await getWebhookHealth(supabase).catch(() => ({
    webhookUrl: "/api/webhooks/resend",
    webhookSecretConfigured: Boolean(process.env.RESEND_WEBHOOK_SECRET?.trim()),
    webhookConnected: false,
    webhookStatus: "setup_required",
    lastWebhookEventAt: null,
    lastWebhookEventType: null,
    lastWebhookEventLabel: null,
  }));

  const safeLimit = Math.min(Math.max(limit, 1), 1000);

  let query = supabase
    .from("email_messages")
    .select(EMAIL_MESSAGE_COLUMNS)
    .order("sent_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  query = applyMessageFilters(query, filters);

  const { data: messages, error } = await query;

  if (error) {
    if (/relation .* does not exist/i.test(error.message || "")) {
      const empty = computeEmailAnalytics([]);
      return {
        ok: true,
        resendConfigured: Boolean(process.env.RESEND_API_KEY?.trim()),
        messageTypes: [],
        ...webhookHealth,
        ...empty,
        rows: [],
      };
    }
    throw new Error(error.message || "Failed to load email analytics");
  }

  const list = messages || [];
  const analytics = computeEmailAnalytics(list);
  const messageTypes = [...new Set(list.map((item) => item.message_type || "general"))].sort();

  return {
    ok: true,
    resendConfigured: Boolean(process.env.RESEND_API_KEY?.trim()),
    messageTypes,
    ...webhookHealth,
    ...analytics,
    rows: list.map(formatEmailMessageRow),
  };
}

export async function fetchEmailMessageDetail(supabase, id) {
  const { data: message, error } = await supabase
    .from("email_messages")
    .select(EMAIL_MESSAGE_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to load email message");
  }

  if (!message) {
    return null;
  }

  const { data: events, error: eventsError } = await supabase
    .from("email_analytics_events")
    .select(EMAIL_ANALYTICS_EVENT_COLUMNS)
    .eq("resend_id", message.resend_id)
    .order("created_at", { ascending: true });

  if (eventsError) {
    throw new Error(eventsError.message || "Failed to load email events");
  }

  return {
    message: formatEmailMessageRow(message),
    events: (events || []).map(formatEventRow),
  };
}
