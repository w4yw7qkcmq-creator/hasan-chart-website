import {
  AUDIENCE_MODES,
  CAMPAIGN_PROGRAM_STATUSES,
  REWARD_MAX,
  TIER_ORDER,
} from "./phase2-constants.js";
import { evaluateCampaignAudience } from "./audience-engine.js";
import { canCampaignAcceptProgress, normalizeStatus } from "./campaign-lifecycle.js";
import { sanitizeLandingPath, sanitizeSourceMedium } from "./smart-link-service.js";
import { isWithinWindow } from "./timezone.js";

export function validateCampaignProgramInput(input = {}) {
  if (!input.code || !input.name) return { ok: false, error: "missing_code_or_name" };
  const landing = sanitizeLandingPath(input.landing_path || input.landingPath || "/");
  if (!landing) return { ok: false, error: "invalid_landing_path" };

  if (input.priority != null && !Number.isInteger(Number(input.priority))) {
    return { ok: false, error: "invalid_priority" };
  }
  if (input.max_participants != null) {
    const max = Number(input.max_participants);
    if (!Number.isInteger(max) || max < 1) {
      return { ok: false, error: "invalid_max_participants" };
    }
  }

  const audience = input.partner_eligibility || input.audience || {};
  const mode = String(audience.mode || AUDIENCE_MODES.ALL_PARTNERS).toLowerCase();
  if (mode === AUDIENCE_MODES.TIERS && Array.isArray(audience.tiers)) {
    const invalid = audience.tiers.some((t) => !TIER_ORDER.includes(String(t).toLowerCase()));
    if (invalid) return { ok: false, error: "invalid_audience_tiers" };
  }

  return {
    ok: true,
    landing_path: landing,
    normalized: {
      name_ar: input.name_ar || null,
      description_ar: input.description_ar || null,
      priority: input.priority != null ? Number(input.priority) : 0,
      max_participants: input.max_participants != null ? Number(input.max_participants) : null,
    },
  };
}

export async function getActiveCampaignProgram(supabase, code, { at = new Date() } = {}) {
  const clean = sanitizeSourceMedium(code, 64);
  if (!clean) return { ok: false, error: "invalid_code" };

  const { data, error } = await supabase
    .from("partner_campaign_programs")
    .select("*")
    .eq("code", clean)
    .in("status", [CAMPAIGN_PROGRAM_STATUSES.ACTIVE, CAMPAIGN_PROGRAM_STATUSES.SCHEDULED])
    .order("rule_version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id || !isWithinWindow(data.start_at, data.end_at, at)) {
    return { ok: false, error: "campaign_inactive" };
  }
  return { ok: true, campaign: data };
}

export async function evaluatePartnerCampaignEligibility(supabase, {
  campaign,
  partnerId,
  tierKey,
  at = new Date(),
} = {}) {
  const progressCheck = canCampaignAcceptProgress(campaign, { at });
  const status = normalizeStatus(campaign?.status);
  const inWindow = isWithinWindow(campaign?.start_at, campaign?.end_at, at);
  const statusEligible = [
    CAMPAIGN_PROGRAM_STATUSES.ACTIVE,
    CAMPAIGN_PROGRAM_STATUSES.SCHEDULED,
  ].includes(status);

  if (!statusEligible || !inWindow) {
    return { eligible: false, reason: progressCheck.reason || "campaign_not_available" };
  }

  const audience = await evaluateCampaignAudience(supabase, {
    campaign,
    partnerId,
    tierKey,
    at,
  });
  if (!audience.eligible) {
    return { eligible: false, reason: audience.reason || "audience_excluded", mode: audience.mode };
  }

  if (campaign.max_participants != null) {
    const { count, error } = await supabase
      .from("partner_campaign_participants")
      .select("id", { count: "exact", head: true })
      .eq("campaign_program_id", campaign.id);
    if (error) throw error;
    if ((count || 0) >= campaign.max_participants) {
      const { data: existing } = await supabase
        .from("partner_campaign_participants")
        .select("id")
        .eq("campaign_program_id", campaign.id)
        .eq("partner_id", partnerId)
        .maybeSingle();
      if (!existing?.id) {
        return { eligible: false, reason: "max_participants_reached" };
      }
    }
  }

  return { eligible: true, mode: audience.mode };
}

