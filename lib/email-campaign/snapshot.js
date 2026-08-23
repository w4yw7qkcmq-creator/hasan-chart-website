import { EMAIL_CATEGORIES } from "../email-categories.js";
import { normalizeRecipientEmail } from "../email-recipient-eligibility.js";
import { EXCLUSION_REASONS, formatExclusionReason } from "../email-policy/constants.js";
import {
  evaluateProfilesForCampaignBatch,
  loadMarketingEligibilityContext,
  evaluateRecipientRowEligibility,
} from "./batch-eligibility.js";
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

function applyExcludedRecipientStats(stats, exclusionStats, exclusionReasons, reason) {
  stats.excluded += 1;
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
}

export async function buildCampaignAudienceSnapshot(
  supabase,
  campaign,
  deps = {}
) {
  const campaignId = campaign.id;
  const campaignCategory = campaign.category || EMAIL_CATEGORIES.MARKETING;

  await supabase.from(RECIPIENTS_TABLE).delete().eq("campaign_id", campaignId);

  const profiles = await resolveAudienceProfiles(supabase, {
    audienceType: campaign.audience_type,
    audienceFilter: campaign.audience_filter || {},
  });

  const eligibilityContext =
    deps.eligibilityContext || (await loadMarketingEligibilityContext(supabase));
  const { results: batchResults } = await evaluateProfilesForCampaignBatch(supabase, profiles, {
    category: campaignCategory,
    context: eligibilityContext,
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

  for (const { profile, eligible, reason } of batchResults) {
    const normalizedEmail = normalizeRecipientEmail(profile.email);

    if (seenEmails.has(normalizedEmail)) {
      stats.duplicatesRemoved += 1;
      exclusionStats.duplicate += 1;
      continue;
    }
    seenEmails.add(normalizedEmail);

    if (!eligible) {
      applyExcludedRecipientStats(
        stats,
        exclusionStats,
        exclusionReasons,
        reason || "unknown"
      );

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

/**
 * Batch live eligibility refresh on an existing snapshot (launch safety without full rebuild).
 */
export async function refreshCampaignSnapshotEligibilityLive(supabase, campaignId, campaign) {
  const { data: recipients, error } = await supabase
    .from(RECIPIENTS_TABLE)
    .select("id, user_id, email, normalized_email, eligibility_status, delivery_status")
    .eq("campaign_id", campaignId);

  if (error) {
    throw new Error(error.message || "Failed to load campaign recipients for live refresh");
  }

  const rows = recipients || [];
  if (!rows.length) {
    return { refreshed: 0, newlyExcluded: 0, eligible: 0 };
  }

  const context = await loadMarketingEligibilityContext(supabase);
  const toExclude = [];
  let eligible = 0;

  for (const recipient of rows) {
    const evaluation = evaluateRecipientRowEligibility(recipient, context);
    if (evaluation.eligible) {
      eligible += 1;
      continue;
    }

    if (recipient.eligibility_status === "eligible" || recipient.delivery_status === "pending") {
      toExclude.push({
        id: recipient.id,
        reason: evaluation.reason || "unknown",
      });
    }
  }

  if (toExclude.length) {
    const now = new Date().toISOString();
    for (const item of toExclude) {
      await supabase
        .from(RECIPIENTS_TABLE)
        .update({
          eligibility_status: "excluded",
          eligibility_reason: item.reason,
          delivery_status: "excluded",
          updated_at: now,
        })
        .eq("id", item.id);
    }
  }

  const excluded = rows.length - eligible;
  await supabase
    .from(CAMPAIGNS_TABLE)
    .update({
      eligible_count: eligible,
      suppressed_count: campaign?.metadata?.audienceStats?.suppressed ?? campaign?.suppressed_count ?? 0,
      metadata: {
        ...(campaign?.metadata || {}),
        audienceStats: {
          ...(campaign?.metadata?.audienceStats || {}),
          eligible,
          excluded,
          initial: rows.length,
        },
        liveEligibilityRefreshAt: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaignId);

  return { refreshed: rows.length, newlyExcluded: toExclude.length, eligible };
}
