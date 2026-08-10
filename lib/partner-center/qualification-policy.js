import {
  FRAUD_DECISIONS,
  FRAUD_RISK_LEVELS,
  QUALIFICATION_STATES,
} from "./constants.js";

/** Bump when policy rules change materially. */
export const QUALIFICATION_POLICY_VERSION = 1;

export const QUALIFICATION_REASONS = Object.freeze({
  SIGNUP_ATTRIBUTED: "signup_attributed",
  EMAIL_VERIFIED: "email_verified",
  MEANINGFUL_ACTIVITY: "meaningful_activity_completed",
  POLICY_QUALIFIED: "qualification_policy_passed",
  SERVICE_CUSTOMER: "service_customer",
  SELF_REFERRAL: "self_referral",
  DUPLICATE_IDENTITY: "duplicate_identity",
  FRAUD_HIGH_BLOCKED: "fraud_high_blocked",
  FRAUD_BLOCKED: "fraud_blocked",
  MINIMUM_AGE_NOT_MET: "minimum_age_not_met",
  MEANINGFUL_ACTIVITY_MISSING: "meaningful_activity_missing",
  EMAIL_NOT_VERIFIED: "email_not_verified",
  PARTNER_INACTIVE: "partner_inactive",
  ATTRIBUTION_INVALID: "attribution_invalid",
  REVIEW_REQUIRED: "review_required",
});

/** Server-recorded partner_events used as trusted meaningful activity. */
export const TRUSTED_QUALIFICATION_ACTIVITY_EVENT_TYPES = Object.freeze([
  "qualification_activity_price_alert",
  "qualification_activity_instant_analysis",
  "qualification_activity_analysis_request",
  "qualification_activity_service_activated",
]);

export function getQualificationMinAgeMinutes() {
  const raw = Number(process.env.PARTNER_QUALIFICATION_MIN_AGE_MINUTES ?? 15);
  if (!Number.isFinite(raw) || raw < 0) return 15;
  return raw;
}

export function getQualificationMinActivityCount() {
  const raw = Number(process.env.PARTNER_QUALIFICATION_MIN_ACTIVITY_COUNT ?? 1);
  if (!Number.isFinite(raw) || raw < 1) return 1;
  return Math.floor(raw);
}

