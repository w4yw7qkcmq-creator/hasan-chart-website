export function normalizeContentPostSlugParam(slug) {
  const raw = String(slug || "").trim();
  if (!raw) return "";

  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }

  return decoded.normalize("NFKC").trim();
}

export function getContentPostPublicPath(contentType, slug) {
  const normalizedSlug = normalizeContentPostSlugParam(slug);
  if (!normalizedSlug) return null;

  const encodedSlug = encodeURIComponent(normalizedSlug);
  if (contentType === "academy") return `/academy/${encodedSlug}`;
  if (contentType === "result") return `/results/${encodedSlug}`;
  return null;
}

export function formatContentPostDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}
