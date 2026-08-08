export const SLUG_MAX_LENGTH = 120;
const SLUG_PATTERN = /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u;

export function slugifyContentPostTitle(title) {
  let slug = String(title || "")
    .trim()
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH);

  if (/[\p{L}]/u.test(slug)) {
    slug = slug.replace(/([a-zA-Z]+)/g, (match) => match.toLowerCase());
  }

  return slug;
}

export function validateContentPostSlug(slug) {
  const normalized = String(slug || "").trim();
  if (!normalized) {
    return { ok: false, code: "EMPTY_SLUG" };
  }
  if (normalized.length > SLUG_MAX_LENGTH) {
    return { ok: false, code: "SLUG_TOO_LONG" };
  }
  if (!SLUG_PATTERN.test(normalized)) {
    return { ok: false, code: "INVALID_SLUG" };
  }
  return { ok: true, slug: normalized };
}

export function appendSlugSuffix(slug, suffix) {
  const base = String(slug || "").trim() || "post";
  const safeSuffix = String(suffix || "")
    .trim()
    .replace(/[^a-z0-9-]/gi, "")
    .slice(0, 12);
  const combined = `${base}-${safeSuffix}`.slice(0, SLUG_MAX_LENGTH);
  return combined.replace(/-+$/g, "") || "post";
}
