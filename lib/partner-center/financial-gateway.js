import { logPartnerCenterEvent, logPartnerCenterFailure } from "./observability.js";

export const FINANCIAL_GATEWAY_RPC = Object.freeze({
  CREATE_COMMISSION: "create_partner_commission_atomic",
  CREATE_SIGNUP_BONUS: "create_partner_signup_bonus_atomic",
  RELEASE_COMMISSION: "release_partner_commission_atomic",
  REVERSE_LEDGER_ENTRY: "reverse_partner_ledger_entry_atomic",
  RELEASE_PAYOUT_HOLD: "release_partner_commission_payout_hold",
  CREATE_GROWTH_REWARD: "create_partner_growth_reward_atomic",
  QUALIFIED_REFERRAL_REWARD: "credit_partner_qualified_referral_reward_atomic",
});

function parseRpcResult(data, error) {
  if (error) {
    if (error.code === "23505" || error.message?.includes("duplicate")) {
      return { ok: false, duplicate: true, reason: "duplicate", error };
    }
    throw error;
  }
  return { ok: true, result: data || {} };
}

export async function createPartnerCommissionAtomic(
  supabase,
  {
    partnerId,
    referralId,
    referredUserId,
    serviceType,
    sourceId,
    baseAmount,
    commissionPercent,
    reason,
    initialStatus,
    invitedUsername,
    idempotencyKey,
    sourceType = "service",
  }
) {
  const { data, error } = await supabase.rpc(FINANCIAL_GATEWAY_RPC.CREATE_COMMISSION, {
    p_partner_id: partnerId,
    p_referral_id: referralId,
    p_referred_user_id: referredUserId,
    p_service_type: serviceType,
    p_source_id: String(sourceId),
    p_base_amount: Number(baseAmount || 0),
    p_commission_percent: Number(commissionPercent || 0),
    p_reason: reason || null,
    p_initial_status: initialStatus || "pending_activation",
    p_invited_username: invitedUsername || null,
    p_idempotency_key: idempotencyKey,
    p_source_type: sourceType,
  });

  const parsed = parseRpcResult(data, error);

  if (!parsed.ok) {
    return {
      created: false,
      duplicate: true,
      reason: "duplicate",
      commissionId: parsed.error?.details || null,
    };
  }

  const result = parsed.result;

  if (result.duplicate) {
    return {
      created: false,
      duplicate: true,
      reason: "duplicate",
      commissionId: result.commission_id,
      status: result.status,
    };
  }

  logPartnerCenterEvent("gateway.commission_created", {
    partnerId,
    commissionId: result.commission_id,
    amount: result.amount,
    payoutHold: result.payout_hold,
  });

  return {
    created: Boolean(result.created),
    duplicate: false,
    commissionId: result.commission_id,
    partnerId,
    amount: Number(result.amount || 0),
    status: result.status,
    ledgerEntryId: result.ledger_entry_id,
    eventId: result.event_id,
    payoutHold: Boolean(result.payout_hold),
    fraudRisk: result.fraud_risk || "LOW",
  };
}

export async function createPartnerSignupBonusAtomic(
  supabase,
  { partnerId, referralId, referredUserId, referralCode, invitedUsername }
) {
  const { data, error } = await supabase.rpc(FINANCIAL_GATEWAY_RPC.CREATE_SIGNUP_BONUS, {
    p_partner_id: partnerId,
    p_referral_id: referralId,
    p_referred_user_id: referredUserId,
    p_referral_code: referralCode,
    p_invited_username: invitedUsername,
  });

  const parsed = parseRpcResult(data, error);

  if (!parsed.ok) {
    return { created: false, duplicate: true, reason: "duplicate" };
  }

  const result = parsed.result;

  if (result.duplicate) {
    return {
      created: false,
      duplicate: true,
      commissionId: result.commission_id,
    };
  }

  logPartnerCenterEvent("gateway.signup_bonus_created", {
    partnerId,
    referralId,
    commissionId: result.commission_id,
    amount: result.amount,
    payoutHold: result.payout_hold,
  });

  return {
    created: Boolean(result.created),
    duplicate: false,
    commissionId: result.commission_id,
    amount: Number(result.amount || 0),
    ledgerEntryId: result.ledger_entry_id,
    eventId: result.event_id,
    payoutHold: Boolean(result.payout_hold),
  };
}

export async function releasePartnerCommissionAtomic(supabase, commissionId) {
  const { data, error } = await supabase.rpc(FINANCIAL_GATEWAY_RPC.RELEASE_COMMISSION, {
    p_commission_id: commissionId,
  });

  if (error) {
    if (
      error.message?.includes("payout_hold_active") ||
      error.message?.includes("fraud_blocks_payable")
    ) {
      return {
        released: false,
        blocked: true,
        reason: error.message,
      };
    }
    throw error;
  }

  if (data?.released === false) {
    return {
      released: false,
      blocked: Boolean(data.blocked),
      reason: data.reason || "not_released",
      commission: data,
    };
  }

  logPartnerCenterEvent("gateway.commission_released", {
    commissionId,
    amount: data?.amount,
  });

  return { released: true, ...data };
}

export async function reversePartnerLedgerEntryAtomic(supabase, originalEntryId, reason) {
  const { data, error } = await supabase.rpc(FINANCIAL_GATEWAY_RPC.REVERSE_LEDGER_ENTRY, {
    p_original_entry_id: originalEntryId,
    p_reason: reason || "reversal",
  });

  const parsed = parseRpcResult(data, error);
  if (!parsed.ok) {
    return { reversed: false, duplicate: true };
  }

  return {
    reversed: Boolean(parsed.result.reversed),
    duplicate: Boolean(parsed.result.duplicate),
    reversalId: parsed.result.reversal_id,
  };
}

export async function releasePartnerPayoutHoldAtomic(
  supabase,
  { commissionId, reviewerUserId, note }
) {
  if (!reviewerUserId) {
    const err = new Error("reviewer_user_id_required");
    err.code = "22023";
    throw err;
  }

  const { data: allowed, error: permErr } = await supabase.rpc("iam_has_permission", {
    p_permission: "partners.fraud.review",
    p_user_id: reviewerUserId,
  });
  if (permErr) throw permErr;
  if (!allowed) {
    const err = new Error("permission_denied");
    err.code = "42501";
    throw err;
  }

  const { data, error } = await supabase.rpc(FINANCIAL_GATEWAY_RPC.RELEASE_PAYOUT_HOLD, {
    p_commission_id: commissionId,
    p_reviewer_user_id: reviewerUserId,
    p_note: note || null,
  });

  if (error) {
    throw error;
  }

  return { releasedHold: Boolean(data?.released_hold), commissionId };
}

export function isFinancialRpcAvailable(error) {
  if (!error) return true;
  return !(
    error.code === "42883" ||
    error.code === "PGRST202" ||
    String(error.message || "").includes("Could not find the function")
  );
}

export async function assertFinancialGatewayReady(supabase) {
  const { error } = await supabase.rpc(FINANCIAL_GATEWAY_RPC.CREATE_COMMISSION, {});
  if (error && (error.code === "42883" || error.message?.includes("Could not find"))) {
    throw new Error("PARTNER_FINANCIAL_GATEWAY_NOT_DEPLOYED");
  }
}
