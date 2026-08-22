const GENERIC_IMAGE_URL_PATTERNS = [
  /il-og-thumbnail\.png/i,
  /\/images\/il-og-thumbnail/i,
  /\/default-og(?:-image)?\./i,
  /\/placeholder(?:-og)?\./i,
  /\/social-default\./i,
];

const REPEATED_GENERIC_THRESHOLD = 3;

function isKnownGenericImageUrl(url = "") {
  const value = String(url || "");
  if (!value) return false;
  return GENERIC_IMAGE_URL_PATTERNS.some((pattern) => pattern.test(value));
}

function isExcessivelyRepeatedImageUrl(url = "", recentUrlCounts = null) {
  if (!url || !recentUrlCounts) return false;
  const count = Number(recentUrlCounts.get(url) || 0);
  return count >= REPEATED_GENERIC_THRESHOLD;
}

function isGenericRssImageUrl(url = "", options = {}) {
  if (isKnownGenericImageUrl(url)) return true;
  return isExcessivelyRepeatedImageUrl(url, options.recentUrlCounts);
}

module.exports = {
  GENERIC_IMAGE_URL_PATTERNS,
  REPEATED_GENERIC_THRESHOLD,
  isKnownGenericImageUrl,
  isExcessivelyRepeatedImageUrl,
  isGenericRssImageUrl,
};
