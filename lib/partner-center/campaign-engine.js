import { CAMPAIGN_PROGRAM_STATUSES } from "./phase2-constants.js";
import { sanitizeLandingPath, sanitizeSourceMedium } from "./smart-link-service.js";
import { isWithinWindow } from "./timezone.js";

export function validateCampaignProgramInput(input = {}) {
  if (!input.code || !input.name) return { ok: false, error: "missing_code_or_name" };
  const landing = sanitizeLandingPath(input.landing_path || input.landingPath || "/");
  if (!landing) return { ok: false, error: "invalid_landing_path" };
  return { ok: true, landing_path: landing };
}

export async function getActiveCampaignProgram(supabase, code, { at = new Date() } = {}) {
  const clean = sanitizeSourceMedium(code, 64);
  if (!clean) return { ok: false, error: "invalid_code" };

  const { data, error } = await supabase
    .from("partner_campaign_programs")
    .select("*")
    .eq("code", clean)
    .eq("status", CAMPAIGN_PROGRAM_STATUSES.ACTIVE)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id || !isWithinWindow(data.start_at, data.end_at, at)) {
    return { ok: false, error: "campaign_inactive" };
  }
  return { ok: true, campaign: data };
}

export async function validatePartnerCampaignEligibility(supabase, {
  campaign,
  partnerId,
  tierKey,
}) {
  const eligibility = campaign.partner_eligibility || { mode: "all" };
  if (eligibility.mode === "all") return { eligible: true };

  if (eligibility.mode === "tier_min" && campaign.min_tier_key) {
    return { eligible: tierKey === campaign.min_tier_key, reason: "tier_restricted" };
  }

  if (eligibility.mode === "selected_partners" && Array.isArray(eligibility.partner_ids)) {
    return { eligible: eligibility.partner_ids.includes(partnerId), reason: "not_selected" };
  }

  return { eligible: true };
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
