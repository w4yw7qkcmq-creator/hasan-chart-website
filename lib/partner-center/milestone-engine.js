import { REWARD_SOURCE_TYPES } from "./phase2-constants.js";
import {
  computePartnerMetrics,
  computeMilestoneMetricValue,
  resolveMilestoneMetricWindow,
} from "./partner-metrics.js";
import { createRewardEntitlementAndCredit } from "./reward-engine.js";
import { logPartnerCenterEvent } from "./observability.js";
import { requireGrowthRuntimeOrSkip } from "./growth-runtime-gate.js";
import { isWithinWindow } from "./timezone.js";

export { resolveMilestoneMetricWindow } from "./partner-metrics.js";

export async function evaluateMilestonesForPartner(supabase, partnerId, { tierKey } = {}) {
  const gate = requireGrowthRuntimeOrSkip();
  if (gate) return { evaluated: 0, grants: [], skipped: true, reason: gate.reason };

  const { data: milestones, error } = await supabase
    .from("partner_milestone_definitions")
    .select("*")
    .eq("status", "active");
  if (error) throw error;

  const grants = [];

  for (const milestone of milestones || []) {
    if (milestone.min_tier_key && tierKey && milestone.min_tier_key !== tierKey) continue;
    if (!isWithinWindow(milestone.effective_from, milestone.effective_to)) continue;

    const window = resolveMilestoneMetricWindow(milestone);
    const value = await computeMilestoneMetricValue(supabase, partnerId, milestone.metric, window);
    if (value < Number(milestone.threshold_value)) continue;

    const metrics = await computePartnerMetrics(supabase, partnerId);

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
        metrics_snapshot: {
          ...metrics,
          milestoneMetricValue: value,
          milestoneWindow: window,
        },
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
