import { FRAUD_RISK_LEVELS, QUALIFICATION_STATES } from "./constants.js";
import { loadLatestFraudAssessmentForReferral } from "./fraud-gate.js";
import { logPartnerCenterEvent, logPartnerCenterFailure } from "./observability.js";
import {
  evaluateQualificationDecision,
  QUALIFICATION_POLICY_VERSION,
  QUALIFICATION_REASONS,
  TRUSTED_QUALIFICATION_ACTIVITY_EVENT_TYPES,
} from "./qualification-policy.js";
import {
  transitionReferralQualification,
} from "./qualification-engine.js";
import {
  releaseSignupBonusOnQualification,
  creditQualifiedReferralRewardOnQualification,
} from "./qualification-financial-bridge.js";

async function loadAuthUser(supabase, userId) {
  if (!userId || !supabase?.auth?.admin?.getUserById) {
    return null;
  }
  try {
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (error || !data?.user) return null;
    return data.user;
  } catch {
    return null;
  }
}

async function countMeaningfulActivities(supabase, referredUserId) {
  const { count, error } = await supabase
    .from("partner_events")
    .select("id", { count: "exact", head: true })
    .eq("referred_user_id", referredUserId)
    .in("event_type", [...TRUSTED_QUALIFICATION_ACTIVITY_EVENT_TYPES]);

  if (error) {
    throw error;
  }

  return count || 0;
}

async function loadReferralBundle(supabase, referredUserId) {
  const { data: referral, error: referralError } = await supabase
    .from("partner_referrals")
    .select("id, partner_id, referred_user_id, status")
    .eq("referred_user_id", referredUserId)
    .maybeSingle();

  if (referralError) {
    throw referralError;
  }

  if (!referral?.id) {
    return null;
  }

  const [{ data: qualification }, { data: partner }, { data: attribution }] = await Promise.all([
    supabase
      .from("partner_referral_qualifications")
      .select("referral_id, partner_id, state, verified_at, qualified_at, last_evaluated_at")
      .eq("referral_id", referral.id)
      .maybeSingle(),
    supabase
      .from("partners")
      .select("id, user_id, status")
      .eq("id", referral.partner_id)
      .maybeSingle(),
    supabase
      .from("partner_referral_attributions")
      .select("referral_id")
      .eq("referral_id", referral.id)
      .maybeSingle(),
  ]);

  return { referral, qualification, partner, attribution };
}

export async function buildQualificationEvaluationContext(supabase, referredUserId, now = new Date()) {
  const bundle = await loadReferralBundle(supabase, referredUserId);
  if (!bundle) {
    return { found: false, reason: "no_referral" };
  }

  const authUser = await loadAuthUser(supabase, referredUserId);
  const fraud = await loadLatestFraudAssessmentForReferral(supabase, {
    partnerId: bundle.referral.partner_id,
    referralId: bundle.referral.id,
    referredUserId,
  });

  const meaningfulActivityCount = await countMeaningfulActivities(supabase, referredUserId);
  const selfReferral = String(bundle.partner?.user_id || "") === String(referredUserId);
  const duplicateIdentity = false;

  const decision = evaluateQualificationDecision(
    {
      currentState: bundle.qualification?.state || QUALIFICATION_STATES.SIGNUP,
      referredUserId,
      partnerId: bundle.referral.partner_id,
      referralId: bundle.referral.id,
      emailVerified: Boolean(authUser?.email_confirmed_at),
      accountCreatedAt: authUser?.created_at || null,
      partnerActive: bundle.partner?.status === "active",
      attributionValid: Boolean(bundle.attribution?.referral_id || bundle.referral.id),
      selfReferral,
      duplicateIdentity,
      fraudRiskLevel: fraud.riskLevel || FRAUD_RISK_LEVELS.LOW,
      fraudDecision: fraud.decision,
      meaningfulActivityCount,
    },
    now
  );

  return {
    found: true,
    bundle,
    authUser,
    fraud,
    meaningfulActivityCount,
    decision,
  };
}

function resolveTransitionReason(decision, fromState, toState) {
  if (toState === QUALIFICATION_STATES.DISQUALIFIED) {
    return decision.reasons[0] || QUALIFICATION_REASONS.FRAUD_BLOCKED;
  }
  if (toState === QUALIFICATION_STATES.VERIFIED) {
    return QUALIFICATION_REASONS.EMAIL_VERIFIED;
  }
  if (toState === QUALIFICATION_STATES.QUALIFIED) {
    return QUALIFICATION_REASONS.POLICY_QUALIFIED;
  }
  if (toState === QUALIFICATION_STATES.CUSTOMER) {
    return QUALIFICATION_REASONS.SERVICE_CUSTOMER;
  }
  return decision.reasons[0] || "reevaluation";
}

async function applyIntermediateTransition(supabase, ctx, fromState, toState, reason, sourceEventId) {
  if (fromState === toState) {
    return { transitioned: false, reason: "already_in_state", state: fromState };
  }

  return transitionReferralQualification(supabase, {
    referralId: ctx.bundle.referral.id,
    partnerId: ctx.bundle.referral.partner_id,
    toState,
    reason,
    sourceEventId,
  });
}

