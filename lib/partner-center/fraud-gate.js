import { FRAUD_DECISIONS, FRAUD_RISK_LEVELS } from "./constants.js";

export function evaluatePayoutEligibility({ riskLevel, decision, payoutHold = false }) {
  const normalizedRisk = String(riskLevel || FRAUD_RISK_LEVELS.LOW).toUpperCase();
  const normalizedDecision = String(decision || FRAUD_DECISIONS.ALLOW).toLowerCase();

  if (payoutHold) {
    return {
      eligible: false,
      blocked: true,
      reason: "payout_hold_active",
      riskLevel: normalizedRisk,
    };
  }

  if (normalizedRisk === FRAUD_RISK_LEVELS.BLOCKED || normalizedDecision === FRAUD_DECISIONS.BLOCK) {
    return {
      eligible: false,
      blocked: true,
      reason: "fraud_blocked",
      riskLevel: normalizedRisk,
    };
  }

  if (normalizedRisk === FRAUD_RISK_LEVELS.HIGH) {
    return {
      eligible: false,
      blocked: true,
      reason: "fraud_high_review_required",
      riskLevel: normalizedRisk,
    };
  }

  if (normalizedRisk === FRAUD_RISK_LEVELS.MEDIUM) {
    return {
      eligible: true,
      blocked: false,
      reason: "fraud_medium_allow_pending",
      riskLevel: normalizedRisk,
      requiresReview: true,
    };
  }

  return {
    eligible: true,
    blocked: false,
    reason: "fraud_low_allow",
    riskLevel: normalizedRisk,
  };
}

export async function loadLatestFraudAssessmentForReferral(
  supabase,
  { partnerId, referralId, referredUserId }
) {
  let query = supabase
    .from("partner_fraud_assessments")
    .select("id, risk_level, decision, score, created_at")
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (referralId) {
    query = query.eq("referral_id", referralId);
  } else if (referredUserId) {
    query = query.eq("referred_user_id", referredUserId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw error;
  }

  if (!data?.id) {
    return {
      riskLevel: FRAUD_RISK_LEVELS.LOW,
      decision: FRAUD_DECISIONS.ALLOW,
      assessmentId: null,
    };
  }

  return {
    riskLevel: data.risk_level,
    decision: data.decision,
    assessmentId: data.id,
    score: data.score,
  };
}

export async function assertCommissionPayable(supabase, commission) {
  if (commission?.payout_hold) {
    const err = new Error("PAYOUT_HOLD_ACTIVE");
    err.code = "PAYOUT_HOLD";
    err.details = {
      reason: commission.payout_hold_reason,
      riskLevel: commission.payout_hold_risk_level,
    };
    throw err;
  }

  const fraud = await loadLatestFraudAssessmentForReferral(supabase, {
    partnerId: commission.partner_id,
    referralId: commission.referral_id,
    referredUserId: commission.user_id,
  });

  const eligibility = evaluatePayoutEligibility({
    riskLevel: fraud.riskLevel,
    decision: fraud.decision,
    payoutHold: commission.payout_hold,
  });

  if (!eligibility.eligible) {
    const err = new Error(eligibility.reason);
    err.code = "FRAUD_GATE";
    err.details = eligibility;
    throw err;
  }

  return eligibility;
}

export function blocksAutomaticPayable(riskLevel) {
  return [FRAUD_RISK_LEVELS.HIGH, FRAUD_RISK_LEVELS.BLOCKED].includes(
    String(riskLevel || "").toUpperCase()
  );
}
