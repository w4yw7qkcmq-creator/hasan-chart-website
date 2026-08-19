import {
  MISSION_PROGRESS_STATUSES,
  MISSION_STATUSES,
  MISSION_TYPES,
  PERIOD_TYPES,
  REWARD_SOURCE_TYPES,
} from "./phase2-constants.js";
import { QUALIFICATION_STATES } from "./constants.js";
import { buildPeriodKey, isWithinWindow } from "./timezone.js";
import { computePartnerMetrics } from "./partner-metrics.js";
import { createRewardEntitlementAndCredit } from "./reward-engine.js";
import { logPartnerCenterEvent } from "./observability.js";
import { requireGrowthRuntimeOrSkip } from "./growth-runtime-gate.js";
import { validateMissionRewardAmount } from "./reward-policy.js";
import { canCampaignAcceptProgress } from "./campaign-lifecycle.js";
import { mapEventToMissionTypes } from "./mission-trusted-events.js";
import { blocksAutomaticPayable } from "./fraud-gate.js";
import { ensureCampaignParticipant } from "./campaign-engine.js";

export { mapEventToMissionTypes } from "./mission-trusted-events.js";

export function validateMissionDefinition(def = {}) {
  if (!def.code || !def.name || !def.mission_type || !def.target_metric) {
    return { ok: false, error: "missing_required_fields" };
  }
  if (
    def.mission_type === MISSION_TYPES.STREAK_PERIOD ||
    (def.status === MISSION_STATUSES.ACTIVE && def.mission_type === "streak_period")
  ) {
    return {
      ok: false,
      error: "streak_period_not_enabled",
      code: "MISSION_TYPE_UNSUPPORTED",
      message: "streak_period is schema-reserved and not an active feature in Phase 2",
    };
  }
  if (Number(def.target_value) <= 0) return { ok: false, error: "invalid_target_value" };

  const rewardCheck = validateMissionRewardAmount(def.reward_amount);
  if (!rewardCheck.ok) return { ok: false, error: rewardCheck.error };

  return { ok: true, rewardAmount: rewardCheck.amount };
}

export async function listActiveMissionsForPartner(supabase, partnerId, { tierKey, at = new Date() } = {}) {
  const { data: missions, error } = await supabase
    .from("partner_mission_definitions")
    .select("*")
    .eq("status", MISSION_STATUSES.ACTIVE);
  if (error) throw error;

  const filtered = [];
  for (const m of missions || []) {
    if (!isWithinWindow(m.start_at, m.end_at, at)) continue;
    if (m.min_tier_key && tierKey && m.min_tier_key !== tierKey) continue;

    if (m.campaign_program_id) {
      const { data: campaign } = await supabase
        .from("partner_campaign_programs")
        .select("id, status, start_at, end_at")
        .eq("id", m.campaign_program_id)
        .maybeSingle();
      const check = canCampaignAcceptProgress(campaign, { at });
      if (!check.ok) continue;
    }

    filtered.push(m);
  }
  return filtered;
}

async function countQualifiedReferralsInPeriod(supabase, partnerId, { startAt, endAt } = {}) {
  let q = supabase
    .from("partner_referral_qualifications")
    .select("id", { count: "exact", head: true })
    .eq("partner_id", partnerId)
    .in("state", [QUALIFICATION_STATES.QUALIFIED, QUALIFICATION_STATES.CUSTOMER]);
  if (startAt) q = q.gte("qualified_at", startAt);
  if (endAt) q = q.lte("qualified_at", endAt);
  const { count, error } = await q;
  if (error) throw error;
  return count || 0;
}

