import { REWARD_SOURCE_TYPES } from "./phase2-constants.js";
import { buildPeriodKey } from "./timezone.js";
import { isWithinWindow } from "./timezone.js";
import {
  computePerformanceMetricValue,
  resolvePerformanceMetricWindow,
} from "./partner-metrics.js";
import { createRewardEntitlementAndCredit } from "./reward-engine.js";
import { requireGrowthRuntimeOrSkip } from "./growth-runtime-gate.js";

export { resolvePerformanceMetricWindow } from "./partner-metrics.js";

export async function evaluatePerformanceBonusesForPartner(supabase, partnerId, { tierKey, at = new Date() } = {}) {
  const gate = requireGrowthRuntimeOrSkip();
  if (gate) return { evaluated: 0, grants: [], skipped: true, reason: gate.reason };

  const { data: rules, error } = await supabase
    .from("partner_performance_bonus_rules")
    .select("*")
    .eq("status", "active");
  if (error) throw error;

  const grants = [];

  for (const rule of rules || []) {
    if (rule.min_tier_key && tierKey && rule.min_tier_key !== tierKey) continue;
    if (!isWithinWindow(rule.effective_from, rule.effective_to, at)) continue;

    const window = resolvePerformanceMetricWindow(rule, at);
    if (window.empty) continue;

    const metricResult = await computePerformanceMetricValue(
      supabase,
      partnerId,
      rule.metric,
      window
    );

    const sampleSize =
      rule.metric === "conversion_rate"
        ? metricResult.denominator ?? metricResult.sampleSize
        : Math.max(metricResult.sampleSize || 0, metricResult.value || 0);

    if (sampleSize < Number(rule.minimum_sample_size || 1)) continue;
    if (metricResult.value < Number(rule.threshold_value)) continue;

    const periodKey = buildPeriodKey(rule.period_type, at);

    const { data: existing } = await supabase
      .from("partner_performance_bonus_grants")
      .select("id")
      .eq("partner_id", partnerId)
      .eq("rule_id", rule.id)
      .eq("period_key", periodKey)
      .maybeSingle();
    if (existing?.id) continue;

    const { data: grant, error: gErr } = await supabase
      .from("partner_performance_bonus_grants")
      .insert({
        partner_id: partnerId,
        rule_id: rule.id,
        rule_version: rule.rule_version,
        period_key: periodKey,
        achieved_value: metricResult.value,
        status: "earned",
      })
      .select("id")
      .single();
    if (gErr?.code === "23505") continue;
    if (gErr) throw gErr;

    const idempotencyKey = `performance_bonus:${partnerId}:${rule.id}:${periodKey}`;
    const reward = await createRewardEntitlementAndCredit(supabase, {
      partnerId,
      rewardType: "performance_bonus",
      sourceType: REWARD_SOURCE_TYPES.PERFORMANCE_BONUS,
      sourceId: grant.id,
      periodKey,
      amount: Number(rule.reward_amount),
      currency: rule.reward_currency || "USD",
      ruleVersion: rule.rule_version,
      idempotencyKey,
      metadata: {
        ruleCode: rule.code,
        periodKey,
        metricWindow: window,
        metricValue: metricResult.value,
      },
    });

    if (reward.entitlementId) {
      await supabase
        .from("partner_performance_bonus_grants")
        .update({ reward_entitlement_id: reward.entitlementId })
        .eq("id", grant.id);
    }

    grants.push({ ruleId: rule.id, grantId: grant.id, reward });
  }

  return { evaluated: (rules || []).length, grants };
}
