/**
 * Canonical news URL helpers — decisions derive from the fetched record, never URL shape alone.
 */

export function isValidNewsSlug(slug) {
  const value = String(slug ?? "").trim();
  return value.length > 0;
}

/** URL path segment for a news record (slug preferred, else id). */
export function getCanonicalNewsSegment(news) {
  if (isValidNewsSlug(news?.slug)) {
    return String(news.slug).trim();
  }

  return String(news?.id ?? "").trim();
}

/** Canonical public path for a news record, e.g. `/news/my-slug`. */
export function getCanonicalNewsPath(news) {
  const segment = getCanonicalNewsSegment(news);
  if (!segment) {
    return "/news";
  }

  return `/news/${segment}`;
}

/** @deprecated Prefer getCanonicalNewsPath — kept for call-site compatibility. */
export function getNewsHref(news) {
  return getCanonicalNewsPath(news);
}

/** True when the requested URL segment is not the canonical segment for this record. */
export function shouldRedirectToCanonicalNewsPath(requestedIdentifier, news) {
  const requested = String(requestedIdentifier ?? "").trim();
  const canonicalSegment = getCanonicalNewsSegment(news);

  if (!requested || !canonicalSegment) {
    return false;
  }

  return requested !== canonicalSegment;
}
