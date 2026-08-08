import { randomBytes } from "node:crypto";
import {
  appendSlugSuffix,
  slugifyContentPostTitle,
  validateContentPostSlug,
} from "./content-post-slug-core.js";

export {
  appendSlugSuffix,
  slugifyContentPostTitle,
  validateContentPostSlug,
} from "./content-post-slug-core.js";

export function buildFallbackContentPostSlug() {
  return `post-${randomBytes(4).toString("hex")}`;
}

export async function resolveUniqueContentPostSlug(supabase, { contentType, title, slug, excludeId = null }) {
  const requested = String(slug || "").trim();
  let candidate = requested ? requested : slugifyContentPostTitle(title);

  const validated = validateContentPostSlug(candidate);
  if (!validated.ok) {
    candidate = buildFallbackContentPostSlug();
  } else {
    candidate = validated.slug;
  }

  if (!candidate) {
    candidate = buildFallbackContentPostSlug();
  }

  let attempt = 0;
  while (attempt < 20) {
    const isTaken = await isSlugTaken(supabase, { contentType, slug: candidate, excludeId });
    if (!isTaken) {
      return candidate;
    }
    candidate = appendSlugSuffix(
      requested || slugifyContentPostTitle(title) || "post",
      randomBytes(3).toString("hex")
    );
    attempt += 1;
  }

  return appendSlugSuffix(buildFallbackContentPostSlug(), randomBytes(4).toString("hex"));
}

async function isSlugTaken(supabase, { contentType, slug, excludeId }) {
  let query = supabase
    .from("content_posts")
    .select("id")
    .eq("content_type", contentType)
    .eq("slug", slug)
    .is("deleted_at", null)
    .limit(1);

  if (excludeId) {
    query = query.neq("id", excludeId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}
