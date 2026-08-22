import { EMAIL_CATEGORIES } from "../email-categories.js";

/** Current consent policy version recorded on preference changes. */
export const EMAIL_CONSENT_POLICY_VERSION = "E3-2026-08-28";

export const EMAIL_POLICY_SOURCES = Object.freeze({
  SIGNUP_CHECKBOX: "signup-checkbox",
  ACCOUNT_PREFERENCES: "account-preferences",
  EMAIL_UNSUBSCRIBE: "email-unsubscribe",
  ADMIN: "admin",
  E2_CANARY: "e2.2-canary-validation",
});

export const EXCLUSION_REASONS = Object.freeze({
  MISSING_EMAIL: "missing-email",
  INVALID_EMAIL_FORMAT: "invalid-email-format",
  PRODUCTION_RECIPIENT_BLOCKED: "production-recipient-blocked",
  SUPPRESSED: "suppressed",
  HARD_SUPPRESSED: "hard-suppressed",
  MARKETING_NOT_OPTED_IN: "marketing-not-opted-in",
  GLOBAL_UNSUBSCRIBED: "global-unsubscribed",
  UNKNOWN_USER: "unknown-user",
  PROFILE_LOOKUP_FAILED: "profile-lookup-failed",
  MISSING_PROFILE_EMAIL: "missing-profile-email",
  INVALID_CATEGORY: "invalid-category",
});

export const EXCLUSION_REASON_LABELS_AR = Object.freeze({
  [EXCLUSION_REASONS.MISSING_EMAIL]: "لا يوجد بريد إلكتروني",
  [EXCLUSION_REASONS.INVALID_EMAIL_FORMAT]: "البريد غير صالح",
  [EXCLUSION_REASONS.PRODUCTION_RECIPIENT_BLOCKED]: "محظور في الإنتاج (اختبار)",
  [EXCLUSION_REASONS.SUPPRESSED]: "مُستبعد (suppression)",
  [EXCLUSION_REASONS.HARD_SUPPRESSED]: "مُستبعد (hard suppression)",
  [EXCLUSION_REASONS.MARKETING_NOT_OPTED_IN]: "لم يوافق على البريد التسويقي",
  [EXCLUSION_REASONS.GLOBAL_UNSUBSCRIBED]: "ألغى الاشتراك من رسائل التسويق",
  [EXCLUSION_REASONS.UNKNOWN_USER]: "مستخدم غير معروف",
  [EXCLUSION_REASONS.PROFILE_LOOKUP_FAILED]: "تعذر التحقق من الحساب",
  [EXCLUSION_REASONS.MISSING_PROFILE_EMAIL]: "لا يوجد بريد في الملف الشخصي",
  [EXCLUSION_REASONS.INVALID_CATEGORY]: "تصنيف غير مسموح",
});

/** Categories that require explicit marketing opt-in. */
export function requiresMarketingConsent(category) {
  const normalized = String(category || "").trim().toLowerCase();
  return (
    normalized === EMAIL_CATEGORIES.MARKETING ||
    normalized === EMAIL_CATEGORIES.BULK
  );
}

/** Service announcements bypass marketing consent but still respect hard suppression. */
export function isServiceAnnouncementCategory(category) {
  return String(category || "").trim().toLowerCase() === EMAIL_CATEGORIES.SERVICE_ANNOUNCEMENT;
}

/** Transactional emails do not require marketing consent. */
export function isTransactionalCategory(category) {
  return String(category || "").trim().toLowerCase() === EMAIL_CATEGORIES.TRANSACTIONAL;
}

export function formatExclusionReason(reason) {
  return EXCLUSION_REASON_LABELS_AR[reason] || reason || "غير معروف";
}
