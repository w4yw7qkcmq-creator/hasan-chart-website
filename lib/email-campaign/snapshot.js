import { EMAIL_CATEGORIES } from "../email-categories.js";
import { evaluateEmailRecipient, normalizeRecipientEmail } from "../email-recipient-eligibility.js";
import { EXCLUSION_REASONS, formatExclusionReason } from "../email-policy/constants.js";
import { CAMPAIGN_STATUS } from "./constants.js";
import { buildCampaignSnapshotFingerprint } from "./launch-readiness.js";
import { resolveAudienceProfiles } from "./audience.js";

const RECIPIENTS_TABLE = "email_campaign_recipients";
const CAMPAIGNS_TABLE = "email_campaigns";

function initExclusionStats() {
  return {
    marketingNotOptedIn: 0,
    globalUnsubscribed: 0,
    suppressed: 0,
    hardSuppressed: 0,
    invalid: 0,
    missingEmail: 0,
    duplicate: 0,
    other: 0,
  };
}

function bucketExclusionReason(reason, stats) {
  switch (reason) {
    case EXCLUSION_REASONS.MARKETING_NOT_OPTED_IN:
      stats.marketingNotOptedIn += 1;
      break;
    case EXCLUSION_REASONS.GLOBAL_UNSUBSCRIBED:
      stats.globalUnsubscribed += 1;
      break;
    case EXCLUSION_REASONS.HARD_SUPPRESSED:
    case EXCLUSION_REASONS.SUPPRESSED:
      stats.hardSuppressed += reason === EXCLUSION_REASONS.HARD_SUPPRESSED ? 1 : 0;
      stats.suppressed += 1;
      break;
    case EXCLUSION_REASONS.INVALID_EMAIL_FORMAT:
    case EXCLUSION_REASONS.MISSING_EMAIL:
    case EXCLUSION_REASONS.MISSING_PROFILE_EMAIL:
      stats.invalid += 1;
      break;
    case EXCLUSION_REASONS.MISSING_EMAIL:
      stats.missingEmail += 1;
      break;
    default:
      stats.other += 1;
  }
}

export async function buildCampaignAudienceSnapshot(
  supabase,
  campaign,
  deps = {}
) {
  const evaluateFn = deps.evaluateEmailRecipient || evaluateEmailRecipient;
  const campaignId = campaign.id;
  const campaignCategory = campaign.category || EMAIL_CATEGORIES.MARKETING;

  await supabase.from(RECIPIENTS_TABLE).delete().eq("campaign_id", campaignId);

  const profiles = await resolveAudienceProfiles(supabase, {
    audienceType: campaign.audience_type,
    audienceFilter: campaign.audience_filter || {},
  });

  const seenEmails = new Set();
  const rows = [];
  const exclusionReasons = {};
  const exclusionStats = initExclusionStats();

  const stats = {
    initial: profiles.length,
    eligible: 0,
    excluded: 0,
    suppressed: 0,
    unsubscribed: 0,
    invalid: 0,
    duplicatesRemoved: 0,
    marketingNotOptedIn: 0,
    neverOptedIn: 0,
    exclusionBreakdown: exclusionStats,
    exclusionReasonLabels: {},
  };

  for (const profile of profiles) {
    const normalizedEmail = normalizeRecipientEmail(profile.email);

    if (seenEmails.has(normalizedEmail)) {
      stats.duplicatesRemoved += 1;
      exclusionStats.duplicate += 1;
      continue;
    }
    seenEmails.add(normalizedEmail);

    const evaluation = await evaluateFn(supabase, {
      userId: profile.id,
      email: normalizedEmail,
      category: campaignCategory,
      messageType: "email_campaign",
    });

    if (!evaluation.eligible) {
      stats.excluded += 1;
      const reason = evaluation.reason || "unknown";
      exclusionReasons[reason] = (exclusionReasons[reason] || 0) + 1;
      bucketExclusionReason(reason, exclusionStats);

      if (reason === EXCLUSION_REASONS.HARD_SUPPRESSED || reason === EXCLUSION_REASONS.SUPPRESSED) {
        stats.suppressed += 1;
      }
      if (
        reason === EXCLUSION_REASONS.GLOBAL_UNSUBSCRIBED ||
        reason === EXCLUSION_REASONS.MARKETING_NOT_OPTED_IN
      ) {
        stats.unsubscribed += 1;
      }
      if (reason === EXCLUSION_REASONS.MARKETING_NOT_OPTED_IN) {
        stats.marketingNotOptedIn += 1;
        stats.neverOptedIn += 1;
      }
      if (
        reason === EXCLUSION_REASONS.INVALID_EMAIL_FORMAT ||
        reason === EXCLUSION_REASONS.MISSING_EMAIL
      ) {
        stats.invalid += 1;
      }

      rows.push({
        campaign_id: campaignId,
        user_id: profile.id,
        email: profile.email,
        normalized_email: normalizedEmail,
        eligibility_status: "excluded",
        eligibility_reason: reason,
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

  for (const [reason, count] of Object.entries(exclusionReasons)) {
    stats.exclusionReasonLabels[reason] = {
      label: formatExclusionReason(reason),
      count,
    };
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
        exclusionReasons,
        policyVersion: "E3-2026-08-28",
        snapshotAt: new Date().toISOString(),
        snapshotContentFingerprint: buildCampaignSnapshotFingerprint({
          ...campaign,
          audience_snapshot_count: stats.initial,
          eligible_count: stats.eligible,
        }),
        audienceSnapshotStale: false,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaignId)
    .select("*")
    .single();

  if (updateError) {
    throw new Error(updateError.message || "Failed to update campaign snapshot stats");
  }

  return { campaign: updated, stats, recipientCount: rows.length, exclusionReasons };
}
