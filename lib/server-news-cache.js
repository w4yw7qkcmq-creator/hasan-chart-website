import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import {
  NEWS_ARTICLE_CACHE_SECONDS,
  NEWS_CATEGORY_POOL_LIMIT,
  NEWS_POSTS_CACHE_SECONDS,
  NEWS_RELATED_POOL_LIMIT,
} from "./public-cache-config";
import {
  NEWS_ARTICLE_COLUMNS,
  NEWS_LIST_COLUMNS,
  NEWS_RELATED_COLUMNS,
} from "./supabase-query-columns";

const postLookupInFlight = new Map();

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

function looksLikeNewsId(identifier) {
  const value = String(identifier || "").trim();
  return /^\d+$/.test(value) || /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

async function fetchNewsPostsPool(limit, columns) {
  try {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from("news_posts")
      .select(columns)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return [];
    }

    return data || [];
  } catch {
    return [];
  }
}

export const getCachedNewsPostsPool = unstable_cache(
  async () => fetchNewsPostsPool(NEWS_CATEGORY_POOL_LIMIT, NEWS_LIST_COLUMNS),
  ["public-news-posts-pool"],
  {
    revalidate: NEWS_POSTS_CACHE_SECONDS,
    tags: ["news-posts"],
  }
);

export const getCachedNewsRelatedPool = unstable_cache(
  async () => fetchNewsPostsPool(NEWS_RELATED_POOL_LIMIT, NEWS_RELATED_COLUMNS),
  ["public-news-related-pool"],
  {
    revalidate: NEWS_POSTS_CACHE_SECONDS,
    tags: ["news-posts"],
  }
);

async function fetchNewsPostByIdentifier(identifier) {
  const supabase = getSupabaseClient();
  const normalizedIdentifier = String(identifier || "").trim();

  if (!normalizedIdentifier) {
    return null;
  }

  if (looksLikeNewsId(normalizedIdentifier)) {
    const { data, error } = await supabase
      .from("news_posts")
      .select(NEWS_ARTICLE_COLUMNS)
      .eq("id", normalizedIdentifier)
      .maybeSingle();

    if (!error && data) {
      return data;
    }
  } else {
    const { data: slugData, error: slugError } = await supabase
      .from("news_posts")
      .select(NEWS_ARTICLE_COLUMNS)
      .eq("slug", normalizedIdentifier)
      .maybeSingle();

    if (!slugError && slugData) {
      return slugData;
    }
  }

  const { data: fallbackData, error: fallbackError } = await supabase
    .from("news_posts")
    .select(NEWS_ARTICLE_COLUMNS)
    .eq(looksLikeNewsId(normalizedIdentifier) ? "slug" : "id", normalizedIdentifier)
    .maybeSingle();

  if (fallbackError || !fallbackData) {
    return null;
  }

  return fallbackData;
}

async function fetchNewsPostWithDedup(identifier) {
  const normalizedIdentifier = String(identifier || "").trim();

  if (!normalizedIdentifier) {
    return null;
  }

  if (postLookupInFlight.has(normalizedIdentifier)) {
    return postLookupInFlight.get(normalizedIdentifier);
  }

  const lookupPromise = fetchNewsPostByIdentifier(normalizedIdentifier).finally(() => {
    postLookupInFlight.delete(normalizedIdentifier);
  });

  postLookupInFlight.set(normalizedIdentifier, lookupPromise);
  return lookupPromise;
}

export async function getCachedNewsPost(identifier) {
  const normalizedIdentifier = String(identifier || "").trim();

  if (!normalizedIdentifier) {
    return null;
  }

  const cachedLookup = unstable_cache(
    async () => fetchNewsPostWithDedup(normalizedIdentifier),
    ["public-news-post", normalizedIdentifier],
    {
      revalidate: NEWS_ARTICLE_CACHE_SECONDS,
      tags: ["news-posts", `news-post:${normalizedIdentifier}`],
    }
  );

  return cachedLookup();
}
