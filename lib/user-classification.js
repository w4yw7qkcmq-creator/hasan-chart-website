import { normalizeEmail } from "./admin-emails.js";

/**
 * Classification authority order (server-side):
 * 1. Admin manual stored value (profiles.user_classification_source = admin_manual)
 * 2. High-confidence stored backfill (backfill_high_confidence)
 * 3. Other stored profiles.user_classification
 * 4. Computed heuristic (resolveUserClassificationSignals)
 * 5. UNKNOWN fallback
 *
 * Never assign REAL from username/email alone; ambiguous → UNKNOWN/SUSPECTED.
 */

export const USER_CLASSIFICATION = Object.freeze({
  REAL: "real",
  TEST: "test",
  E2E: "e2e",
  INTERNAL: "internal",
  SUSPECTED: "suspected",
  UNKNOWN: "unknown",
});

export const USER_CLASSIFICATION_FILTER_ALL = "all";

export const USER_CLASSIFICATION_LABELS_AR = Object.freeze({
  [USER_CLASSIFICATION.REAL]: "مستخدم حقيقي",
  [USER_CLASSIFICATION.TEST]: "حساب اختبار",
  [USER_CLASSIFICATION.E2E]: "حساب آلي للاختبارات",
  [USER_CLASSIFICATION.INTERNAL]: "حساب داخلي",
  [USER_CLASSIFICATION.SUSPECTED]: "مشتبه",
  [USER_CLASSIFICATION.UNKNOWN]: "غير مصنف",
});

export const USER_CLASSIFICATION_BADGE_AR = Object.freeze({
  [USER_CLASSIFICATION.REAL]: "حقيقي",
  [USER_CLASSIFICATION.TEST]: "اختبار",
  [USER_CLASSIFICATION.E2E]: "E2E",
  [USER_CLASSIFICATION.INTERNAL]: "داخلي",
  [USER_CLASSIFICATION.SUSPECTED]: "مشتبه",
  [USER_CLASSIFICATION.UNKNOWN]: "غير مصنف",
});

export const KNOWN_E2E_USERNAMES = Object.freeze([
  "smoke-e2e-user",
  "smoke-e2e-admin",
]);

export const KNOWN_E2E_EMAIL_DOMAINS = Object.freeze([
  "e2e.hasanchartworld.test",
]);

export const KNOWN_TEST_EMAIL_DOMAINS = Object.freeze(["test.local"]);

const TEST_USERNAME_PREFIXES = Object.freeze(["PayE2E", "ProdA", "e2e-"]);

function readMetadata(profile, authUser) {
  return authUser?.user_metadata || authUser?.raw_user_meta_data || profile?.metadata || {};
}

function emailDomain(email) {
  const parts = String(email || "").split("@");
  return parts.length === 2 ? parts[1].toLowerCase() : "";
}

function emailLocal(email) {
  return String(email || "").split("@")[0] || "";
}

function hasKnownE2eUsername(username) {
  const value = String(username || "").trim().toLowerCase();
  return KNOWN_E2E_USERNAMES.some((item) => item.toLowerCase() === value);
}

function matchesTestUsernamePattern(username) {
  const value = String(username || "").trim();
  if (!value) return false;
  return TEST_USERNAME_PREFIXES.some((prefix) => value.startsWith(prefix));
}

function isKnownTestEmailDomain(domain) {
  return KNOWN_TEST_EMAIL_DOMAINS.includes(domain);
}

function isKnownE2eEmailDomain(domain) {
  return KNOWN_E2E_EMAIL_DOMAINS.includes(domain);
}

function hasE2eMetadata(meta) {
  return meta?.e2e === true || meta?.smoke_test === true;
}

function hasTestMetadata(meta) {
  return meta?.iam_test === true || meta?.staging_only === true || meta?.test_only === true;
}

function hasInternalMetadata(meta) {
  return meta?.internal === true || meta?.staff === true || meta?.service_account === true;
}

/**
 * Resolve classification from signals only (no DB column required).
 * Conservative: never assigns REAL without positive non-test signals.
 */
