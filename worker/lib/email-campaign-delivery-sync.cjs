"use strict";

const RECIPIENTS_TABLE = "email_campaign_recipients";
const CAMPAIGNS_TABLE = "email_campaigns";
const CAMPAIGN_STATUS_SENDING = "sending";
const CAMPAIGN_STATUS_COMPLETED = "completed";

const DELIVERY_STATUS_RANK = Object.freeze({
  pending: 10,
  queued: 20,
  outbox_pending: 30,
  outbox_processing: 40,
  provider_accepted: 50,
  delayed: 55,
  sent: 60,
  delivered: 70,
  failed: 80,
  bounced: 80,
  complained: 80,
  suppressed: 80,
  skipped: 80,
  cancelled: 90,
  excluded: 0,
});

const TERMINAL_FAILURE = new Set(["failed", "bounced", "complained", "suppressed", "cancelled"]);

function rankFor(status) {
  return DELIVERY_STATUS_RANK[String(status || "").trim()] ?? -1;
}

function shouldApplyDeliveryStatus(current, next) {
  const cur = String(current || "").trim();
  const nxt = String(next || "").trim();
  if (!nxt) return false;
  if (cur === nxt) return true;
  if (cur === "cancelled" || cur === "excluded") return false;
  if (TERMINAL_FAILURE.has(cur) && nxt === "delivered") return false;
  if (cur === "delivered") return false;
  return rankFor(nxt) >= rankFor(cur);
}

function mapWebhookEventToDeliveryStatus(eventType) {
  switch (String(eventType || "").trim()) {
    case "email.sent":
      return "sent";
    case "email.delivered":
      return "delivered";
    case "email.failed":
      return "failed";
    case "email.bounced":
      return "bounced";
    case "email.complained":
      return "complained";
    case "email.suppressed":
      return "suppressed";
    case "email.delivery_delayed":
      return "delayed";
    default:
      return null;
  }
}

function mapOutboxOutcomeToDeliveryStatus(outcome) {
  switch (String(outcome || "").trim()) {
    case "provider_accepted":
    case "sent":
      return "provider_accepted";
    case "failed":
      return "failed";
    case "skipped":
      return "skipped";
    default:
      return null;
  }
}

function timestampFieldForStatus(status) {
  switch (status) {
    case "queued":
      return "queued_at";
    case "outbox_pending":
      return "outbox_queued_at";
    case "provider_accepted":
      return "provider_accepted_at";
    case "sent":
      return "sent_at";
    case "delivered":
      return "delivered_at";
    case "failed":
      return "failed_at";
    case "bounced":
      return "bounced_at";
    case "complained":
      return "complained_at";
    case "cancelled":
      return "cancelled_at";
    default:
      return null;
  }
}

function extractCampaignLinkFromOutboxRow(row = {}) {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    campaignId: metadata.campaign_id || metadata.campaignId || null,
    campaignRecipientId: metadata.campaign_recipient_id || metadata.campaignRecipientId || null,
  };
}

async function findCampaignRecipient(supabase, { outboxId, resendId, campaignRecipientId } = {}) {
  if (campaignRecipientId) {
    const { data, error } = await supabase
      .from(RECIPIENTS_TABLE)
      .select("*")
      .eq("id", campaignRecipientId)
      .maybeSingle();
    if (error) throw new Error(error.message || "Failed to load campaign recipient");
    if (data) return data;
  }

  if (outboxId) {
    const { data, error } = await supabase
      .from(RECIPIENTS_TABLE)
      .select("*")
      .eq("outbox_id", outboxId)
      .maybeSingle();
    if (error) throw new Error(error.message || "Failed to load campaign recipient by outbox");
    if (data) return data;
  }

  if (resendId) {
    const { data, error } = await supabase
      .from(RECIPIENTS_TABLE)
      .select("*")
      .eq("resend_id", resendId)
      .maybeSingle();
    if (error) throw new Error(error.message || "Failed to load campaign recipient by resend");
    if (data) return data;
  }

  return null;
}

async function refreshCampaignMetricsFromRecipients(supabase, campaignId) {
  const { data: recipients, error } = await supabase
    .from(RECIPIENTS_TABLE)
    .select("delivery_status, eligibility_status, eligibility_reason")
    .eq("campaign_id", campaignId);

  if (error) throw new Error(error.message || "Failed to load recipients for metrics");

  const rows = recipients || [];
  const counts = {
    eligible_count: rows.filter((r) => r.eligibility_status === "eligible").length,
    queued_count: rows.filter((r) =>
      ["queued", "outbox_pending", "outbox_processing", "provider_accepted", "sent", "delayed"].includes(
        r.delivery_status
      )
    ).length,
    provider_accepted_count: rows.filter((r) =>
      ["provider_accepted", "sent", "delivered", "delayed"].includes(r.delivery_status)
    ).length,
    delivered_count: rows.filter((r) => r.delivery_status === "delivered").length,
    failed_count: rows.filter((r) => r.delivery_status === "failed").length,
    bounced_count: rows.filter((r) => r.delivery_status === "bounced").length,
    complained_count: rows.filter((r) => r.delivery_status === "complained").length,
    unsubscribed_count: rows.filter(
      (r) => r.delivery_status === "skipped" && r.eligibility_reason === "global-unsubscribed"
    ).length,
  };

  await supabase.from(CAMPAIGNS_TABLE).update(counts).eq("id", campaignId);
  return counts;
}

