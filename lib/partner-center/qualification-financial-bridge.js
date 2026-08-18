import { logPartnerCenterEvent, logPartnerCenterFailure } from "./observability.js";
import { isFinancialRpcAvailable } from "./financial-gateway.js";
import { getActiveQualifiedReferralRewardRule } from "./qualified-referral-reward-policy.js";
import {
  evaluatePartnerRewardEligibility,
  persistPartnerRewardEligibilityState,
  REWARD_TYPES,
} from "./partner-reward-eligibility.js";

export const QUALIFIED_REFERRAL_REWARD_RPC = "credit_partner_qualified_referral_reward_atomic";

/**
 * Release signup bonus balance credit when referral reaches qualified.
 * Uses Financial Gateway RPC only — no direct balance writes from app code.
 */
export async function releaseSignupBonusOnQualification(
  supabase,
  { referralId, partnerId }
) {
  if (!referralId || !partnerId) {
    return { released: false, reason: "missing_fields" };
  }

  const { data: commission, error } = await supabase
    .from("partner_commissions")
    .select("id, payout_hold, payout_hold_reason, status")
    .eq("referral_id", referralId)
    .eq("source_type", "signup_bonus")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!commission?.id) {
    return { released: false, reason: "no_signup_bonus" };
  }

  if (
    !commission.payout_hold ||
    !String(commission.payout_hold_reason || "").includes("pending_qualification")
  ) {
    return { released: false, reason: "hold_not_pending_qualification" };
  }

  const { data: referral } = await supabase
    .from("partner_referrals")
    .select("referred_user_id")
    .eq("id", referralId)
    .maybeSingle();

  const eligibility = await evaluatePartnerRewardEligibility(supabase, {
    partnerId,
    referredUserId: referral?.referred_user_id,
    referralId,
    rewardType: REWARD_TYPES.SIGNUP_BONUS,
    sourceId: commission.id,
  });

  await persistPartnerRewardEligibilityState(supabase, referral?.referred_user_id, eligibility).catch(
    () => null
  );

  if (!eligibility.eligible) {
    return {
      released: false,
      reason: eligibility.decision,
      holdRequired: true,
      eligibility,
    };
  }

  try {
    const { data, error: rpcError } = await supabase.rpc(
      "release_partner_signup_bonus_on_qualification",
      {
        p_referral_id: referralId,
        p_partner_id: partnerId,
      }
    );

    if (rpcError) {
      if (!isFinancialRpcAvailable(rpcError)) {
        return { released: false, reason: "rpc_not_deployed" };
      }
      throw rpcError;
    }

    logPartnerCenterEvent("qualification.signup_bonus_released", {
      referralId,
      partnerId,
      commissionId: commission.id,
      result: data,
    });

    return { released: Boolean(data?.released), ...data };
  } catch (err) {
    logPartnerCenterFailure("qualification.signup_bonus_release_failed", {
      referralId,
      partnerId,
      reason: err?.message || "unknown",
    });
    return { released: false, reason: err?.message || "release_failed" };
  }
}

/**
 * Credit admin-configured qualified referral reward on canonical qualified transition.
 * Amount is resolved server-side from versioned rule — never from caller.
 */
export async function creditQualifiedReferralRewardOnQualification(
  supabase,
  { referralId, partnerId }
) {
  if (!referralId || !partnerId) {
    return { credited: false, reason: "missing_fields" };
  }

  const rule = await getActiveQualifiedReferralRewardRule(supabase);
  if (!rule?.id) {
    logPartnerCenterEvent("QUALIFIED_REFERRAL_REWARD_SKIPPED_DISABLED", {
      referralId,
      partnerId,
      reason: "no_active_rule",
    });
    return { credited: false, skipped: true, reason: "no_active_rule" };
  }

  if (!rule.is_enabled || Number(rule.amount) <= 0) {
    try {
      const { data, error: rpcError } = await supabase.rpc(QUALIFIED_REFERRAL_REWARD_RPC, {
        p_referral_id: referralId,
        p_partner_id: partnerId,
        p_rule_id: rule.id,
      });
      if (rpcError && !isFinancialRpcAvailable(rpcError)) {
        return { credited: false, reason: "rpc_not_deployed" };
      }
      if (rpcError) throw rpcError;
      logPartnerCenterEvent("QUALIFIED_REFERRAL_REWARD_SKIPPED_DISABLED", {
        referralId,
        partnerId,
        ruleVersion: rule.rule_version,
        result: data,
      });
      return { credited: false, skipped: true, reason: "policy_disabled", ...data };
    } catch (err) {
      logPartnerCenterFailure("QUALIFIED_REFERRAL_REWARD_FAILED", {
        referralId,
        partnerId,
        reason: err?.message || "unknown",
      });
      return { credited: false, reason: err?.message || "skip_record_failed" };
    }
  }

  const { data: referral } = await supabase
    .from("partner_referrals")
    .select("referred_user_id")
    .eq("id", referralId)
    .maybeSingle();

  const eligibility = await evaluatePartnerRewardEligibility(supabase, {
    partnerId,
    referredUserId: referral?.referred_user_id,
    referralId,
    rewardType: REWARD_TYPES.QRR,
    amount: rule.amount,
  });

  await persistPartnerRewardEligibilityState(supabase, referral?.referred_user_id, eligibility).catch(
    () => null
  );

  if (!eligibility.eligible) {
    return {
      credited: false,
      reason: eligibility.decision,
      holdRequired: true,
      eligibility,
    };
  }

  try {
    const { data, error: rpcError } = await supabase.rpc(QUALIFIED_REFERRAL_REWARD_RPC, {
      p_referral_id: referralId,
      p_partner_id: partnerId,
      p_rule_id: rule.id,
    });

    if (rpcError) {
      if (!isFinancialRpcAvailable(rpcError)) {
        return { credited: false, reason: "rpc_not_deployed" };
      }
      if (rpcError.code === "23505") {
        logPartnerCenterEvent("QUALIFIED_REFERRAL_REWARD_DUPLICATE", { referralId, partnerId });
        return { credited: false, duplicate: true, reason: "duplicate" };
      }
      throw rpcError;
    }

    if (data?.duplicate) {
      logPartnerCenterEvent("QUALIFIED_REFERRAL_REWARD_DUPLICATE", {
        referralId,
        partnerId,
        status: data?.status,
      });
      return { credited: Boolean(data?.credited), duplicate: true, ...data };
    }

    if (data?.skipped) {
      logPartnerCenterEvent("QUALIFIED_REFERRAL_REWARD_SKIPPED_DISABLED", {
        referralId,
        partnerId,
        ruleVersion: rule.rule_version,
        skipReason: data?.reason,
      });
      return { credited: false, skipped: true, ...data };
    }

    if (data?.credited) {
      logPartnerCenterEvent("QUALIFIED_REFERRAL_REWARD_CREDITED", {
        referralId,
        partnerId,
        amount: data?.amount,
        ruleVersion: data?.rule_version,
        ledgerEntryId: data?.ledger_entry_id,
      });
      return { credited: true, ...data };
    }

    logPartnerCenterEvent("QUALIFIED_REFERRAL_REWARD_ENTITLED", {
      referralId,
      partnerId,
      ruleVersion: rule.rule_version,
      result: data,
    });
    return { credited: false, ...data };
  } catch (err) {
    logPartnerCenterFailure("QUALIFIED_REFERRAL_REWARD_FAILED", {
      referralId,
      partnerId,
      reason: err?.message || "unknown",
    });
    return { credited: false, reason: err?.message || "credit_failed" };
  }
}
