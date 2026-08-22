import { EMAIL_CATEGORIES } from "../email-categories.js";
import { evaluateEmailRecipient } from "../email-recipient-eligibility.js";
import { enqueueEmail } from "../email-outbox-shared.js";
import {
  buildCampaignOutboxIdempotencyKey,
  CAMPAIGN_OUTBOX_PRIORITY,
  CAMPAIGN_STATUS,
} from "./constants.js";
import { buildCampaignEmailHtml, buildCampaignEmailText } from "./renderer.js";
import { getCampaignById } from "./store.js";

const RECIPIENTS_TABLE = "email_campaign_recipients";

export async function launchCampaignSending(supabase, campaignId) {
  const campaign = await getCampaignById(supabase, campaignId);
  if (!campaign) throw new Error("Campaign not found");
  if (campaign.status !== CAMPAIGN_STATUS.READY && campaign.status !== CAMPAIGN_STATUS.PAUSED) {
    throw new Error(`Campaign cannot launch from status ${campaign.status}`);
  }
  if ((campaign.eligible_count || 0) <= 0) {
    throw new Error("Campaign has no eligible recipients");
  }

  const { data: started, error: startError } = await supabase.rpc(
    "try_start_email_campaign_sending",
    { p_campaign_id: campaignId }
  );

  if (startError) throw new Error(startError.message || "Failed to start campaign");
  if (!started) throw new Error("Campaign launch already in progress or invalid state");

  const { data: queuedCount, error: queueError } = await supabase.rpc(
    "queue_email_campaign_recipients",
    { p_campaign_id: campaignId }
  );

  if (queueError) throw new Error(queueError.message || "Failed to queue recipients");

  return { campaignId, queuedCount: Number(queuedCount || 0) };
}

export async function pauseCampaign(supabase, campaignId) {
  const { data: campaign, error } = await supabase
    .from("email_campaigns")
    .update({ status: CAMPAIGN_STATUS.PAUSED, paused_at: new Date().toISOString() })
    .eq("id", campaignId)
    .eq("status", CAMPAIGN_STATUS.SENDING)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message || "Failed to pause campaign");
  if (!campaign) throw new Error("Campaign is not sending");

  await supabase.rpc("pause_email_campaign_outbox", { p_campaign_id: campaignId });
  return campaign;
}

export async function resumeCampaign(supabase, campaignId) {
  const { data: started, error } = await supabase.rpc("try_start_email_campaign_sending", {
    p_campaign_id: campaignId,
  });

  if (error) throw new Error(error.message || "Failed to resume campaign");
  if (!started) throw new Error("Campaign cannot resume");

  return getCampaignById(supabase, campaignId);
}

export async function cancelCampaign(supabase, campaignId) {
  const campaign = await getCampaignById(supabase, campaignId);
  if (!campaign) throw new Error("Campaign not found");

  const { data, error } = await supabase
    .from("email_campaigns")
    .update({
      status: CAMPAIGN_STATUS.CANCELLED,
      cancelled_at: new Date().toISOString(),
    })
    .eq("id", campaignId)
    .in("status", [
      CAMPAIGN_STATUS.DRAFT,
      CAMPAIGN_STATUS.PREPARING,
      CAMPAIGN_STATUS.READY,
      CAMPAIGN_STATUS.SENDING,
      CAMPAIGN_STATUS.PAUSED,
    ])
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message || "Failed to cancel campaign");
  if (!data) throw new Error("Campaign cannot be cancelled");

  await supabase.rpc("pause_email_campaign_outbox", { p_campaign_id: campaignId });

  await supabase
    .from(RECIPIENTS_TABLE)
    .update({
      delivery_status: "cancelled",
      cancelled_at: new Date().toISOString(),
    })
    .eq("campaign_id", campaignId)
    .in("delivery_status", ["pending", "queued", "outbox_pending"]);

  return data;
}

