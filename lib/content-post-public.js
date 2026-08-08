export function getContentPostPublicPath(contentType, slug) {
  const normalizedSlug = String(slug || "").trim();
  if (!normalizedSlug) return null;
  if (contentType === "academy") return `/academy/${normalizedSlug}`;
  if (contentType === "result") return `/results/${normalizedSlug}`;
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
