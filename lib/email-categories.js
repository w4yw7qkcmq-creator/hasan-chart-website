/** Email category taxonomy for dispatch policy and recipient eligibility. */
export const EMAIL_CATEGORIES = Object.freeze({
  TRANSACTIONAL: "transactional",
  MARKETING: "marketing",
  BULK: "bulk",
  /** Important service/account changes — not promotional; no marketing consent required. */
  SERVICE_ANNOUNCEMENT: "service_announcement",
});

export const BULK_EMAIL_CATEGORIES = new Set([
  EMAIL_CATEGORIES.MARKETING,
  EMAIL_CATEGORIES.BULK,
]);

export const CONSENT_REQUIRED_CATEGORIES = BULK_EMAIL_CATEGORIES;

export function normalizeEmailCategory(value) {
  const normalized = String(value || EMAIL_CATEGORIES.TRANSACTIONAL)
    .trim()
    .toLowerCase();

  if (Object.values(EMAIL_CATEGORIES).includes(normalized)) {
    return normalized;
  }

  return EMAIL_CATEGORIES.TRANSACTIONAL;
}

export function resolveEmailCategoryFromMetadata(metadata = {}) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return EMAIL_CATEGORIES.TRANSACTIONAL;
  }

  return normalizeEmailCategory(
    metadata.emailCategory || metadata.email_category || metadata.category
  );
}

export function isBulkEmailCategory(category) {
  return BULK_EMAIL_CATEGORIES.has(normalizeEmailCategory(category));
}

export function isMarketingEmailCategory(category) {
  return isBulkEmailCategory(category);
}

export function isServiceAnnouncementCategory(category) {
  return normalizeEmailCategory(category) === EMAIL_CATEGORIES.SERVICE_ANNOUNCEMENT;
}