export async function processCampaignEnqueueBatch(supabase, { campaignId, batchSize = 50 } = {}) {
  const campaign = await getCampaignById(supabase, campaignId);
  if (!campaign || campaign.status !== CAMPAIGN_STATUS.SENDING) {
    return { processed: 0, skipped: true };
  }

  const { data: recipients, error } = await supabase.rpc(
    "claim_email_campaign_recipient_batch",
    { p_campaign_id: campaignId, p_limit: batchSize }
  );

  if (error) throw new Error(error.message || "Failed to claim campaign recipients");

  const rows = recipients || [];
  let enqueued = 0;
  let excluded = 0;

  for (const recipient of rows) {
    const evaluation = await evaluateEmailRecipient(supabase, {
      userId: recipient.user_id,
      email: recipient.normalized_email,
      category: EMAIL_CATEGORIES.MARKETING,
      messageType: "email_campaign",
    });

    if (!evaluation.eligible) {
      excluded += 1;
      await supabase
        .from(RECIPIENTS_TABLE)
        .update({
          delivery_status: "skipped",
          eligibility_status: "excluded",
          eligibility_reason: evaluation.reason,
          error: evaluation.reason,
        })
        .eq("id", recipient.id);
      continue;
    }

    const idempotencyKey = buildCampaignOutboxIdempotencyKey(campaignId, recipient.id);
    const html = buildCampaignEmailHtml({
      subject: campaign.subject,
      previewText: campaign.preview_text,
      htmlContent: campaign.html_content,
      textContent: campaign.text_content,
      userId: recipient.user_id,
      normalizedEmail: recipient.normalized_email,
      campaignId,
    });
    const text = buildCampaignEmailText({
      subject: campaign.subject,
      textContent: campaign.text_content,
      htmlContent: campaign.html_content,
    });

    try {
      const result = await enqueueEmail({
        idempotencyKey,
        recipientEmail: recipient.normalized_email,
        subject: campaign.subject,
        html,
        text,
        messageType: "email_campaign",
        metadata: {
          emailCategory: EMAIL_CATEGORIES.MARKETING,
          campaign_id: campaignId,
          campaignId,
          campaign_recipient_id: recipient.id,
        },
        maxAttempts: 5,
        priority: CAMPAIGN_OUTBOX_PRIORITY,
      });

      const outboxId = result.record?.id || null;

      await supabase
        .from(RECIPIENTS_TABLE)
        .update({
          delivery_status: "outbox_pending",
          outbox_id: outboxId,
          outbox_queued_at: new Date().toISOString(),
        })
        .eq("id", recipient.id);

      enqueued += 1;
    } catch (enqueueError) {
      await supabase
        .from(RECIPIENTS_TABLE)
        .update({
          delivery_status: "failed",
          failed_at: new Date().toISOString(),
          error: enqueueError.message || "enqueue failed",
        })
        .eq("id", recipient.id);
    }
  }

  await refreshCampaignMetrics(supabase, campaignId);

  const remaining = await supabase
    .from(RECIPIENTS_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .in("delivery_status", ["queued", "outbox_pending"]);

  if ((remaining.count || 0) === 0) {
    const pendingOutbox = await supabase
      .from(RECIPIENTS_TABLE)
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .in("delivery_status", ["outbox_pending", "outbox_processing", "provider_accepted"]);

    if ((pendingOutbox.count || 0) === 0) {
      await supabase
        .from("email_campaigns")
        .update({ status: CAMPAIGN_STATUS.COMPLETED, completed_at: new Date().toISOString() })
        .eq("id", campaignId)
        .eq("status", CAMPAIGN_STATUS.SENDING);
    }
  }

  return { processed: rows.length, enqueued, excluded, skipped: false };
}

export async function refreshCampaignMetrics(supabase, campaignId) {
  const { data: recipients, error } = await supabase
    .from(RECIPIENTS_TABLE)
    .select("delivery_status, eligibility_status")
    .eq("campaign_id", campaignId);

  if (error) throw new Error(error.message || "Failed to load recipients for metrics");

  const rows = recipients || [];
  const counts = {
    eligible_count: rows.filter((r) => r.eligibility_status === "eligible").length,
    queued_count: rows.filter((r) =>
      ["queued", "outbox_pending", "outbox_processing", "provider_accepted"].includes(r.delivery_status)
    ).length,
    provider_accepted_count: rows.filter((r) =>
      ["provider_accepted", "sent", "delivered"].includes(r.delivery_status)
    ).length,
    delivered_count: rows.filter((r) => r.delivery_status === "delivered").length,
    failed_count: rows.filter((r) => r.delivery_status === "failed").length,
    bounced_count: rows.filter((r) => r.delivery_status === "bounced").length,
    complained_count: rows.filter((r) => r.delivery_status === "complained").length,
    unsubscribed_count: rows.filter((r) => r.delivery_status === "skipped" && r.eligibility_reason === "global-unsubscribed").length,
  };

  await supabase.from("email_campaigns").update(counts).eq("id", campaignId);
  return counts;
}

export async function findActiveSendingCampaigns(supabase, { limit = 10 } = {}) {
  const { data, error } = await supabase
    .from("email_campaigns")
    .select("id, name, status")
    .eq("status", CAMPAIGN_STATUS.SENDING)
    .order("started_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message || "Failed to list active campaigns");
  return data || [];
}

export async function runCampaignProcessorCycle(supabase, { batchSize = 50 } = {}) {
  const campaigns = await findActiveSendingCampaigns(supabase);
  let totalProcessed = 0;

  for (const campaign of campaigns) {
    const result = await processCampaignEnqueueBatch(supabase, {
      campaignId: campaign.id,
      batchSize,
    });
    totalProcessed += result.processed || 0;
  }

  return { campaigns: campaigns.length, totalProcessed };
}
