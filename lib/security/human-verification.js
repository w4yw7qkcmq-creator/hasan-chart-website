export const HUMAN_VERIFICATION_STATUSES = Object.freeze({
  UNVERIFIED: "unverified",
  TURNSTILE_VERIFIED: "turnstile_verified",
  EMAIL_VERIFIED: "email_verified",
  VERIFIED: "verified",
  CHALLENGED: "challenged",
});

export const PARTNER_REWARD_ELIGIBILITY_STATUSES = Object.freeze({
  PENDING: "pending",
  ELIGIBLE: "eligible",
  RISK_HOLD: "risk_hold",
  BLOCKED: "blocked",
  MANUAL_REVIEW: "manual_review",
});

export function resolveHumanVerificationState({
  humanVerificationStatus = null,
  emailConfirmedAt = null,
  turnstileVerified = false,
} = {}) {
  const stored = String(humanVerificationStatus || HUMAN_VERIFICATION_STATUSES.UNVERIFIED).trim();
  const emailVerified = Boolean(emailConfirmedAt);

  if (stored === HUMAN_VERIFICATION_STATUSES.VERIFIED) {
    return { status: HUMAN_VERIFICATION_STATUSES.VERIFIED, emailVerified, turnstileVerified: true };
  }

  if (emailVerified) {
    if (
      stored === HUMAN_VERIFICATION_STATUSES.TURNSTILE_VERIFIED ||
      stored === HUMAN_VERIFICATION_STATUSES.EMAIL_VERIFIED ||
      turnstileVerified
    ) {
      return { status: HUMAN_VERIFICATION_STATUSES.VERIFIED, emailVerified: true, turnstileVerified: true };
    }
    return {
      status: HUMAN_VERIFICATION_STATUSES.EMAIL_VERIFIED,
      emailVerified: true,
      turnstileVerified,
    };
  }

  if (turnstileVerified || stored === HUMAN_VERIFICATION_STATUSES.TURNSTILE_VERIFIED) {
    return {
      status: HUMAN_VERIFICATION_STATUSES.TURNSTILE_VERIFIED,
      emailVerified: false,
      turnstileVerified: true,
    };
  }

  if (stored === HUMAN_VERIFICATION_STATUSES.CHALLENGED) {
    return { status: HUMAN_VERIFICATION_STATUSES.CHALLENGED, emailVerified, turnstileVerified };
  }

  return {
    status: HUMAN_VERIFICATION_STATUSES.UNVERIFIED,
    emailVerified,
    turnstileVerified: false,
  };
}

export function humanVerificationLabelAr(status) {
  const map = {
    unverified: "غير موثّق",
    turnstile_verified: "Turnstile ✓",
    email_verified: "البريد ✓",
    verified: "موثّق بالكامل",
    challenged: "تحت التحقق",
  };
  return map[String(status || "").toLowerCase()] || status || "—";
}

export function partnerRewardEligibilityLabelAr(status) {
  const map = {
    pending: "قيد الانتظار",
    eligible: "مؤهل",
    risk_hold: "معلق — مخاطر",
    blocked: "محظور",
    manual_review: "مراجعة يدوية",
  };
  return map[String(status || "").toLowerCase()] || status || "—";
}

export async function applyHumanVerificationUpdate(supabase, userId, patch = {}) {
  if (!userId) return { updated: false };
  const payload = { ...patch };
  const { error } = await supabase.from("profiles").update(payload).eq("id", userId);
  if (error) throw error;
  return { updated: true };
}

export async function markTurnstileVerified(supabase, userId) {
  return applyHumanVerificationUpdate(supabase, userId, {
    human_verification_status: HUMAN_VERIFICATION_STATUSES.TURNSTILE_VERIFIED,
    human_verified_at: new Date().toISOString(),
  });
}

export async function syncHumanVerificationFromEmail(supabase, userId, emailConfirmedAt) {
  if (!emailConfirmedAt) return { updated: false };
  const now = new Date().toISOString();
  const { data: profile } = await supabase
    .from("profiles")
    .select("human_verification_status")
    .eq("id", userId)
    .maybeSingle();

  const current = String(profile?.human_verification_status || HUMAN_VERIFICATION_STATUSES.UNVERIFIED);
  const nextStatus =
    current === HUMAN_VERIFICATION_STATUSES.TURNSTILE_VERIFIED ||
    current === HUMAN_VERIFICATION_STATUSES.EMAIL_VERIFIED
      ? HUMAN_VERIFICATION_STATUSES.VERIFIED
      : HUMAN_VERIFICATION_STATUSES.EMAIL_VERIFIED;

  return applyHumanVerificationUpdate(supabase, userId, {
    human_verification_status: nextStatus,
    human_verified_at: now,
  });
}

export async function deriveLegacyHumanVerificationBackfill(emailConfirmedAt) {
  if (!emailConfirmedAt) {
    return {
      human_verification_status: HUMAN_VERIFICATION_STATUSES.UNVERIFIED,
      human_verified_at: null,
    };
  }
  return {
    human_verification_status: HUMAN_VERIFICATION_STATUSES.VERIFIED,
    human_verified_at: emailConfirmedAt,
  };
}
