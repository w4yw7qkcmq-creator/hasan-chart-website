import { recordAdminAction } from "../admin-audit-log.js";
import { EMAIL_CATEGORIES } from "../email-categories.js";
import { evaluateEmailRecipient } from "../email-recipient-eligibility.js";
import { enqueueEmail } from "../email-outbox-shared.js";
import { buildCampaignOutboxIdempotencyKey, CAMPAIGN_OUTBOX_PRIORITY } from "./constants.js";
import { buildCampaignEmailHtml, buildCampaignEmailText } from "./renderer.js";
import { getCampaignById } from "./store.js";

export async function auditCampaignAction(supabase, admin, action, campaignId, details = {}) {
  return recordAdminAction(supabase, {
    adminId: admin?.userId || null,
    adminEmail: admin?.email || null,
    action,
    targetTable: "email_campaigns",
    targetId: campaignId,
    details,
  });
}

export async function sendCampaignTestEmail(
  supabase,
  campaign,
  { recipientEmail, adminId = null } = {}
) {
  const evaluation = await evaluateEmailRecipient(supabase, {
    email: recipientEmail,
    category: EMAIL_CATEGORIES.MARKETING,
    messageType: "email_campaign_test",
  });

  if (!evaluation.eligible) {
    const error = new Error(evaluation.reason || "Recipient not eligible for test send");
    error.code = "CAMPAIGN_TEST_RECIPIENT_INELIGIBLE";
    throw error;
  }

  const idempotencyKey = `campaign-test/${campaign.id}/${adminId || "admin"}/${Date.now()}`;
  const html = buildCampaignEmailHtml({
    subject: campaign.subject,
    previewText: campaign.preview_text,
    htmlContent: campaign.html_content,
    textContent: campaign.text_content,
    isTest: true,
  });
  const text = buildCampaignEmailText({
    subject: campaign.subject,
    textContent: campaign.text_content,
    htmlContent: campaign.html_content,
    isTest: true,
  });

  return enqueueEmail({
    idempotencyKey,
    recipientEmail: evaluation.normalizedEmail,
    subject: `[TEST] ${campaign.subject}`,
    html,
    text,
    messageType: "email_campaign_test",
    metadata: {
      emailCategory: EMAIL_CATEGORIES.MARKETING,
      campaign_id: campaign.id,
      test_send: true,
    },
    priority: CAMPAIGN_OUTBOX_PRIORITY,
  });
}

export async function getCampaignPreviewPayload(supabase, campaignId, { sampleUserId = null } = {}) {
  const campaign = await getCampaignById(supabase, campaignId);
  if (!campaign) return null;

  let sampleUser = { id: sampleUserId, email: "preview@example.com" };
  if (sampleUserId) {
    const { data } = await supabase
      .from("profiles")
      .select("id, email")
      .eq("id", sampleUserId)
      .maybeSingle();
    if (data?.email) sampleUser = data;
  }

  const html = buildCampaignEmailHtml({
    subject: campaign.subject,
    previewText: campaign.preview_text,
    htmlContent: campaign.html_content,
    textContent: campaign.text_content,
    userId: sampleUser.id,
    normalizedEmail: String(sampleUser.email).toLowerCase(),
    campaignId: campaign.id,
  });

  return {
    subject: campaign.subject,
    previewText: campaign.preview_text,
    html,
    text: buildCampaignEmailText({
      subject: campaign.subject,
      textContent: campaign.text_content,
      htmlContent: campaign.html_content,
    }),
  };
}

export function parseJsonBody(requestBody) {
  if (!requestBody || typeof requestBody !== "object" || Array.isArray(requestBody)) {
    throw new Error("Invalid JSON body");
  }
  return requestBody;
}
