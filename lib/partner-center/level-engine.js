import { LEVEL_CHANGE_REASONS } from "./phase2-constants.js";
import { computePartnerMetrics } from "./partner-metrics.js";
import { logPartnerCenterEvent } from "./observability.js";

/**
 * Level policy: automatic upgrade only; no automatic downgrade in Phase 2.
 * Manual downgrade requires admin override + audit.
 */
export async function evaluatePartnerLevelUpgrade(supabase, partnerId, { actorUserId = null } = {}) {
  const { data: partner, error: pErr } = await supabase
    .from("partners")
    .select("id, tier_key, tier_updated_at, created_at")
    .eq("id", partnerId)
    .single();
  if (pErr) throw pErr;

  const { data: tiers, error: tErr } = await supabase
    .from("partner_tiers")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (tErr) throw tErr;

  const metrics = await computePartnerMetrics(supabase, partnerId);
  const currentIdx = (tiers || []).findIndex((t) => t.tier_key === partner.tier_key);
  let bestTier = tiers[currentIdx] || tiers[0];

  for (const tier of tiers || []) {
    const meetsReferrals = metrics.qualifiedReferrals >= Number(tier.min_qualified_referrals || tier.min_active_referrals || 0);
    const meetsCustomers = metrics.customers >= Number(tier.min_customers || 0);
    const meetsRevenue = metrics.confirmedRevenue >= Number(tier.min_confirmed_revenue || tier.min_total_sales || 0);
    if (meetsReferrals && meetsCustomers && meetsRevenue && tier.sort_order > (bestTier?.sort_order || 0)) {
      bestTier = tier;
    }
  }

  if (!bestTier || bestTier.tier_key === partner.tier_key) {
    return { upgraded: false, tierKey: partner.tier_key };
  }

  const { error: updErr } = await supabase
    .from("partners")
    .update({ tier_key: bestTier.tier_key, tier_updated_at: new Date().toISOString() })
    .eq("id", partnerId);
  if (updErr) throw updErr;

  await supabase.from("partner_level_history").insert({
    partner_id: partnerId,
    from_tier_key: partner.tier_key,
    to_tier_key: bestTier.tier_key,
    change_reason: actorUserId ? LEVEL_CHANGE_REASONS.ADMIN_OVERRIDE : LEVEL_CHANGE_REASONS.AUTO_UPGRADE,
    metrics_snapshot: metrics,
    rule_version: bestTier.rule_version,
    changed_by: actorUserId,
  });

  logPartnerCenterEvent("level.upgraded", { partnerId, from: partner.tier_key, to: bestTier.tier_key });
  return { upgraded: true, from: partner.tier_key, to: bestTier.tier_key, tier: bestTier };
}

export async function adminOverridePartnerLevel(supabase, {
  partnerId,
  toTierKey,
  actorUserId,
  reason,
}) {
  const { data: partner } = await supabase.from("partners").select("tier_key").eq("id", partnerId).single();
  const { error } = await supabase
    .from("partners")
    .update({ tier_key: toTierKey, tier_updated_at: new Date().toISOString() })
    .eq("id", partnerId);
  if (error) throw error;

  await supabase.from("partner_level_history").insert({
    partner_id: partnerId,
    from_tier_key: partner?.tier_key,
    to_tier_key: toTierKey,
    change_reason: LEVEL_CHANGE_REASONS.ADMIN_OVERRIDE,
    changed_by: actorUserId,
    metrics_snapshot: { reason },
  });

  return { ok: true, from: partner?.tier_key, to: toTierKey };
}