async function resolveServiceSalesMetrics(supabase, partnerId, { startAt, endAt, campaignProgramId = null } = {}) {
  let q = supabase
    .from("partner_service_commission_entitlements")
    .select("base_amount, calculated_amount, status, commercial_snapshot")
    .eq("partner_id", partnerId)
    .eq("status", "credited");
  if (startAt) q = q.gte("created_at", startAt);
  if (endAt) q = q.lte("created_at", endAt);
  const { data, error } = await q;
  if (error) throw error;

  let rows = data || [];
  if (campaignProgramId) {
    rows = rows.filter(
      (r) =>
        r.commercial_snapshot?.campaign_program_id === campaignProgramId ||
        r.commercial_snapshot?.campaignProgramId === campaignProgramId
    );
  }

  const count = rows.length;
  const amount = rows.reduce((sum, r) => sum + Number(r.calculated_amount ?? r.base_amount ?? 0), 0);
  return { count, amount };
}

async function countSmartLinkConversions(supabase, partnerId, { startAt, endAt, smartLinkId = null } = {}) {
  let q = supabase
    .from("partner_referral_attributions")
    .select("id", { count: "exact", head: true })
    .eq("partner_id", partnerId)
    .not("smart_link_id", "is", null);
  if (smartLinkId) q = q.eq("smart_link_id", smartLinkId);
  if (startAt) q = q.gte("attributed_at", startAt);
  if (endAt) q = q.lte("attributed_at", endAt);
  const { count, error } = await q;
  if (error) throw error;
  return count || 0;
}

async function resolveMetricValue(supabase, partnerId, missionType, metrics, { mission, periodKey } = {}) {
  const windowStart = mission?.start_at || null;
  const windowEnd = mission?.end_at || null;

  switch (missionType) {
    case MISSION_TYPES.QUALIFIED_REFERRALS_COUNT:
      return metrics.qualifiedReferrals;
    case MISSION_TYPES.QUALIFIED_REFERRALS_IN_PERIOD:
      return await countQualifiedReferralsInPeriod(supabase, partnerId, {
        startAt: windowStart,
        endAt: windowEnd,
      });
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
    case MISSION_TYPES.SERVICE_SALES_COUNT: {
      const sales = await resolveServiceSalesMetrics(supabase, partnerId, {
        startAt: windowStart,
        endAt: windowEnd,
        campaignProgramId: mission?.campaign_program_id,
      });
      return sales.count;
    }
    case MISSION_TYPES.SERVICE_SALES_AMOUNT: {
      const sales = await resolveServiceSalesMetrics(supabase, partnerId, {
        startAt: windowStart,
        endAt: windowEnd,
        campaignProgramId: mission?.campaign_program_id,
      });
      return sales.amount;
    }
    case MISSION_TYPES.SMART_LINK_CONVERSIONS:
      return await countSmartLinkConversions(supabase, partnerId, {
        startAt: windowStart,
        endAt: windowEnd,
      });
    case MISSION_TYPES.CAMPAIGN_CONVERSIONS: {
      if (!mission?.campaign_program_id) return 0;
      const { count } = await supabase
        .from("partner_referral_attributions")
        .select("id", { count: "exact", head: true })
        .eq("partner_id", partnerId)
        .eq("campaign_program_id", mission.campaign_program_id);
      return count || 0;
    }
    default:
      return 0;
  }
}

async function resolveCompletionSequence(supabase, { partnerId, missionId, periodKey, maxCompletions }) {
  if (!maxCompletions || maxCompletions <= 1) return 1;

  const { data: rows, error } = await supabase
    .from("partner_mission_progress")
    .select("completion_sequence, status")
    .eq("partner_id", partnerId)
    .eq("mission_id", missionId)
    .eq("period_key", periodKey)
    .order("completion_sequence", { ascending: false });
  if (error) throw error;

  if (!rows?.length) return 1;

  const latest = rows[0];
  if (latest.status !== MISSION_PROGRESS_STATUSES.COMPLETED) {
    return latest.completion_sequence || 1;
  }

  const next = (latest.completion_sequence || 1) + 1;
  if (next > maxCompletions) return null;
  return next;
}

