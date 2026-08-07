export const ACADEMY_CATEGORIES = Object.freeze([
  "التحليل الكلاسيكي",
  "SMC",
  "التحليل الموجي",
  "التحليل الزمني",
  "إدارة المخاطر",
  "عام",
]);

export const RESULT_CATEGORIES = Object.freeze([
  "Weekly Result",
  "Target Hit",
  "Performance",
  "عام",
]);

export const CONTENT_POST_TYPES = Object.freeze(["academy", "result"]);

export const CONTENT_POST_STATUSES = Object.freeze(["draft", "published", "archived"]);

export function getCategoriesForContentType(contentType) {
  if (contentType === "academy") return ACADEMY_CATEGORIES;
  if (contentType === "result") return RESULT_CATEGORIES;
  return [];
}

export function isAllowedCategory(contentType, category) {
  if (!category) return true;
  return getCategoriesForContentType(contentType).includes(String(category).trim());
}
