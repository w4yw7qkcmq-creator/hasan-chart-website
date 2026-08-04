import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import {
  filterNewsByCategory,
  filterNewsByTag,
  detectNewsCategoryFromItem,
} from "./news-category-detection.js";
import {
  applyCreatedAtIdCursor,
  buildPaginationResult,
  decodeCursor,
  parseLimit,
} from "./pagination.js";
import {
  NEWS_ARTICLE_CACHE_SECONDS,
  NEWS_CATEGORY_LIST_LIMIT,
  NEWS_POSTS_CACHE_SECONDS,
  NEWS_RELATED_LIST_LIMIT,
  NEWS_TAG_LIST_LIMIT,
} from "./public-cache-config.js";
import {
  NEWS_DETAIL_COLUMNS,
  NEWS_LIST_COLUMNS,
  NEWS_RELATED_COLUMNS,
} from "./supabase-query-columns.js";

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

async function queryNewsList({
  columns = NEWS_LIST_COLUMNS,
  limit = 20,
  cursor = null,
  search = "",
  fetchLimit = null,
}) {
  const supabase = getSupabaseClient();
  const safeLimit = parseLimit(limit, { defaultLimit: 20, maxLimit: 50 });
  const queryLimit = fetchLimit || safeLimit + 1;

  let query = supabase
    .from("news_posts")
    .select(columns)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (cursor) {
    query = applyCreatedAtIdCursor(query, cursor);
  }

  const normalizedSearch = String(search || "").trim();
  if (normalizedSearch.length >= 2) {
    const escaped = normalizedSearch.replace(/[%_,]/g, " ");
    query = query.or(`title.ilike.%${escaped}%,slug.ilike.%${escaped}%`);
  }

  const { data, error } = await query.limit(queryLimit);

  if (error) {
    throw new Error(error.message || "news_list_query_failed");
  }

  if (fetchLimit) {
    return data || [];
  }

  return buildPaginationResult(data || [], safeLimit);
}

export async function fetchNewsList(options = {}) {
  return queryNewsList(options);
}

function buildNewsListCacheKey({ category = "", tag = "", search = "", limit, cursor = "" }) {
  return ["public-news-list", category || "all", tag || "none", search || "none", String(limit), cursor || "start"].join(":");
}

export async function getCachedNewsList(options = {}) {
  const {
    category = "",
    tag = "",
    search = "",
    limit = 20,
    cursor = null,
    locale = "ar",
  } = options;

  const cacheKey = buildNewsListCacheKey({ category, tag, search, limit, cursor: cursor || "" });

  const cachedLookup = unstable_cache(
    async () => {
      if (category) {
        const rows = await queryNewsList({
          limit: NEWS_CATEGORY_LIST_LIMIT,
          fetchLimit: NEWS_CATEGORY_LIST_LIMIT,
        });
        return {
          items: filterNewsByCategory(rows, category).slice(0, parseLimit(limit)),
          pagination: {
            limit: parseLimit(limit),
            nextCursor: null,
            hasMore: false,
          },
        };
      }

      if (tag) {
        const rows = await queryNewsList({
          limit: NEWS_TAG_LIST_LIMIT,
          fetchLimit: NEWS_TAG_LIST_LIMIT,
        });
        return {
          items: filterNewsByTag(rows, tag).slice(0, parseLimit(limit)),
          pagination: {
            limit: parseLimit(limit),
            nextCursor: null,
            hasMore: false,
          },
        };
      }

      return queryNewsList({ limit, cursor, search });
    },
    [cacheKey, locale],
    {
      revalidate: NEWS_POSTS_CACHE_SECONDS,
      tags: ["news-posts", category ? `news-category:${category}` : "news-list"],
    }
  );

  return cachedLookup();
}

export async function getCachedRelatedNews({ excludeId, category = "", limit = NEWS_RELATED_LIST_LIMIT } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || NEWS_RELATED_LIST_LIMIT, 1), 12);
  const cacheKey = `public-news-related:${excludeId || "none"}:${category || "auto"}:${safeLimit}`;

  const cachedLookup = unstable_cache(
    async () => {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("news_posts")
        .select(NEWS_RELATED_COLUMNS)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(Math.max(safeLimit * 4, 24));

      if (error) {
        return [];
      }

      const pool = (data || []).filter((item) => item.id !== excludeId);

      if (category) {
        const categoryMatches = pool.filter(
          (item) => detectNewsCategoryFromItem(item) === category
        );
        if (categoryMatches.length > 0) {
          return categoryMatches.slice(0, safeLimit);
        }
      }

      return pool.slice(0, safeLimit);
    },
    [cacheKey],
    {
      revalidate: NEWS_POSTS_CACHE_SECONDS,
      tags: ["news-posts", "news-related"],
    }
  );

  return cachedLookup();
}

export async function getCachedAdjacentNews(currentNews) {
  if (!currentNews?.created_at || !currentNews?.id) {
    return { previous: null, next: null };
  }

  const supabase = getSupabaseClient();
  const columns = NEWS_RELATED_COLUMNS;

  const [previousResult, nextResult] = await Promise.all([
    supabase
      .from("news_posts")
      .select(columns)
      .or(`created_at.lt.${currentNews.created_at},and(created_at.eq.${currentNews.created_at},id.lt.${currentNews.id})`)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("news_posts")
      .select(columns)
      .or(`created_at.gt.${currentNews.created_at},and(created_at.eq.${currentNews.created_at},id.gt.${currentNews.id})`)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    previous: previousResult.data || null,
    next: nextResult.data || null,
  };
}

/** @deprecated Use getCachedNewsList({ category, limit }) */
export async function getCachedNewsPostsPool() {
  const result = await getCachedNewsList({ limit: NEWS_CATEGORY_LIST_LIMIT });
  return result.items;
}

/** @deprecated Use getCachedRelatedNews */
export async function getCachedNewsRelatedPool() {
  return getCachedRelatedNews({ limit: NEWS_RELATED_LIST_LIMIT });
}

async function fetchNewsPostByIdentifier(identifier) {
  const supabase = getSupabaseClient();
  const normalizedIdentifier = String(identifier || "").trim();

  if (!normalizedIdentifier) {
    return null;
  }

  if (looksLikeNewsId(normalizedIdentifier)) {
    const { data, error } = await supabase
      .from("news_posts")
      .select(NEWS_DETAIL_COLUMNS)
      .eq("id", normalizedIdentifier)
      .maybeSingle();

    if (!error && data) {
      return data;
    }
  } else {
    const { data: slugData, error: slugError } = await supabase
      .from("news_posts")
      .select(NEWS_DETAIL_COLUMNS)
      .eq("slug", normalizedIdentifier)
      .maybeSingle();

    if (!slugError && slugData) {
      return slugData;
    }
  }

  const { data: fallbackData, error: fallbackError } = await supabase
    .from("news_posts")
    .select(NEWS_DETAIL_COLUMNS)
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

export { decodeCursor };
