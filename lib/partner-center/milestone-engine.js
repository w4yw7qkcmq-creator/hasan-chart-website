import { REWARD_SOURCE_TYPES } from "./phase2-constants.js";
import { computePartnerMetrics } from "./partner-metrics.js";
import { createRewardEntitlementAndCredit } from "./reward-engine.js";
import { logPartnerCenterEvent } from "./observability.js";

function metricValue(metrics, metric) {
  switch (metric) {
    case "qualified_referrals":
      return metrics.qualifiedReferrals;
    case "customers":
      return metrics.customers;
    case "confirmed_revenue":
      return metrics.confirmedRevenue;
    case "first_customer":
      return metrics.customers >= 1 ? 1 : 0;
    default:
      return 0;
  }
}

export async function evaluateMilestonesForPartner(supabase, partnerId, { tierKey } = {}) {
  const { data: milestones, error } = await supabase
    .from("partner_milestone_definitions")
    .select("*")
    .eq("status", "active");
  if (error) throw error;

  const metrics = await computePartnerMetrics(supabase, partnerId);
  const grants = [];

  for (const milestone of milestones || []) {
    if (milestone.min_tier_key && tierKey && milestone.min_tier_key !== tierKey) continue;

    const value = metricValue(metrics, milestone.metric);
    if (value < Number(milestone.threshold_value)) continue;

    const { data: existing } = await supabase
      .from("partner_milestone_grants")
      .select("id")
      .eq("partner_id", partnerId)
      .eq("milestone_id", milestone.id)
      .maybeSingle();
    if (existing?.id) continue;

    const { data: grant, error: grantErr } = await supabase
      .from("partner_milestone_grants")
      .insert({
        partner_id: partnerId,
        milestone_id: milestone.id,
        milestone_version: milestone.rule_version,
        status: "earned",
        metrics_snapshot: metrics,
      })
      .select("id")
      .single();

    if (grantErr?.code === "23505") continue;
    if (grantErr) throw grantErr;

    const idempotencyKey = `milestone_reward:${partnerId}:${milestone.id}`;
    const reward = await createRewardEntitlementAndCredit(supabase, {
      partnerId,
      rewardType: "milestone_reward",
      sourceType: REWARD_SOURCE_TYPES.MILESTONE,
      sourceId: grant.id,
      amount: Number(milestone.reward_amount),
      currency: milestone.reward_currency || "USD",
      ruleVersion: milestone.rule_version,
      idempotencyKey,
      metadata: { milestoneCode: milestone.code },
    });

    if (reward.entitlementId) {
      await supabase
        .from("partner_milestone_grants")
        .update({ reward_entitlement_id: reward.entitlementId })
        .eq("id", grant.id);
    }

    grants.push({ milestoneId: milestone.id, grantId: grant.id, reward });
    logPartnerCenterEvent("milestone.granted", { partnerId, milestoneId: milestone.id });
  }

  return { evaluated: (milestones || []).length, grants };
}