export function resolveUserClassificationSignals(profile = {}, authUser = null) {
  const email = normalizeEmail(profile?.email || authUser?.email || "");
  const username = String(profile?.username || authUser?.user_metadata?.username || "").trim();
  const meta = readMetadata(profile, authUser);
  const domain = emailDomain(email);
  const local = emailLocal(email);
  const role = String(profile?.role || meta?.role || "user").trim().toLowerCase();

  const signals = [];

  if (hasE2eMetadata(meta)) signals.push("metadata.e2e");
  if (hasKnownE2eUsername(username)) signals.push("fixture.username");
  if (isKnownE2eEmailDomain(domain)) signals.push("fixture.email_domain");
  if (/^e2e[-_]/i.test(local)) signals.push("email.local_e2e_prefix");
  if (local.includes("smoke-e2e")) signals.push("email.smoke_e2e");

  if (signals.length > 0) {
    return {
      classification: USER_CLASSIFICATION.E2E,
      confidence: "high",
      signals,
    };
  }

  if (isKnownTestEmailDomain(domain)) signals.push("email.test_local_domain");
  if (hasTestMetadata(meta)) signals.push("metadata.test");
  if (/^e2e-pay-/i.test(local) && isKnownTestEmailDomain(domain)) signals.push("email.e2e_pay_prefix");
  if (matchesTestUsernamePattern(username) && isKnownTestEmailDomain(domain)) {
    signals.push("username.test_prefix_on_test_domain");
  }
  if (/\btest\b/i.test(local) && isKnownTestEmailDomain(domain)) signals.push("email.test_local_with_test_token");

  if (signals.length > 0) {
    return {
      classification: USER_CLASSIFICATION.TEST,
      confidence: "high",
      signals,
    };
  }

  if (hasInternalMetadata(meta)) signals.push("metadata.internal");
  if (role === "admin" && email && !isKnownTestEmailDomain(domain) && !isKnownE2eEmailDomain(domain)) {
    signals.push("role.admin_non_test_domain");
  }

  if (signals.length > 0) {
    return {
      classification: USER_CLASSIFICATION.INTERNAL,
      confidence: role === "admin" ? "medium" : "high",
      signals,
    };
  }

  const suspectedSignals = [];
  if (/\btest\b/i.test(local) && !isKnownTestEmailDomain(domain)) suspectedSignals.push("email.test_token_non_test_domain");
  if (matchesTestUsernamePattern(username) && !isKnownTestEmailDomain(domain)) suspectedSignals.push("username.test_prefix_non_test_domain");
  if (/^prod[a-z]?\d/i.test(username)) suspectedSignals.push("username.prod_fixture_pattern");

  if (suspectedSignals.length > 0) {
    return {
      classification: USER_CLASSIFICATION.SUSPECTED,
      confidence: "low",
      signals: suspectedSignals,
    };
  }

  const realSignals = [];
  if (
    email &&
    domain &&
    !isKnownTestEmailDomain(domain) &&
    !isKnownE2eEmailDomain(domain) &&
    !/^e2e[-_]/i.test(local)
  ) {
    realSignals.push("email.production_domain");
  }
  if (profile?.last_sign_in_at || authUser?.last_sign_in_at) realSignals.push("activity.last_sign_in");
  if (profile?.created_at) realSignals.push("profile.created_at");

  if (realSignals.length >= 2) {
    return {
      classification: USER_CLASSIFICATION.REAL,
      confidence: "medium",
      signals: realSignals,
    };
  }

  return {
    classification: USER_CLASSIFICATION.UNKNOWN,
    confidence: "none",
    signals: realSignals.length ? realSignals : ["insufficient_evidence"],
  };
}

export function resolveEffectiveUserClassification(profile = {}, authUser = null) {
  const stored = String(profile?.user_classification || "").trim().toLowerCase();
  const storedSource = String(profile?.user_classification_source || "").trim().toLowerCase();

  if (
    storedSource === "admin_manual" &&
    stored &&
    Object.values(USER_CLASSIFICATION).includes(stored)
  ) {
    return {
      classification: stored,
      confidence: "admin",
      signals: [`profiles.user_classification:admin_manual`],
      source: "admin_manual",
    };
  }

  if (
    storedSource === "backfill_high_confidence" &&
    stored &&
    stored !== USER_CLASSIFICATION.UNKNOWN &&
    Object.values(USER_CLASSIFICATION).includes(stored)
  ) {
    return {
      classification: stored,
      confidence: "stored",
      signals: [`profiles.user_classification:backfill_high_confidence`],
      source: "backfill_high_confidence",
    };
  }

  if (
    stored &&
    stored !== USER_CLASSIFICATION.UNKNOWN &&
    Object.values(USER_CLASSIFICATION).includes(stored)
  ) {
    return {
      classification: stored,
      confidence: "stored",
      signals: [`profiles.user_classification${storedSource ? `:${storedSource}` : ""}`],
      source: storedSource || "stored",
    };
  }

  const resolved = resolveUserClassificationSignals(profile, authUser);
  return { ...resolved, source: "computed" };
}

/** @deprecated Use resolveEffectiveUserClassification */
export function resolveStoredOrComputedClassification(profile = {}, authUser = null) {
  return resolveEffectiveUserClassification(profile, authUser);
}

export function getUserClassificationLabel(classification, { short = false } = {}) {
  const key = String(classification || USER_CLASSIFICATION.UNKNOWN).toLowerCase();
  const map = short ? USER_CLASSIFICATION_BADGE_AR : USER_CLASSIFICATION_LABELS_AR;
  return map[key] || USER_CLASSIFICATION_LABELS_AR[USER_CLASSIFICATION.UNKNOWN];
}

export function normalizeUserClassificationFilter(value) {
  const normalized = String(value || USER_CLASSIFICATION_FILTER_ALL).trim().toLowerCase();
  if (normalized === USER_CLASSIFICATION_FILTER_ALL || normalized === "") return USER_CLASSIFICATION_FILTER_ALL;
  if (Object.values(USER_CLASSIFICATION).includes(normalized)) return normalized;
  return USER_CLASSIFICATION_FILTER_ALL;
}

export function isRealUserClassification(classification) {
  return String(classification || "").toLowerCase() === USER_CLASSIFICATION.REAL;
}

export function buildClassificationBanner(classification) {
  const key = String(classification || "").toLowerCase();
  if (key === USER_CLASSIFICATION.TEST || key === USER_CLASSIFICATION.E2E) {
    return "هذا الحساب مصنف كحساب اختبار ولا يدخل ضمن إحصاءات المستخدمين الحقيقيين.";
  }
  if (key === USER_CLASSIFICATION.SUSPECTED) {
    return "هذا الحساب يحتاج مراجعة قبل اعتباره مستخدمًا حقيقيًا.";
  }
  return "";
}
