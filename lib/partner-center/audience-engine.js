import { AUDIENCE_MODES, TIER_ORDER } from "./phase2-constants.js";
import { PARTNER_EVENT_TYPES } from "./constants.js";

const ACTIVE_EVENT_TYPES = [
  PARTNER_EVENT_TYPES.QUALIFIED_REFERRAL,
  "customer",
  PARTNER_EVENT_TYPES.SUBSCRIPTION_ACTIVATED,
  "service_conversion",
];

function normalizeAudienceConfig(campaign) {
  const raw = campaign?.partner_eligibility || campaign?.audience || {};
  const mode = String(raw.mode || AUDIENCE_MODES.ALL_PARTNERS).toLowerCase();
  return {
    mode,
    tiers: Array.isArray(raw.tiers) ? raw.tiers.map(String) : [],
    partnerIds: Array.isArray(raw.partner_ids)
      ? raw.partner_ids
      : Array.isArray(raw.partnerIds)
        ? raw.partnerIds
        : [],
    lookbackDays: Number(raw.lookback_days ?? raw.lookbackDays ?? 30),
    newPartnerWindowDays: Number(raw.new_partner_window_days ?? raw.newPartnerWindowDays ?? 30),
  };
}

export function tierMeetsMinimum(partnerTier, requiredTiers) {
  if (!requiredTiers?.length) return true;
  const partnerIdx = TIER_ORDER.indexOf(String(partnerTier || "partner").toLowerCase());
  return requiredTiers.some((t) => {
    const reqIdx = TIER_ORDER.indexOf(String(t).toLowerCase());
    return reqIdx >= 0 && partnerIdx >= reqIdx;
  });
}

export function tierInExactSet(partnerTier, allowedTiers) {
  if (!allowedTiers?.length) return false;
  return allowedTiers.map((t) => String(t).toLowerCase()).includes(String(partnerTier || "").toLowerCase());
}

export async function evaluateCampaignAudience(supabase, {
  campaign,
  partnerId,
  partnerCreatedAt = null,
  tierKey = null,
  at = new Date(),
} = {}) {
  const config = normalizeAudienceConfig(campaign);
  const mode = config.mode;

  if (mode === AUDIENCE_MODES.ALL_PARTNERS || mode === "all") {
    return { eligible: true, mode };
  }

  if (mode === AUDIENCE_MODES.SELECTED_PARTNERS || mode === "selected_partners") {
    const eligible = config.partnerIds.includes(partnerId);
    return { eligible, mode, reason: eligible ? null : "not_selected" };
  }

  if (mode === AUDIENCE_MODES.TIERS || mode === "tiers" || mode === "tier_min") {
    let partnerTier = tierKey;
    if (!partnerTier && partnerId) {
      const { data } = await supabase.from("partners").select("tier_key").eq("id", partnerId).maybeSingle();
      partnerTier = data?.tier_key || "partner";
    }
    const tiers = config.tiers.length ? config.tiers : campaign.min_tier_key ? [campaign.min_tier_key] : [];
    const exact = mode === AUDIENCE_MODES.TIERS || mode === "tiers";
    const eligible = exact
      ? tierInExactSet(partnerTier, tiers)
      : tierMeetsMinimum(partnerTier, tiers);
    return { eligible, mode, reason: eligible ? null : "tier_restricted" };
  }

  if (mode === AUDIENCE_MODES.NEW_PARTNERS || mode === "new_partners") {
    let createdAt = partnerCreatedAt;
    if (!createdAt && partnerId) {
      const { data } = await supabase.from("partners").select("created_at").eq("id", partnerId).maybeSingle();
      createdAt = data?.created_at;
    }
    if (!createdAt) return { eligible: false, mode, reason: "partner_not_found" };
    const windowMs = config.newPartnerWindowDays * 86400000;
    const eligible = at.getTime() - new Date(createdAt).getTime() <= windowMs;
    return { eligible, mode, reason: eligible ? null : "not_new_partner" };
  }

  if (mode === AUDIENCE_MODES.ACTIVE_PARTNERS || mode === "active_partners") {
    const lookbackStart = new Date(at.getTime() - config.lookbackDays * 86400000).toISOString();
    const { count, error } = await supabase
      .from("partner_events")
      .select("id", { count: "exact", head: true })
      .eq("partner_id", partnerId)
      .in("event_type", ACTIVE_EVENT_TYPES)
      .gte("occurred_at", lookbackStart);
    if (error) throw error;
    const eligible = (count || 0) > 0;
    return { eligible, mode, reason: eligible ? null : "not_active_partner" };
  }

  return { eligible: true, mode: "unknown_fallback" };
}
