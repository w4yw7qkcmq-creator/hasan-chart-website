/** Email category taxonomy for dispatch policy and recipient eligibility. */
export const EMAIL_CATEGORIES = Object.freeze({
  TRANSACTIONAL: "transactional",
  MARKETING: "marketing",
  BULK: "bulk",
});

export const BULK_EMAIL_CATEGORIES = new Set([
  EMAIL_CATEGORIES.MARKETING,
  EMAIL_CATEGORIES.BULK,
]);

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