async function maybeMarkCampaignEnqueueCompleted(supabase, campaignId) {
  const { data: campaign, error: campaignError } = await supabase
    .from(CAMPAIGNS_TABLE)
    .select("id, status")
    .eq("id", campaignId)
    .maybeSingle();

  if (campaignError || !campaign || campaign.status !== CAMPAIGN_STATUS_SENDING) {
    return { updated: false };
  }

  const { count, error } = await supabase
    .from(RECIPIENTS_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("delivery_status", "queued");

  if (error) throw new Error(error.message || "Failed to count queued recipients");

  if ((count || 0) > 0) {
    return { updated: false, queuedRemaining: count };
  }

  const now = new Date().toISOString();
  const { data, error: updateError } = await supabase
    .from(CAMPAIGNS_TABLE)
    .update({
      status: CAMPAIGN_STATUS_COMPLETED,
      completed_at: now,
      enqueue_completed_at: now,
    })
    .eq("id", campaignId)
    .eq("status", CAMPAIGN_STATUS_SENDING)
    .select("id")
    .maybeSingle();

  if (updateError) throw new Error(updateError.message || "Failed to mark campaign enqueue completed");
  return { updated: Boolean(data), enqueueCompletedAt: now };
}

async function applyCampaignRecipientDeliveryUpdate(
  supabase,
  recipient,
  {
    deliveryStatus,
    outboxId = null,
    resendId = null,
    error = null,
    eventAt = null,
  } = {}
) {
  if (!recipient?.id || !deliveryStatus) {
    return { updated: false, reason: "missing-input" };
  }

  if (!shouldApplyDeliveryStatus(recipient.delivery_status, deliveryStatus)) {
    return { updated: false, reason: "status-not-advanced", current: recipient.delivery_status };
  }

  const now = eventAt || new Date().toISOString();
  const patch = {
    delivery_status: deliveryStatus,
    updated_at: new Date().toISOString(),
  };

  const tsField = timestampFieldForStatus(deliveryStatus);
  if (tsField) patch[tsField] = now;
  if (outboxId) patch.outbox_id = outboxId;
  if (resendId) patch.resend_id = resendId;
  if (error) patch.error = String(error).slice(0, 500);

  const { data, error: updateError } = await supabase
    .from(RECIPIENTS_TABLE)
    .update(patch)
    .eq("id", recipient.id)
    .select("id, campaign_id, delivery_status")
    .maybeSingle();

  if (updateError) throw new Error(updateError.message || "Failed to update campaign recipient delivery");

  if (!data) return { updated: false, reason: "no-row" };

  await refreshCampaignMetricsFromRecipients(supabase, data.campaign_id);
  await maybeMarkCampaignEnqueueCompleted(supabase, data.campaign_id);

  return { updated: true, recipientId: data.id, campaignId: data.campaign_id, deliveryStatus: data.delivery_status };
}

async function syncCampaignRecipientFromOutbox(supabase, row, { outcome, resendId = null, error = null } = {}) {
  if (!supabase || !row) return { synced: false, reason: "missing-input" };
  if (String(row.message_type || "").trim() !== "email_campaign") {
    return { synced: false, reason: "not-campaign-email" };
  }

  const link = extractCampaignLinkFromOutboxRow(row);
  const deliveryStatus = mapOutboxOutcomeToDeliveryStatus(outcome);
  if (!deliveryStatus) return { synced: false, reason: "unknown-outcome" };

  const recipient = await findCampaignRecipient(supabase, {
    outboxId: row.id,
    resendId: resendId || row.resend_id || null,
    campaignRecipientId: link.campaignRecipientId,
  });

  if (!recipient) return { synced: false, reason: "recipient-not-found" };

  return applyCampaignRecipientDeliveryUpdate(supabase, recipient, {
    deliveryStatus,
    outboxId: row.id,
    resendId: resendId || row.resend_id || null,
    error,
  });
}

async function syncCampaignRecipientFromWebhook(
  supabase,
  { outboxId = null, resendId = null, eventType, eventAt = null } = {}
) {
  if (!supabase) return { synced: false, reason: "missing-input" };

  const deliveryStatus = mapWebhookEventToDeliveryStatus(eventType);
  if (!deliveryStatus) return { synced: false, reason: "ignored-event" };

  const recipient = await findCampaignRecipient(supabase, { outboxId, resendId });
  if (!recipient) return { synced: false, reason: "recipient-not-found" };

  return applyCampaignRecipientDeliveryUpdate(supabase, recipient, {
    deliveryStatus,
    outboxId: outboxId || recipient.outbox_id || null,
    resendId: resendId || recipient.resend_id || null,
    eventAt,
  });
}

module.exports = {
  DELIVERY_STATUS_RANK,
  shouldApplyDeliveryStatus,
  mapWebhookEventToDeliveryStatus,
  mapOutboxOutcomeToDeliveryStatus,
  syncCampaignRecipientFromOutbox,
  syncCampaignRecipientFromWebhook,
  refreshCampaignMetricsFromRecipients,
  maybeMarkCampaignEnqueueCompleted,
  findCampaignRecipient,
};
