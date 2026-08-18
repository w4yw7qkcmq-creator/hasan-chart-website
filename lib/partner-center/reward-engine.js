import { REWARD_ENTITLEMENT_STATUSES } from "./phase2-constants.js";
import { logPartnerCenterEvent, logPartnerCenterFailure } from "./observability.js";
import { requireGrowthRuntimeOrSkip } from "./growth-runtime-gate.js";
import {
  evaluatePartnerRewardEligibility,
  persistPartnerRewardEligibilityState,
  REWARD_TYPES,
} from "./partner-reward-eligibility.js";

export const GROWTH_REWARD_RPC = "create_partner_growth_reward_atomic";

export async function createRewardEntitlement(supabase, {
  partnerId,
  rewardType,
  sourceType,
  sourceId,
  periodKey = "",
  amount,
  currency = "USD",
  ruleVersion = null,
  idempotencyKey,
  metadata = {},
}) {
  if (!partnerId || !sourceId || !idempotencyKey) {
    throw new Error("missing_entitlement_fields");
  }
  if (amount == null || Number(amount) < 0) {
    throw new Error("invalid_server_reward_amount");
  }

  const { data: existing } = await supabase
    .from("partner_reward_entitlements")
    .select("id, status, ledger_entry_id")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existing?.id) {
    return { created: false, duplicate: true, entitlementId: existing.id, status: existing.status };
  }

  const { data, error } = await supabase
    .from("partner_reward_entitlements")
    .insert({
      partner_id: partnerId,
      reward_type: rewardType,
      source_type: sourceType,
      source_id: sourceId,
      period_key: periodKey,
      amount: Number(amount),
      currency,
      status: REWARD_ENTITLEMENT_STATUSES.EARNED,
      rule_version: ruleVersion,
      idempotency_key: idempotencyKey,
      metadata,
    })
    .select("id")
    .single();

  if (error?.code === "23505") {
    const { data: dup } = await supabase
      .from("partner_reward_entitlements")
      .select("id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    return { created: false, duplicate: true, entitlementId: dup?.id };
  }
  if (error) throw error;

  return { created: true, duplicate: false, entitlementId: data.id };
}

export async function creditGrowthRewardAtomic(supabase, entitlementId) {
  const gate = requireGrowthRuntimeOrSkip();
  if (gate) {
    return { credited: false, skipped: true, reason: gate.reason, entitlementId };
  }

  const { data, error } = await supabase.rpc(GROWTH_REWARD_RPC, {
    p_entitlement_id: entitlementId,
  });

  if (error) {
    if (error.code === "23505") {
      return { credited: false, duplicate: true, entitlementId };
    }
    logPartnerCenterFailure("gateway.growth_reward_failed", { entitlementId, error: error.message });
    throw error;
  }

  if (data?.duplicate) {
    return { credited: false, duplicate: true, entitlementId, ledgerEntryId: data.ledger_entry_id };
  }

  logPartnerCenterEvent("gateway.growth_reward_credited", {
    entitlementId,
    amount: data?.amount,
    payoutHold: data?.payout_hold,
  });

  return {
    credited: Boolean(data?.credited),
    duplicate: false,
    entitlementId,
    ledgerEntryId: data?.ledger_entry_id,
    amount: Number(data?.amount || 0),
    payoutHold: Boolean(data?.payout_hold),
    fraudRisk: data?.fraud_risk,
  };
}

export async function createRewardEntitlementAndCredit(supabase, params) {
  const gate = requireGrowthRuntimeOrSkip();
  if (gate) {
    return { created: false, credited: false, skipped: true, reason: gate.reason };
  }

  const eligibility = await evaluatePartnerRewardEligibility(supabase, {
    partnerId: params.partnerId,
    referredUserId: params.referredUserId || params.context?.referredUserId || null,
    referralId: params.referralId || params.context?.referralId || null,
    rewardType: params.rewardType || REWARD_TYPES.MISSION,
    sourceId: params.sourceId,
    amount: params.amount,
    context: params.context || {},
  }).catch(() => null);

  if (eligibility && params.referredUserId) {
    await persistPartnerRewardEligibilityState(supabase, params.referredUserId, eligibility).catch(
      () => null
    );
  }

  if (eligibility && !eligibility.eligible) {
    const entitlement = await createRewardEntitlement(supabase, {
      ...params,
      metadata: {
        ...(params.metadata || {}),
        eligibilityDecision: eligibility.decision,
        eligibilityReasons: eligibility.reasons,
      },
    });
    if (entitlement.entitlementId) {
      await supabase
        .from("partner_reward_entitlements")
        .update({ status: REWARD_ENTITLEMENT_STATUSES.RISK_HOLD, payout_hold: true })
        .eq("id", entitlement.entitlementId);
    }
    return {
      rewarded: false,
      holdRequired: true,
      eligibility,
      ...entitlement,
    };
  }

  const entitlement = await createRewardEntitlement(supabase, params);
  if (entitlement.duplicate && entitlement.entitlementId) {
    const credit = await creditGrowthRewardAtomic(supabase, entitlement.entitlementId);
    return { ...entitlement, ...credit };
  }
  if (!entitlement.created) {
    return { rewarded: false, ...entitlement };
  }
  const credit = await creditGrowthRewardAtomic(supabase, entitlement.entitlementId);
  return { rewarded: credit.credited, entitlementId: entitlement.entitlementId, ...credit };
}
