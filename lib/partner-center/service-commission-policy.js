import { QUALIFICATION_STATES, FRAUD_RISK_LEVELS } from "./constants.js";
import { loadLatestFraudAssessmentForReferral } from "./fraud-gate.js";
import { logPartnerCenterEvent } from "./observability.js";
import { roundMoney } from "./money.js";
import { TIER_POLICIES } from "./service-commission-constants.js";

export const PAYABLE_QUALIFICATION_STATES = new Set([
  QUALIFICATION_STATES.QUALIFIED,
  QUALIFICATION_STATES.CUSTOMER,
]);

export const SERVICE_COMMISSION_PERCENT_MAX = 50;
export const SERVICE_COMMISSION_FIXED_MAX = 10000;

export function resolveEffectiveCommissionPercent(rule, tierPercent) {
  const tierPolicy = String(rule?.tier_policy || TIER_POLICIES.USE_PARTNER_TIER).toLowerCase();
  if (tierPolicy === TIER_POLICIES.FIXED_SERVICE_RATE) {
    return Number(rule?.commission_percent ?? 0);
  }
  return Number(tierPercent ?? 0);
}

export function buildRuleSnapshot({
  rule,
  tierKey,
  tierPercent,
  baseAmount,
  calculatedAmount,
  commissionPercent,
}) {
  return {
    service_type: rule?.service_type || null,
    rule_id: rule?.id || null,
    rule_version: rule?.rule_version ?? 1,
    tier_policy: rule?.tier_policy || TIER_POLICIES.USE_PARTNER_TIER,
    tier_key: tierKey || null,
    tier_percent: tierPercent != null ? Number(tierPercent) : null,
    calculation_mode: rule?.commission_mode || "percent",
    base_amount: roundMoney(baseAmount),
    commission_percent: Number(commissionPercent ?? 0),
    fixed_amount: rule?.fixed_amount != null ? roundMoney(rule.fixed_amount) : null,
    calculated_amount: roundMoney(calculatedAmount),
    currency: "USD",
    release_policy: rule?.release_policy || null,
  };
}

export async function loadReferralQualificationState(supabase, referralId) {
  const { data, error } = await supabase
    .from("partner_referral_qualifications")
    .select("referral_id, partner_id, state")
    .eq("referral_id", referralId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function assessServiceCommissionEligibility(
  supabase,
  { referralId, partnerId, referredUserId }
) {
  if (!referralId || !partnerId || !referredUserId) {
    return { eligible: false, reason: "missing_fields", gate: "input" };
  }

  const qualification = await loadReferralQualificationState(supabase, referralId);
  if (!qualification?.referral_id) {
    logPartnerCenterEvent("SERVICE_COMMISSION_SKIPPED", {
      referralId,
      partnerId,
      reason: "missing_qualification_row",
    });
    return { eligible: false, reason: "missing_qualification_row", gate: "qualification", pending: true };
  }

  const state = String(qualification.state || "").toLowerCase();
  if (!PAYABLE_QUALIFICATION_STATES.has(state)) {
    logPartnerCenterEvent("SERVICE_COMMISSION_PENDING_QUALIFICATION", {
      referralId,
      partnerId,
      qualificationState: state,
    });
    return {
      eligible: false,
      reason: "not_qualified",
      gate: "qualification",
      pendingQualification: true,
      qualificationState: state,
    };
  }

  const fraud = await loadLatestFraudAssessmentForReferral(supabase, {
    partnerId,
    referralId,
    referredUserId,
  });
  const risk = String(fraud?.riskLevel || FRAUD_RISK_LEVELS.LOW).toUpperCase();

  if (risk === FRAUD_RISK_LEVELS.BLOCKED) {
    logPartnerCenterEvent("SERVICE_COMMISSION_SKIPPED", {
      referralId,
      partnerId,
      reason: "fraud_blocked",
      riskLevel: risk,
    });
    return { eligible: false, reason: "fraud_blocked", gate: "fraud", fraudRisk: risk };
  }

  if (risk === FRAUD_RISK_LEVELS.HIGH) {
    logPartnerCenterEvent("SERVICE_COMMISSION_HELD", {
      referralId,
      partnerId,
      reason: "fraud_high_review",
      riskLevel: risk,
    });
    return {
      eligible: true,
      qualificationState: state,
      fraudRisk: risk,
      payoutHold: true,
    };
  }

  return { eligible: true, qualificationState: state, fraudRisk: risk };
}

export function validateCommissionPercent(raw) {
  if (raw == null || raw === "") {
    return { ok: false, code: "missing_percent" };
  }
  const str = String(raw).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(str)) {
    return { ok: false, code: "invalid_format" };
  }
  const value = Number(str);
  if (!Number.isFinite(value) || value < 0 || value > SERVICE_COMMISSION_PERCENT_MAX) {
    return { ok: false, code: "out_of_range" };
  }
  return { ok: true, value: roundMoney(value) };
}

export function validateFixedAmount(raw) {
  if (raw == null || raw === "") {
    return { ok: false, code: "missing_amount" };
  }
  const str = String(raw).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(str)) {
    return { ok: false, code: "invalid_format" };
  }
  const value = roundMoney(str);
  if (!Number.isFinite(value) || value < 0.01 || value > SERVICE_COMMISSION_FIXED_MAX) {
    return { ok: false, code: "out_of_range" };
  }
  return { ok: true, value };
}
