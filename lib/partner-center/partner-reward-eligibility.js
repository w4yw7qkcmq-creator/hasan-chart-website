import { resolveEffectiveUserClassification, USER_CLASSIFICATION } from "../user-classification.js";
import {
  HUMAN_VERIFICATION_STATUSES,
  PARTNER_REWARD_ELIGIBILITY_STATUSES,
  resolveHumanVerificationState,
} from "../security/human-verification.js";
import { isPartnerAntiAbuseGateEnabled } from "../security/feature-flags.js";
import { loadLatestFraudAssessmentForReferral } from "./fraud-gate.js";
import { FRAUD_RISK_LEVELS } from "./constants.js";
import { loadUserRiskSignalSummary } from "../security/account-risk-signals.js";
import { evaluateDuplicateIdentityRisk } from "./identity-risk-evaluator.js";

export const REWARD_TYPES = Object.freeze({
  SIGNUP_BONUS: "signup_bonus",
  QRR: "qualified_referral_reward",
  MISSION: "mission_reward",
  CAMPAIGN: "campaign_reward",
  SERVICE_COMMISSION: "service_commission",
});

const CLASSIFICATION_BLOCK = new Set([
  USER_CLASSIFICATION.TEST,
  USER_CLASSIFICATION.E2E,
  USER_CLASSIFICATION.INTERNAL,
]);

const REASON_LABELS_AR = Object.freeze({
  gate_disabled_fail_closed: "بوابة مكافآت الشركاء معطّلة — رفض آمن",
  classification_test_blocked: "حساب اختبار — لا مكافآت مالية",
  classification_e2e_blocked: "حساب E2E — لا مكافآت مالية",
  classification_internal_blocked: "حساب داخلي — لا مكافآت مالية",
  classification_suspected_review: "حساب مشبوه — مراجعة يدوية",
  classification_unknown_pending: "تصنيف غير مؤكد — انتظار",
  human_unverified: "التحقق البشري غير مكتمل",
  email_unverified: "البريد غير مؤكد",
  fraud_high: "مخاطر احتيال عالية",
  fraud_blocked: "محظور بواسطة محرك الاحتيال",
  duplicate_identity: "هوية/جهاز مكرر",
  self_referral_device: "إحالة ذاتية عبر نفس الجهاز",
  shared_network_only: "شبكة مشتركة فقط — مسموح",
  pending_verification: "بانتظار اكتمال التحقق",
});

function reasonAr(code) {
  return REASON_LABELS_AR[code] || code;
}

function classificationDecision(classification) {
  if (CLASSIFICATION_BLOCK.has(classification)) {
    return {
      eligible: false,
      decision: PARTNER_REWARD_ELIGIBILITY_STATUSES.BLOCKED,
      reason: `classification_${classification}_blocked`,
    };
  }
  if (classification === USER_CLASSIFICATION.SUSPECTED) {
    return {
      eligible: false,
      decision: PARTNER_REWARD_ELIGIBILITY_STATUSES.MANUAL_REVIEW,
      reason: "classification_suspected_review",
      holdRequired: true,
    };
  }
  if (classification === USER_CLASSIFICATION.UNKNOWN) {
    return {
      eligible: false,
      decision: PARTNER_REWARD_ELIGIBILITY_STATUSES.MANUAL_REVIEW,
      reason: "classification_unknown_pending",
      holdRequired: true,
    };
  }
  return null;
}

async function resolveEligibilitySubjectUserId(
  supabase,
  { partnerId, referredUserId, rewardType }
) {
  if (referredUserId) return referredUserId;
  const partnerScoped = [REWARD_TYPES.MISSION, REWARD_TYPES.CAMPAIGN];
  if (partnerId && partnerScoped.includes(rewardType)) {
    const { data: partnerRow } = await supabase
      .from("partners")
      .select("user_id")
      .eq("id", partnerId)
      .maybeSingle();
    return partnerRow?.user_id || null;
  }
  return null;
}

