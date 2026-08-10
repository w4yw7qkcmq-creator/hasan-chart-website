import { logPartnerCenterEvent, logPartnerCenterFailure } from "./observability.js";
import { isFinancialRpcAvailable } from "./financial-gateway.js";

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