export function getPartnerVelocitySignupThreshold() {
  const raw = Number(process.env.PARTNER_VELOCITY_SIGNUPS_PER_HOUR ?? 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 10;
}

function normalizeRisk(riskLevel) {
  return String(riskLevel || FRAUD_RISK_LEVELS.LOW).toUpperCase();
}

function accountAgeMinutes(accountCreatedAt, now = new Date()) {
  if (!accountCreatedAt) return 0;
  const created = new Date(accountCreatedAt);
  if (Number.isNaN(created.getTime())) return 0;
  return Math.max(0, (now.getTime() - created.getTime()) / 60000);
}

/**
 * @param {object} ctx
 * @returns {import('./qualification-policy.js').QualificationDecision}
 */
export function evaluateQualificationDecision(ctx = {}, now = new Date()) {
  const currentState = String(ctx.currentState || QUALIFICATION_STATES.SIGNUP);
  const riskLevel = normalizeRisk(ctx.fraudRiskLevel);
  const fraudDecision = String(ctx.fraudDecision || FRAUD_DECISIONS.ALLOW).toLowerCase();
  const minAge = getQualificationMinAgeMinutes();
  const minActivity = getQualificationMinActivityCount();
  const ageMinutes = accountAgeMinutes(ctx.accountCreatedAt, now);
  const activityCount = Number(ctx.meaningfulActivityCount || 0);

  const checks = {
    accountExists: Boolean(ctx.referredUserId),
    emailVerified: Boolean(ctx.emailVerified),
    attributionValid: Boolean(ctx.attributionValid !== false),
    partnerActive: Boolean(ctx.partnerActive !== false),
    selfReferral: Boolean(ctx.selfReferral),
    duplicateIdentity: Boolean(ctx.duplicateIdentity),
    fraudAllowed: !(
      riskLevel === FRAUD_RISK_LEVELS.HIGH ||
      riskLevel === FRAUD_RISK_LEVELS.BLOCKED ||
      fraudDecision === FRAUD_DECISIONS.BLOCK
    ),
    minimumAge: ageMinutes >= minAge,
    meaningfulActivity: activityCount >= minActivity,
    minimumActivityCount: minActivity,
    minimumAgeMinutes: minAge,
    accountAgeMinutes: Math.floor(ageMinutes),
    meaningfulActivityCount: activityCount,
  };

  const reasons = [];

  if (checks.selfReferral) {
    reasons.push(QUALIFICATION_REASONS.SELF_REFERRAL);
  }
  if (checks.duplicateIdentity) {
    reasons.push(QUALIFICATION_REASONS.DUPLICATE_IDENTITY);
  }
  if (riskLevel === FRAUD_RISK_LEVELS.BLOCKED || fraudDecision === FRAUD_DECISIONS.BLOCK) {
    reasons.push(QUALIFICATION_REASONS.FRAUD_BLOCKED);
  } else if (riskLevel === FRAUD_RISK_LEVELS.HIGH) {
    reasons.push(QUALIFICATION_REASONS.FRAUD_HIGH_BLOCKED);
  }
  if (!checks.emailVerified) {
    reasons.push(QUALIFICATION_REASONS.EMAIL_NOT_VERIFIED);
  }
  if (!checks.minimumAge) {
    reasons.push(QUALIFICATION_REASONS.MINIMUM_AGE_NOT_MET);
  }
  if (!checks.meaningfulActivity) {
    reasons.push(QUALIFICATION_REASONS.MEANINGFUL_ACTIVITY_MISSING);
  }
  if (!checks.partnerActive) {
    reasons.push(QUALIFICATION_REASONS.PARTNER_INACTIVE);
  }
  if (!checks.attributionValid) {
    reasons.push(QUALIFICATION_REASONS.ATTRIBUTION_INVALID);
  }

  if (checks.selfReferral || checks.duplicateIdentity) {
    return {
      eligible: false,
      targetState: QUALIFICATION_STATES.DISQUALIFIED,
      reasons,
      riskLevel,
      checks,
      policyVersion: QUALIFICATION_POLICY_VERSION,
    };
  }

  if (
    riskLevel === FRAUD_RISK_LEVELS.BLOCKED ||
    fraudDecision === FRAUD_DECISIONS.BLOCK
  ) {
    return {
      eligible: false,
      targetState: QUALIFICATION_STATES.DISQUALIFIED,
      reasons,
      riskLevel,
      checks,
      policyVersion: QUALIFICATION_POLICY_VERSION,
    };
  }

  const canVerify = canVerifyReferral(checks, riskLevel, fraudDecision);
  const canQualify = canQualifyReferral(checks, riskLevel, fraudDecision);

  if (
    currentState === QUALIFICATION_STATES.QUALIFIED ||
    currentState === QUALIFICATION_STATES.CUSTOMER
  ) {
    return {
      eligible: true,
      targetState: currentState,
      reasons: [QUALIFICATION_REASONS.POLICY_QUALIFIED],
      riskLevel,
      checks,
      policyVersion: QUALIFICATION_POLICY_VERSION,
    };
  }

  if (currentState === QUALIFICATION_STATES.DISQUALIFIED) {
    return {
      eligible: false,
      targetState: QUALIFICATION_STATES.DISQUALIFIED,
      reasons,
      riskLevel,
      checks,
      policyVersion: QUALIFICATION_POLICY_VERSION,
    };
  }

  if (canQualify) {
    return {
      eligible: true,
      targetState: QUALIFICATION_STATES.QUALIFIED,
      reasons: [QUALIFICATION_REASONS.POLICY_QUALIFIED],
      riskLevel,
      checks,
      policyVersion: QUALIFICATION_POLICY_VERSION,
    };
  }

  if (canVerify) {
    const verifyReasons = reasons.filter(
      (r) =>
        r !== QUALIFICATION_REASONS.MINIMUM_AGE_NOT_MET &&
        r !== QUALIFICATION_REASONS.MEANINGFUL_ACTIVITY_MISSING &&
        r !== QUALIFICATION_REASONS.FRAUD_HIGH_BLOCKED
    );
    if (riskLevel === FRAUD_RISK_LEVELS.HIGH) {
      verifyReasons.push(QUALIFICATION_REASONS.REVIEW_REQUIRED);
    }
    return {
      eligible: true,
      targetState: QUALIFICATION_STATES.VERIFIED,
      reasons: verifyReasons.length ? verifyReasons : [QUALIFICATION_REASONS.EMAIL_VERIFIED],
      riskLevel,
      checks,
      policyVersion: QUALIFICATION_POLICY_VERSION,
    };
  }

  return {
    eligible: false,
    targetState: currentState === QUALIFICATION_STATES.SIGNUP
      ? QUALIFICATION_STATES.SIGNUP
      : currentState,
    reasons,
    riskLevel,
    checks,
    policyVersion: QUALIFICATION_POLICY_VERSION,
  };
}

export function canVerifyReferral(checks, riskLevel = FRAUD_RISK_LEVELS.LOW, fraudDecision = FRAUD_DECISIONS.ALLOW) {
  if (!checks?.accountExists) return false;
  if (!checks.emailVerified) return false;
  if (!checks.attributionValid) return false;
  if (!checks.partnerActive) return false;
  if (checks.selfReferral || checks.duplicateIdentity) return false;
  if (normalizeRisk(riskLevel) === FRAUD_RISK_LEVELS.BLOCKED) return false;
  if (String(fraudDecision).toLowerCase() === FRAUD_DECISIONS.BLOCK) return false;
  return true;
}

export function canQualifyReferral(checks, riskLevel = FRAUD_RISK_LEVELS.LOW, fraudDecision = FRAUD_DECISIONS.ALLOW) {
  if (!canVerifyReferral(checks, riskLevel, fraudDecision)) return false;
  if (!checks.minimumAge) return false;
  if (!checks.meaningfulActivity) return false;
  if (normalizeRisk(riskLevel) === FRAUD_RISK_LEVELS.HIGH) return false;
  if (normalizeRisk(riskLevel) === FRAUD_RISK_LEVELS.BLOCKED) return false;
  if (String(fraudDecision).toLowerCase() === FRAUD_DECISIONS.BLOCK) return false;
  return true;
}

export function countsAsQualifiedMetric(state) {
  return (
    state === QUALIFICATION_STATES.QUALIFIED || state === QUALIFICATION_STATES.CUSTOMER
  );
}
