import {
  MISSION_PROGRESS_STATUSES,
  MISSION_STATUSES,
  MISSION_TYPES,
  REWARD_SOURCE_TYPES,
} from "./phase2-constants.js";
import { buildPeriodKey, isWithinWindow } from "./timezone.js";
import { computePartnerMetrics } from "./partner-metrics.js";
import { createRewardEntitlementAndCredit } from "./reward-engine.js";
import { logPartnerCenterEvent } from "./observability.js";
import { requireGrowthRuntimeOrSkip } from "./growth-runtime-gate.js";

const EVENT_MISSION_MAP = Object.freeze({
  qualified_referral: [MISSION_TYPES.QUALIFIED_REFERRALS_COUNT],
  customer: [MISSION_TYPES.CUSTOMERS_COUNT, MISSION_TYPES.FIRST_CUSTOMER],
  revenue_confirmed: [MISSION_TYPES.REVENUE_AMOUNT],
  subscription_activated: [MISSION_TYPES.SUBSCRIPTIONS_COUNT],
});

export function validateMissionDefinition(def = {}) {
  if (!def.code || !def.name || !def.mission_type || !def.target_metric) {
    return { ok: false, error: "missing_required_fields" };
  }
  if (def.mission_type === MISSION_TYPES.STREAK_PERIOD || def.status === MISSION_STATUSES.ACTIVE && def.mission_type === "streak_period") {
    return {
      ok: false,
      error: "streak_period_not_enabled",
      code: "MISSION_TYPE_UNSUPPORTED",
      message: "streak_period is schema-reserved and not an active feature in Phase 2",
    };
  }
  if (Number(def.target_value) <= 0) return { ok: false, error: "invalid_target_value" };
  if (Number(def.reward_amount) < 0) return { ok: false, error: "invalid_reward_amount" };
  return { ok: true };
}

export async function listActiveMissionsForPartner(supabase, partnerId, { tierKey, at = new Date() } = {}) {
  const { data: missions, error } = await supabase
    .from("partner_mission_definitions")
    .select("*")
    .eq("status", MISSION_STATUSES.ACTIVE);
  if (error) throw error;

  return (missions || []).filter((m) => {
    if (!isWithinWindow(m.start_at, m.end_at, at)) return false;
    if (m.min_tier_key && tierKey && m.min_tier_key !== tierKey) return false;
    return true;
  });
}

async function resolveMetricValue(supabase, partnerId, missionType, metrics) {
  switch (missionType) {
    case MISSION_TYPES.QUALIFIED_REFERRALS_COUNT:
      return metrics.qualifiedReferrals;
    case MISSION_TYPES.CUSTOMERS_COUNT:
      return metrics.customers;
    case MISSION_TYPES.FIRST_CUSTOMER:
      return metrics.customers >= 1 ? 1 : 0;
    case MISSION_TYPES.REVENUE_AMOUNT:
      return metrics.confirmedRevenue;
    case MISSION_TYPES.SUBSCRIPTIONS_COUNT:
      return metrics.customers;
    case MISSION_TYPES.CONVERSION_RATE:
      return metrics.conversionRate;
    default:
      return 0;
  }
}

export async function upsertMissionProgress(supabase, {
  partnerId,
  mission,
  currentValue,
  periodKey,
  occurredAt = new Date(),
}) {
  if (!isWithinWindow(mission.start_at, mission.end_at, occurredAt)) {
    return { updated: false, reason: "mission_expired_or_not_started" };
  }

  const target = Number(mission.target_value);
  const status =
    currentValue >= target
      ? MISSION_PROGRESS_STATUSES.COMPLETED
      : MISSION_PROGRESS_STATUSES.IN_PROGRESS;

  const { data, error } = await supabase
    .from("partner_mission_progress")
    .upsert(
      {
        partner_id: partnerId,
        mission_id: mission.id,
        mission_version: mission.rule_version,
        period_key: periodKey,
        current_value: currentValue,
        target_value: target,
        status,
        completed_at: status === MISSION_PROGRESS_STATUSES.COMPLETED ? occurredAt.toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "partner_id,mission_id,period_key" }
    )
    .select("*")
    .single();
  if (error) throw error;

  return { updated: true, progress: data, newlyCompleted: status === MISSION_PROGRESS_STATUSES.COMPLETED };
}

export async function evaluateMissionCompletionReward(supabase, { partnerId, progress, mission }) {
  if (progress.status !== MISSION_PROGRESS_STATUSES.COMPLETED) {
    return { rewarded: false, reason: "not_completed" };
  }
  if (progress.reward_entitlement_id) {
    return { rewarded: false, duplicate: true, entitlementId: progress.reward_entitlement_id };
  }

  const idempotencyKey = `mission_reward:${partnerId}:${mission.id}:${progress.period_key || "once"}`;
  const reward = await createRewardEntitlementAndCredit(supabase, {
    partnerId,
    rewardType: "mission_reward",
    sourceType: REWARD_SOURCE_TYPES.MISSION,
    sourceId: progress.id,
    periodKey: progress.period_key || "",
    amount: Number(mission.reward_amount),
    currency: mission.reward_currency || "USD",
    ruleVersion: mission.rule_version,
    idempotencyKey,
    metadata: { missionCode: mission.code, missionType: mission.mission_type },
  });

  if (reward.entitlementId) {
    await supabase
      .from("partner_mission_progress")
      .update({ reward_entitlement_id: reward.entitlementId })
      .eq("id", progress.id);
  }

  return reward;
}

export async function evaluateMissionsForPartnerEvent(supabase, {
  partnerId,
  eventType,
  tierKey,
  occurredAt = new Date(),
}) {
  const gate = requireGrowthRuntimeOrSkip();
  if (gate) return { evaluated: 0, completions: [], skipped: true, reason: gate.reason };

  const mappedTypes = EVENT_MISSION_MAP[eventType] || [];
  if (!mappedTypes.length) return { evaluated: 0, completions: [] };

  const missions = await listActiveMissionsForPartner(supabase, partnerId, { tierKey, at: occurredAt });
  const relevant = missions.filter((m) => mappedTypes.includes(m.mission_type));
  if (!relevant.length) return { evaluated: 0, completions: [] };

  const metrics = await computePartnerMetrics(supabase, partnerId);
  const completions = [];

  for (const mission of relevant) {
    const periodKey = buildPeriodKey(mission.period_type || "once", occurredAt);
    const currentValue = await resolveMetricValue(supabase, partnerId, mission.mission_type, metrics);
    const progressResult = await upsertMissionProgress(supabase, {
      partnerId,
      mission,
      currentValue,
      periodKey,
      occurredAt,
    });

    if (progressResult.newlyCompleted) {
      const reward = await evaluateMissionCompletionReward(supabase, {
        partnerId,
        progress: progressResult.progress,
        mission,
      });
      completions.push({ missionId: mission.id, progressId: progressResult.progress.id, reward });
      logPartnerCenterEvent("mission.completed", { partnerId, missionId: mission.id, periodKey });
    }
  }

  return { evaluated: relevant.length, completions };
}
