import {
  FRAUD_DECISIONS,
  FRAUD_RISK_LEVELS,
  FRAUD_SIGNAL_TYPES,
} from "./constants.js";
import { getPartnerVelocitySignupThreshold } from "./qualification-policy.js";
import { logPartnerCenterEvent } from "./observability.js";

function buildAssessment({ signals = [], contextType }) {
  let score = 0;
  const normalizedSignals = [];

  for (const signal of signals) {
    const weight = Number(signal.weight || 0);
    score += weight;
    normalizedSignals.push({
      type: signal.type,
      weight,
      detail: signal.detail || null,
    });
  }

  score = Math.min(100, Math.max(0, score));

  let riskLevel = FRAUD_RISK_LEVELS.LOW;
  let decision = FRAUD_DECISIONS.ALLOW;

  const hasBlock = normalizedSignals.some((signal) => signal.type === FRAUD_SIGNAL_TYPES.SELF_REFERRAL);
  const hasDuplicate = normalizedSignals.some(
    (signal) => signal.type === FRAUD_SIGNAL_TYPES.DUPLICATE_ATTRIBUTION
  );

  if (hasBlock) {
    riskLevel = FRAUD_RISK_LEVELS.BLOCKED;
    decision = FRAUD_DECISIONS.BLOCK;
  } else if (hasDuplicate || score >= 70) {
    riskLevel = FRAUD_RISK_LEVELS.HIGH;
    decision = FRAUD_DECISIONS.REVIEW;
  } else if (score >= 40) {
    riskLevel = FRAUD_RISK_LEVELS.MEDIUM;
    decision = FRAUD_DECISIONS.REVIEW;
  }

  return {
    contextType,
    riskLevel,
    score,
    signals: normalizedSignals,
    decision,
    blocksPayableReward: riskLevel === FRAUD_RISK_LEVELS.BLOCKED || riskLevel === FRAUD_RISK_LEVELS.HIGH,
  };
}

export function assessReferralSignupRisk(input = {}) {
  const signals = [];

  if (input.selfReferral) {
    signals.push({
      type: FRAUD_SIGNAL_TYPES.SELF_REFERRAL,
      weight: 100,
      detail: "partner_user_id_matches_referred_user_id",
    });
  }

  if (input.duplicateAttribution) {
    signals.push({
      type: FRAUD_SIGNAL_TYPES.DUPLICATE_ATTRIBUTION,
      weight: 80,
      detail: "referred_user_already_attributed",
    });
  }

  if (Number(input.recentSignupCount || 0) >= getPartnerVelocitySignupThreshold()) {
    signals.push({
      type: FRAUD_SIGNAL_TYPES.VELOCITY_ANOMALY,
      weight: 35,
      detail: "partner_signup_velocity_high",
    });
  }

  if (Number(input.recentNetworkSignupCount || 0) >= 10) {
    signals.push({
      type: FRAUD_SIGNAL_TYPES.RELATIONSHIP_ANOMALY,
      weight: 25,
      detail: "network_signup_cluster",
    });
  }

  if (input.veryFastSignupToActivity) {
    signals.push({
      type: FRAUD_SIGNAL_TYPES.VELOCITY_ANOMALY,
      weight: 20,
      detail: "very_fast_signup_to_activity",
    });
  }

  return buildAssessment({ signals, contextType: "referral_signup" });
}

export async function persistFraudAssessment(
  supabase,
  {
    partnerId,
    referredUserId = null,
    referralId = null,
    contextType,
    assessment,
    sourceEventId = null,
  }
) {
  const { data, error } = await supabase
    .from("partner_fraud_assessments")
    .insert({
      partner_id: partnerId,
      referred_user_id: referredUserId,
      referral_id: referralId,
      context_type: contextType,
      risk_level: assessment.riskLevel,
      score: assessment.score,
      signals: assessment.signals,
      decision: assessment.decision,
      source_event_id: sourceEventId,
    })
    .select("id, risk_level, decision, score")
    .single();

  if (error) {
    throw error;
  }

  logPartnerCenterEvent("fraud.assessment_recorded", {
    assessmentId: data.id,
    partnerId,
    referralId,
    riskLevel: data.risk_level,
    decision: data.decision,
  });

  return data;
}

export async function evaluateReferralSignupFraud(supabase, input = {}) {
  const assessment = assessReferralSignupRisk(input);
  const row = await persistFraudAssessment(supabase, {
    partnerId: input.partnerId,
    referredUserId: input.referredUserId,
    referralId: input.referralId,
    contextType: "referral_signup",
    assessment,
    sourceEventId: input.sourceEventId,
  });

  return { assessment, row };
}