/** @deprecated use evaluatePartnerCampaignEligibility */
export async function validatePartnerCampaignEligibility(supabase, args) {
  return evaluatePartnerCampaignEligibility(supabase, args);
}

export async function ensureCampaignParticipant(supabase, { campaignProgramId, partnerId, at = new Date() } = {}) {
  const { data: existing } = await supabase
    .from("partner_campaign_participants")
    .select("id, first_progress_at")
    .eq("campaign_program_id", campaignProgramId)
    .eq("partner_id", partnerId)
    .maybeSingle();

  if (existing?.id) return { enrolled: true, participantId: existing.id, existing: true };

  const { data: campaign } = await supabase
    .from("partner_campaign_programs")
    .select("id, max_participants")
    .eq("id", campaignProgramId)
    .single();

  if (campaign?.max_participants != null) {
    const { count } = await supabase
      .from("partner_campaign_participants")
      .select("id", { count: "exact", head: true })
      .eq("campaign_program_id", campaignProgramId);
    if ((count || 0) >= campaign.max_participants) {
      return { enrolled: false, reason: "max_participants_reached" };
    }
  }

  const { data, error } = await supabase
    .from("partner_campaign_participants")
    .insert({
      campaign_program_id: campaignProgramId,
      partner_id: partnerId,
      enrolled_at: at.toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { enrolled: true, duplicate: true };
    }
    throw error;
  }

  return { enrolled: true, participantId: data.id, existing: false };
}

export async function listEligibleCampaignsForPartner(supabase, { partnerId, tierKey, at = new Date() } = {}) {
  const { data: campaigns, error } = await supabase
    .from("partner_campaign_programs")
    .select("*")
    .in("status", [CAMPAIGN_PROGRAM_STATUSES.ACTIVE, CAMPAIGN_PROGRAM_STATUSES.SCHEDULED])
    .order("priority", { ascending: false })
    .order("start_at", { ascending: true });
  if (error) throw error;

  const eligible = [];
  for (const campaign of campaigns || []) {
    if (!isWithinWindow(campaign.start_at, campaign.end_at, at)) continue;
    const result = await evaluatePartnerCampaignEligibility(supabase, {
      campaign,
      partnerId,
      tierKey,
      at,
    });
    if (result.eligible) {
      eligible.push({ ...campaign, eligibility: result });
    }
  }
  return eligible;
}

export function computeMaximumExposure(campaign, { missionRewardAmount = null, participantCount = null } = {}) {
  const maxParticipants = campaign?.max_participants ?? participantCount ?? null;
  const reward = Number(missionRewardAmount ?? campaign?.default_reward_amount ?? 0);
  const cappedReward = Math.min(Math.max(reward, 0), REWARD_MAX);

  if (maxParticipants == null) {
    return {
      maxParticipants: null,
      rewardPerParticipant: cappedReward,
      maximumExposure: null,
      unbounded: true,
    };
  }

  return {
    maxParticipants,
    rewardPerParticipant: cappedReward,
    maximumExposure: roundExposure(maxParticipants * cappedReward),
    unbounded: false,
  };
}

function roundExposure(value) {
  return Math.round(Number(value) * 100) / 100;
}

export function resolveCampaignCommissionOverride(campaign, basePercent) {
  const meta = campaign?.commission_override_metadata || {};
  if (meta.mode === "fixed_percent" && meta.percent != null) {
    return {
      percent: Number(meta.percent),
      source: "campaign_override",
      ruleVersion: campaign.rule_version,
      campaignCode: campaign.code,
    };
  }
  return { percent: basePercent, source: "base_rule", ruleVersion: null, campaignCode: null };
}
