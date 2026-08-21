import { buildContentImagePublicUrl } from "./content-image-url.js";
import { normalizeContentPostSlugParam } from "./content-post-public.js";
import { sanitizeContentPostForPublic } from "./content-post-validation.js";
import {
  fetchMergedContentPostBySlug,
  fetchMergedContentPosts,
} from "./public-section-feed/index.js";
import { getPublicSupabaseClient } from "./public-section-feed/supabase-public.js";

export {
  getContentPostPublicPath,
  formatContentPostDate,
  normalizeContentPostSlugParam,
} from "./content-post-public.js";

const PUBLIC_COLUMNS =
  "id,content_type,title,slug,summary,body,image_path,category,highlight_value,status,published_at,created_at,updated_at";

function getPublicSupabase() {
  return getPublicSupabaseClient();
}

export function enrichContentPostWithImageUrl(post) {
  if (!post) return null;
  return {
    ...post,
    image_url: buildContentImagePublicUrl(post.image_path),
  };
}

async function fetchManualPublishedContentPosts(contentType, { limit = 50, category = null } = {}) {
  const supabase = getPublicSupabase();
  if (!supabase) return [];

  let query = supabase
    .from("content_posts")
    .select(PUBLIC_COLUMNS)
    .eq("content_type", contentType)
    .eq("status", "published")
    .is("deleted_at", null)
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));

  if (category) {
    query = query.eq("category", category);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).map((row) => enrichContentPostWithImageUrl(sanitizeContentPostForPublic(row)));
}

async function fetchManualPublishedContentPostBySlug(contentType, slug) {
  const supabase = getPublicSupabase();
  if (!supabase) return null;

  const normalizedSlug = normalizeContentPostSlugParam(slug);
  if (!normalizedSlug) return null;

  const { data, error } = await supabase
    .from("content_posts")
    .select(PUBLIC_COLUMNS)
    .eq("content_type", contentType)
    .eq("slug", normalizedSlug)
    .eq("status", "published")
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return enrichContentPostWithImageUrl(sanitizeContentPostForPublic(data));
}

export async function fetchPublishedContentPosts(contentType, { limit = 50, category = null } = {}) {
  return fetchMergedContentPosts(contentType, {
    limit,
    manualFetcher: (opts) => fetchManualPublishedContentPosts(contentType, { ...opts, category }),
  });
}

export async function fetchPublishedContentPostBySlug(contentType, slug) {
  const normalizedSlug = normalizeContentPostSlugParam(slug);
  if (!normalizedSlug) return null;

  return fetchMergedContentPostBySlug(contentType, normalizedSlug, {
    manualFetcher: (resolvedSlug) =>
      fetchManualPublishedContentPostBySlug(contentType, resolvedSlug),
  });
}