async function assertMissionFraudClear(supabase, partnerId, mission) {
  const policy = mission.fraud_policy || { blockOnHigh: true, blockOnBlocked: true };
  const { data: assessment } = await supabase
    .from("partner_fraud_assessments")
    .select("risk_level, decision")
    .eq("partner_id", partnerId)
    .is("resolved_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const riskLevel = assessment?.risk_level || "LOW";
  if (policy.blockOnBlocked !== false && String(riskLevel).toUpperCase() === "BLOCKED") {
    return { ok: false, reason: "fraud_blocked" };
  }
  if (policy.blockOnHigh !== false && blocksAutomaticPayable(riskLevel)) {
    return { ok: false, reason: "fraud_high_review_required" };
  }
  return { ok: true, riskLevel };
}

export async function upsertMissionProgress(supabase, {
  partnerId,
  mission,
  currentValue,
  periodKey,
  completionSequence = 1,
  occurredAt = new Date(),
}) {
  if (!isWithinWindow(mission.start_at, mission.end_at, occurredAt)) {
    return { updated: false, reason: "mission_expired_or_not_started" };
  }

  if (mission.campaign_program_id) {
    const enroll = await ensureCampaignParticipant(supabase, {
      campaignProgramId: mission.campaign_program_id,
      partnerId,
      at: occurredAt,
    });
    if (!enroll.enrolled) {
      return { updated: false, reason: enroll.reason || "enrollment_failed" };
    }
    if (!enroll.existing && enroll.participantId) {
      await supabase
        .from("partner_campaign_participants")
        .update({ first_progress_at: occurredAt.toISOString(), updated_at: new Date().toISOString() })
        .eq("id", enroll.participantId)
        .is("first_progress_at", null);
    }
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
        completion_sequence: completionSequence,
        current_value: currentValue,
        target_value: target,
        status,
        completed_at: status === MISSION_PROGRESS_STATUSES.COMPLETED ? occurredAt.toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "partner_id,mission_id,period_key,completion_sequence" }
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

  const fraud = await assertMissionFraudClear(supabase, partnerId, mission);
  if (!fraud.ok) {
    return { rewarded: false, reason: fraud.reason, fraudHold: true };
  }

  const seq = progress.completion_sequence || 1;
  const idempotencyKey = `mission_reward:${partnerId}:${mission.id}:${progress.period_key || "once"}:seq${seq}`;
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
    metadata: {
      missionCode: mission.code,
      missionType: mission.mission_type,
      completionSequence: seq,
      campaignProgramId: mission.campaign_program_id || null,
    },
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

  const mappedTypes = mapEventToMissionTypes(eventType);
  if (!mappedTypes.length) return { evaluated: 0, completions: [] };

  const missions = await listActiveMissionsForPartner(supabase, partnerId, { tierKey, at: occurredAt });
  const relevant = missions.filter((m) => mappedTypes.includes(m.mission_type));
  if (!relevant.length) return { evaluated: 0, completions: [] };

  const metrics = await computePartnerMetrics(supabase, partnerId);
  const completions = [];

  for (const mission of relevant) {
    const periodContext = {
      campaignProgramId: mission.campaign_program_id,
    };
    const periodKey = buildPeriodKey(mission.period_type || PERIOD_TYPES.ONCE, occurredAt, periodContext);
    const maxCompletions = mission.max_completions || 1;
    const completionSequence = await resolveCompletionSequence(supabase, {
      partnerId,
      missionId: mission.id,
      periodKey,
      maxCompletions,
    });
    if (completionSequence == null) continue;

    const currentValue = await resolveMetricValue(supabase, partnerId, mission.mission_type, metrics, {
      mission,
      periodKey,
    });
    const progressResult = await upsertMissionProgress(supabase, {
      partnerId,
      mission,
      currentValue,
      periodKey,
      completionSequence,
      occurredAt,
    });

    if (progressResult.newlyCompleted) {
      const reward = await evaluateMissionCompletionReward(supabase, {
        partnerId,
        progress: progressResult.progress,
        mission,
      });
      completions.push({
        missionId: mission.id,
        progressId: progressResult.progress.id,
        completionSequence,
        reward,
      });
      logPartnerCenterEvent("mission.completed", {
        partnerId,
        missionId: mission.id,
        periodKey,
        completionSequence,
      });
    }
  }

  return { evaluated: relevant.length, completions };
}