export async function evaluatePartnerRewardEligibility(
  supabase,
  {
    partnerId,
    referredUserId,
    referralId = null,
    rewardType = REWARD_TYPES.SIGNUP_BONUS,
    sourceId = null,
    amount = null,
    context = {},
  }
) {
  const reasons = [];
  const reasonsAr = [];
  const subjectUserId = await resolveEligibilitySubjectUserId(supabase, {
    partnerId,
    referredUserId,
    rewardType,
  });

  if (!isPartnerAntiAbuseGateEnabled()) {
    return {
      eligible: false,
      decision: PARTNER_REWARD_ELIGIBILITY_STATUSES.BLOCKED,
      riskLevel: FRAUD_RISK_LEVELS.BLOCKED,
      reasons: ["gate_disabled_fail_closed"],
      reasonsAr: [reasonAr("gate_disabled_fail_closed")],
      holdRequired: true,
      classification: null,
      humanVerified: false,
    };
  }

  const [{ data: profile }, authUserResult, fraud, identityRisk] = await Promise.all([
    subjectUserId
      ? supabase
          .from("profiles")
          .select(
            "id, email, username, role, user_classification, user_classification_source, effective_user_classification, human_verification_status, human_verified_at, partner_reward_eligibility_status, partner_reward_eligibility_at, partner_reward_risk_level"
          )
          .eq("id", subjectUserId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    subjectUserId
      ? supabase.auth.admin.getUserById(subjectUserId).catch(() => ({ data: { user: null } }))
      : Promise.resolve({ data: { user: null } }),
    loadLatestFraudAssessmentForReferral(supabase, { partnerId, referralId, referredUserId }),
    subjectUserId
      ? evaluateDuplicateIdentityRisk(supabase, {
          referredUserId: subjectUserId,
          partnerUserId: context.partnerUserId || null,
          email: context.email || null,
          deviceToken: context.deviceToken || null,
          clientIp: context.clientIp || null,
        })
      : Promise.resolve({ duplicateIdentity: false, selfReferralDevice: false, reasons: [] }),
  ]);

  const authUser = authUserResult?.data?.user || null;
  const effective = resolveEffectiveUserClassification(
    {
      ...profile,
      user_classification:
        profile?.effective_user_classification || profile?.user_classification,
    },
    authUser
  );
  const human = resolveHumanVerificationState({
    humanVerificationStatus: profile?.human_verification_status,
    emailConfirmedAt: authUser?.email_confirmed_at,
    turnstileVerified:
      profile?.human_verification_status === HUMAN_VERIFICATION_STATUSES.TURNSTILE_VERIFIED ||
      profile?.human_verification_status === HUMAN_VERIFICATION_STATUSES.VERIFIED,
  });

  const classGate = classificationDecision(effective.classification);
  if (classGate) {
    reasons.push(classGate.reason);
    reasonsAr.push(reasonAr(classGate.reason));
    return {
      eligible: false,
      decision: classGate.decision,
      riskLevel: FRAUD_RISK_LEVELS.HIGH,
      reasons,
      reasonsAr,
      holdRequired: classGate.holdRequired ?? true,
      classification: effective.classification,
      humanVerified: human.status === HUMAN_VERIFICATION_STATUSES.VERIFIED,
    };
  }

  if (human.status === HUMAN_VERIFICATION_STATUSES.UNVERIFIED) {
    reasons.push("human_unverified");
    reasonsAr.push(reasonAr("human_unverified"));
    return {
      eligible: false,
      decision: PARTNER_REWARD_ELIGIBILITY_STATUSES.PENDING,
      riskLevel: FRAUD_RISK_LEVELS.LOW,
      reasons,
      reasonsAr,
      holdRequired: true,
      classification: effective.classification,
      humanVerified: false,
    };
  }

  const storedHumanStatus = String(profile?.human_verification_status || "").trim();
  if (storedHumanStatus !== HUMAN_VERIFICATION_STATUSES.VERIFIED) {
    reasons.push("human_unverified");
    reasonsAr.push(reasonAr("human_unverified"));
    return {
      eligible: false,
      decision: PARTNER_REWARD_ELIGIBILITY_STATUSES.PENDING,
      riskLevel: FRAUD_RISK_LEVELS.LOW,
      reasons,
      reasonsAr,
      holdRequired: true,
      classification: effective.classification,
      humanVerified: false,
    };
  }

  if (!authUser?.email_confirmed_at) {
    reasons.push("email_unverified");
    reasonsAr.push(reasonAr("email_unverified"));
    return {
      eligible: false,
      decision: PARTNER_REWARD_ELIGIBILITY_STATUSES.PENDING,
      riskLevel: FRAUD_RISK_LEVELS.LOW,
      reasons,
      reasonsAr,
      holdRequired: true,
      classification: effective.classification,
      humanVerified: human.status === HUMAN_VERIFICATION_STATUSES.TURNSTILE_VERIFIED,
    };
  }

  if (identityRisk.selfReferralDevice || identityRisk.duplicateIdentity) {
    for (const r of identityRisk.reasons) {
      reasons.push(r);
      reasonsAr.push(reasonAr(r));
    }
    return {
      eligible: false,
      decision: identityRisk.selfReferralDevice
        ? PARTNER_REWARD_ELIGIBILITY_STATUSES.BLOCKED
        : PARTNER_REWARD_ELIGIBILITY_STATUSES.RISK_HOLD,
      riskLevel: identityRisk.certainty === "confirmed" ? FRAUD_RISK_LEVELS.BLOCKED : FRAUD_RISK_LEVELS.HIGH,
      reasons,
      reasonsAr,
      holdRequired: true,
      classification: effective.classification,
      humanVerified: human.status === HUMAN_VERIFICATION_STATUSES.VERIFIED,
    };
  }

  const fraudRisk = String(fraud.riskLevel || FRAUD_RISK_LEVELS.LOW).toUpperCase();
  if (fraudRisk === FRAUD_RISK_LEVELS.BLOCKED) {
    reasons.push("fraud_blocked");
    reasonsAr.push(reasonAr("fraud_blocked"));
    return {
      eligible: false,
      decision: PARTNER_REWARD_ELIGIBILITY_STATUSES.BLOCKED,
      riskLevel: fraudRisk,
      reasons,
      reasonsAr,
      holdRequired: true,
      classification: effective.classification,
      humanVerified: human.status === HUMAN_VERIFICATION_STATUSES.VERIFIED,
    };
  }

  if (fraudRisk === FRAUD_RISK_LEVELS.HIGH) {
    reasons.push("fraud_high");
    reasonsAr.push(reasonAr("fraud_high"));
    return {
      eligible: false,
      decision: PARTNER_REWARD_ELIGIBILITY_STATUSES.RISK_HOLD,
      riskLevel: fraudRisk,
      reasons,
      reasonsAr,
      holdRequired: true,
      classification: effective.classification,
      humanVerified: human.status === HUMAN_VERIFICATION_STATUSES.VERIFIED,
    };
  }

  if (context.sharedNetworkOnly) {
    reasons.push("shared_network_only");
    reasonsAr.push(reasonAr("shared_network_only"));
  }

  let riskLevel = fraudRisk;
  if (fraudRisk === FRAUD_RISK_LEVELS.MEDIUM) {
    return {
      eligible: false,
      decision: PARTNER_REWARD_ELIGIBILITY_STATUSES.RISK_HOLD,
      riskLevel,
      reasons: [...reasons, "fraud_medium_review"],
      reasonsAr: [...reasonsAr, "مخاطر متوسطة — مراجعة"],
      holdRequired: true,
      classification: effective.classification,
      humanVerified: human.status === HUMAN_VERIFICATION_STATUSES.VERIFIED,
    };
  }

  return {
    eligible: true,
    decision: PARTNER_REWARD_ELIGIBILITY_STATUSES.ELIGIBLE,
    riskLevel,
    reasons,
    reasonsAr,
    holdRequired: false,
    classification: effective.classification,
    humanVerified: human.status === HUMAN_VERIFICATION_STATUSES.VERIFIED,
    rewardType,
    sourceId,
    amount,
  };
}

export async function persistPartnerRewardEligibilityState(supabase, userId, evaluation) {
  if (!userId || !evaluation) return { updated: false };
  const { error } = await supabase
    .from("profiles")
    .update({
      partner_reward_eligibility_status: evaluation.decision,
      partner_reward_eligibility_at: new Date().toISOString(),
      partner_reward_risk_level: evaluation.riskLevel || FRAUD_RISK_LEVELS.LOW,
    })
    .eq("id", userId);
  if (error) throw error;
  return { updated: true };
}

export async function loadAdminUserTrustSnapshot(supabase, userId) {
  const [{ data: profile }, authUserResult, riskSummary] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, email, username, user_classification, effective_user_classification, human_verification_status, human_verified_at, partner_reward_eligibility_status, partner_reward_eligibility_at, partner_reward_risk_level"
      )
      .eq("id", userId)
      .maybeSingle(),
    supabase.auth.admin.getUserById(userId).catch(() => ({ data: { user: null } })),
    loadUserRiskSignalSummary(supabase, userId).catch(() => ({
      signals: [],
      deviceClusterCount: 0,
      networkClusterCount: 0,
    })),
  ]);

  const authUser = authUserResult?.data?.user || null;
  const effective = resolveEffectiveUserClassification(
    {
      ...profile,
      user_classification:
        profile?.effective_user_classification || profile?.user_classification,
    },
    authUser
  );
  const human = resolveHumanVerificationState({
    humanVerificationStatus: profile?.human_verification_status,
    emailConfirmedAt: authUser?.email_confirmed_at,
  });

  return {
    classification: effective.classification,
    classificationLabel: effective.classification,
    storedClassification: profile?.user_classification || null,
    classificationSource: effective.source || profile?.user_classification || null,
    humanVerification: human.status,
    humanVerificationLabel: human.status,
    emailVerified: Boolean(authUser?.email_confirmed_at),
    emailConfirmedAt: authUser?.email_confirmed_at || null,
    humanVerifiedAt: profile?.human_verified_at || null,
    partnerRewardEligibility: profile?.partner_reward_eligibility_status || PARTNER_REWARD_ELIGIBILITY_STATUSES.PENDING,
    riskLevel: profile?.partner_reward_risk_level || FRAUD_RISK_LEVELS.LOW,
    deviceAccountsCount: riskSummary.deviceClusterCount,
    networkAccountsCount: riskSummary.networkClusterCount,
    lastAssessmentAt: profile?.partner_reward_eligibility_at || profile?.human_verified_at || null,
    signals: (riskSummary.signals || []).slice(0, 8).map((s) => ({
      type: s.signal_type,
      occurrences: s.occurrences,
      lastSeenAt: s.last_seen_at,
    })),
  };
}