export async function reevaluateReferralQualificationForUser(
  supabase,
  { referredUserId, trigger = "manual", sourceEventId = null }
) {
  const normalizedUserId = String(referredUserId || "").trim();
  if (!normalizedUserId) {
    return { evaluated: false, reason: "missing_user" };
  }

  const ctx = await buildQualificationEvaluationContext(supabase, normalizedUserId);
  if (!ctx.found) {
    return { evaluated: false, reason: "no_referral" };
  }

  const currentState = ctx.bundle.qualification?.state || QUALIFICATION_STATES.SIGNUP;
  const targetState = ctx.decision.targetState;
  const nowIso = new Date().toISOString();

  await supabase
    .from("partner_referral_qualifications")
    .update({
      last_evaluated_at: nowIso,
      qualification_policy_version: QUALIFICATION_POLICY_VERSION,
      updated_at: nowIso,
    })
    .eq("referral_id", ctx.bundle.referral.id);

  const transitions = [];
  let workingState = currentState;

  const path = [];
  if (
    workingState === QUALIFICATION_STATES.SIGNUP &&
    targetState === QUALIFICATION_STATES.QUALIFIED
  ) {
    path.push(QUALIFICATION_STATES.VERIFIED, QUALIFICATION_STATES.QUALIFIED);
  } else if (
    workingState === QUALIFICATION_STATES.SIGNUP &&
    targetState === QUALIFICATION_STATES.VERIFIED
  ) {
    path.push(QUALIFICATION_STATES.VERIFIED);
  } else if (
    workingState === QUALIFICATION_STATES.VERIFIED &&
    targetState === QUALIFICATION_STATES.QUALIFIED
  ) {
    path.push(QUALIFICATION_STATES.QUALIFIED);
  } else if (targetState === QUALIFICATION_STATES.DISQUALIFIED) {
    path.push(QUALIFICATION_STATES.DISQUALIFIED);
  } else if (targetState !== workingState) {
    path.push(targetState);
  }

  for (const nextState of path) {
    const reason = resolveTransitionReason(ctx.decision, workingState, nextState);
    const result = await applyIntermediateTransition(
      supabase,
      ctx,
      workingState,
      nextState,
      reason,
      sourceEventId
    );
    transitions.push({ fromState: workingState, toState: nextState, ...result });
    if (result.transitioned) {
      workingState = nextState;
      if (nextState === QUALIFICATION_STATES.VERIFIED) {
        await supabase
          .from("partner_referral_qualifications")
          .update({ verified_at: nowIso, updated_at: nowIso })
          .eq("referral_id", ctx.bundle.referral.id);
      }
      if (nextState === QUALIFICATION_STATES.QUALIFIED) {
        await releaseSignupBonusOnQualification(supabase, {
          referralId: ctx.bundle.referral.id,
          partnerId: ctx.bundle.referral.partner_id,
        });
        await creditQualifiedReferralRewardOnQualification(supabase, {
          referralId: ctx.bundle.referral.id,
          partnerId: ctx.bundle.referral.partner_id,
        });
        logPartnerCenterEvent("PARTNER_QUALIFICATION_QUALIFIED", {
          referralId: ctx.bundle.referral.id,
          partnerId: ctx.bundle.referral.partner_id,
          policyVersion: QUALIFICATION_POLICY_VERSION,
          riskLevel: ctx.decision.riskLevel,
          trigger,
        });
      }
      if (nextState === QUALIFICATION_STATES.DISQUALIFIED) {
        logPartnerCenterEvent("PARTNER_QUALIFICATION_BLOCKED", {
          referralId: ctx.bundle.referral.id,
          partnerId: ctx.bundle.referral.partner_id,
          policyVersion: QUALIFICATION_POLICY_VERSION,
          riskLevel: ctx.decision.riskLevel,
          reasonCodes: ctx.decision.reasons,
          trigger,
        });
      }
    }
  }

  if (
    ctx.decision.riskLevel === FRAUD_RISK_LEVELS.HIGH &&
    workingState === QUALIFICATION_STATES.VERIFIED
  ) {
    logPartnerCenterEvent("PARTNER_QUALIFICATION_REVIEW_REQUIRED", {
      referralId: ctx.bundle.referral.id,
      partnerId: ctx.bundle.referral.partner_id,
      policyVersion: QUALIFICATION_POLICY_VERSION,
      trigger,
    });
  }

  if (workingState === QUALIFICATION_STATES.VERIFIED && currentState === QUALIFICATION_STATES.SIGNUP) {
    logPartnerCenterEvent("PARTNER_QUALIFICATION_VERIFIED", {
      referralId: ctx.bundle.referral.id,
      partnerId: ctx.bundle.referral.partner_id,
      policyVersion: QUALIFICATION_POLICY_VERSION,
      trigger,
    });
  }

  return {
    evaluated: true,
    decision: ctx.decision,
    currentState: workingState,
    transitions,
  };
}

export async function markReferralCustomerOnService(
  supabase,
  { partnerId, referralId, referredUserId, reason = "service_customer", sourceEventId = null }
) {
  const evaluation = await reevaluateReferralQualificationForUser(supabase, {
    referredUserId,
    trigger: "service_customer",
    sourceEventId,
  });

  const current = evaluation.currentState;
  if (
    current !== QUALIFICATION_STATES.QUALIFIED &&
    current !== QUALIFICATION_STATES.CUSTOMER
  ) {
    return {
      customer: false,
      reason: "not_qualified",
      evaluation,
    };
  }

  if (current === QUALIFICATION_STATES.CUSTOMER) {
    return { customer: true, already: true, evaluation };
  }

  const result = await transitionReferralQualification(supabase, {
    referralId,
    partnerId,
    toState: QUALIFICATION_STATES.CUSTOMER,
    reason,
    sourceEventId,
  });

  return { customer: Boolean(result.transitioned), result, evaluation };
}

/** Safe async hook for session/login paths. */
export function scheduleReferralQualificationReevaluation(supabase, referredUserId, trigger) {
  if (!referredUserId) return;
  void reevaluateReferralQualificationForUser(supabase, {
    referredUserId,
    trigger: trigger || "session_reevaluation",
  }).catch((error) => {
    logPartnerCenterFailure("qualification.reevaluation_failed", {
      referredUserId,
      reason: error?.message || "unknown",
    });
  });
}
