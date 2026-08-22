import { EMAIL_CATEGORIES } from "../email-categories.js";
import { evaluateEmailRecipient, normalizeRecipientEmail } from "../email-recipient-eligibility.js";
import { CAMPAIGN_STATUS } from "./constants.js";
import { resolveAudienceProfiles } from "./audience.js";

const RECIPIENTS_TABLE = "email_campaign_recipients";
const CAMPAIGNS_TABLE = "email_campaigns";

export async function buildCampaignAudienceSnapshot(
  supabase,
  campaign,
  deps = {}
) {
  const evaluateFn = deps.evaluateEmailRecipient || evaluateEmailRecipient;
  const campaignId = campaign.id;

  await supabase.from(RECIPIENTS_TABLE).delete().eq("campaign_id", campaignId);

  const profiles = await resolveAudienceProfiles(supabase, {
    audienceType: campaign.audience_type,
    audienceFilter: campaign.audience_filter || {},
  });

  const seenEmails = new Set();
  const rows = [];
  const stats = {
    initial: profiles.length,
    eligible: 0,
    excluded: 0,
    suppressed: 0,
    unsubscribed: 0,
    invalid: 0,
    duplicatesRemoved: 0,
  };

  for (const profile of profiles) {
    const normalizedEmail = normalizeRecipientEmail(profile.email);

    if (seenEmails.has(normalizedEmail)) {
      stats.duplicatesRemoved += 1;
      continue;
    }
    seenEmails.add(normalizedEmail);

    const evaluation = await evaluateFn(supabase, {
      userId: profile.id,
      email: normalizedEmail,
      category: EMAIL_CATEGORIES.MARKETING,
      messageType: "email_campaign",
    });

    if (!evaluation.eligible) {
      stats.excluded += 1;
      if (evaluation.reason === "suppressed") stats.suppressed += 1;
      if (evaluation.reason === "global-unsubscribed" || evaluation.reason === "marketing-not-opted-in") {
        stats.unsubscribed += 1;
      }
      if (evaluation.reason === "invalid-email-format" || evaluation.reason === "missing-email") {
        stats.invalid += 1;
      }

      rows.push({
        campaign_id: campaignId,
        user_id: profile.id,
        email: profile.email,
        normalized_email: normalizedEmail,
        eligibility_status: "excluded",
        eligibility_reason: evaluation.reason,
        delivery_status: "excluded",
      });
      continue;
    }

    stats.eligible += 1;
    rows.push({
      campaign_id: campaignId,
      user_id: profile.id,
      email: profile.email,
      normalized_email: normalizedEmail,
      eligibility_status: "eligible",
      eligibility_reason: null,
      delivery_status: "pending",
    });
  }

  if (rows.length) {
    const chunkSize = 500;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { error } = await supabase.from(RECIPIENTS_TABLE).insert(chunk);
      if (error) {
        throw new Error(error.message || "Failed to insert campaign recipients");
      }
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from(CAMPAIGNS_TABLE)
    .update({
      status: CAMPAIGN_STATUS.READY,
      audience_snapshot_count: stats.initial,
      eligible_count: stats.eligible,
      suppressed_count: stats.suppressed,
      metadata: {
        ...(campaign.metadata || {}),
        audienceStats: stats,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaignId)
    .select("*")
    .single();

  if (updateError) {
    throw new Error(updateError.message || "Failed to update campaign snapshot stats");
  }

  return { campaign: updated, stats, recipientCount: rows.length };
}
