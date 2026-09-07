import { createClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import {
  filterArchiveMonthPosts,
  getUtcMonthBounds,
  LATEST_NEWS_SITEMAP_LIMIT,
  parseArchivePageNumber,
  partitionArchiveNewsPosts,
} from "./news-sitemap-shared.js";
import {
  NEWS_ARCHIVE_PAGE_SIZE,
  NEWS_POSTS_CACHE_SECONDS,
  NEWS_SITEMAP_RAW_CACHE_SECONDS,
} from "./public-cache-config.js";
import { NEWS_CARD_COLUMNS } from "./supabase-query-columns.js";

const NEWS_SITEMAP_COLUMNS = "id, slug, title, content, created_at";
const LIGHTWEIGHT_SITEMAP_COLUMNS = "id, slug, created_at";

export function getNewsSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}

export async function fetchAllNewsPosts(supabase, columns = NEWS_SITEMAP_COLUMNS) {
  const all = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("news_posts")
      .select(columns)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(error.message || "news_posts_fetch_failed");
    }

    if (!data?.length) {
      break;
    }

    all.push(...data);

    if (data.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return all;
}

export async function fetchNewsPostsForUtcMonth(
  supabase,
  monthKey,
  columns = LIGHTWEIGHT_SITEMAP_COLUMNS
) {
  const bounds = getUtcMonthBounds(monthKey);
  if (!bounds) {
    return [];
  }

  const all = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("news_posts")
      .select(columns)
      .gte("created_at", bounds.start)
      .lt("created_at", bounds.endExclusive)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(error.message || "news_month_fetch_failed");
    }

    if (!data?.length) {
      break;
    }

    all.push(...data);

    if (data.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return all;
}

/** Always fresh — cheap id-only query; never cached to avoid latest/archive gaps. */
export async function fetchLatestNewsPostIds(supabase, limit = LATEST_NEWS_SITEMAP_LIMIT) {
  const { data, error } = await supabase
    .from("news_posts")
    .select("id")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message || "latest_news_ids_fetch_failed");
  }

  return new Set((data || []).map((row) => row.id));
}

const getCachedMonthPostsLookup = unstable_cache(
  async (monthKey) => {
    const supabase = getNewsSupabaseClient();
    if (!supabase) {
      return [];
    }

    return fetchNewsPostsForUtcMonth(supabase, monthKey);
  },
  ["news-sitemap-month-posts"],
  {
    revalidate: NEWS_SITEMAP_RAW_CACHE_SECONDS,
    tags: ["news-posts", "news-sitemap"],
  }
);

const getCachedAllPostTimestampsLookup = unstable_cache(
  async () => {
    const supabase = getNewsSupabaseClient();
    if (!supabase) {
      return [];
    }

    return fetchAllNewsPosts(supabase, LIGHTWEIGHT_SITEMAP_COLUMNS);
  },
  ["news-sitemap-all-timestamps"],
  {
    revalidate: NEWS_SITEMAP_RAW_CACHE_SECONDS,
    tags: ["news-posts", "news-sitemap"],
  }
);

/** Legacy full-corpus partition builder — used for equivalence checks only. */
export async function buildArchiveSitemapPartitions() {
  const supabase = getNewsSupabaseClient();
  if (!supabase) {
    return new Map();
  }

  const [allPosts, latestIds] = await Promise.all([
    fetchAllNewsPosts(supabase),
    fetchLatestNewsPostIds(supabase),
  ]);

  return partitionArchiveNewsPosts(allPosts, latestIds);
}

/** Optimized archive index metadata: cached lightweight timestamps + fresh latest IDs. */
export async function getArchiveSitemapIndexPartitions() {
  const supabase = getNewsSupabaseClient();
  if (!supabase) {
    return new Map();
  }

  const [allPosts, latestIds] = await Promise.all([
    getCachedAllPostTimestampsLookup(),
    fetchLatestNewsPostIds(supabase),
  ]);

  return partitionArchiveNewsPosts(allPosts, latestIds);
}

/** Optimized monthly archive sitemap: cached month slice + fresh latest IDs. */
export async function getArchiveMonthSitemapEntries(monthKey) {
  const supabase = getNewsSupabaseClient();
  if (!supabase) {
    return [];
  }

  const [monthPosts, latestIds] = await Promise.all([
    getCachedMonthPostsLookup(monthKey),
    fetchLatestNewsPostIds(supabase),
  ]);

  return filterArchiveMonthPosts(monthPosts, latestIds);
}

export async function queryNewsArchivePage({ page, pageSize = NEWS_ARCHIVE_PAGE_SIZE }) {
  const safePage = parseArchivePageNumber(page);
  if (!safePage || safePage < 1) {
    return { items: [], page: safePage, pageSize, totalCount: 0, totalPages: 0 };
  }

  const supabase = getNewsSupabaseClient();
  if (!supabase) {
    return { items: [], page: safePage, pageSize, totalCount: 0, totalPages: 0 };
  }

  const offset = (safePage - 1) * pageSize;

  const [{ count, error: countError }, { data, error: listError }] = await Promise.all([
    supabase.from("news_posts").select("id", { count: "exact", head: true }),
    supabase
      .from("news_posts")
      .select(NEWS_CARD_COLUMNS)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + pageSize - 1),
  ]);

  if (countError) {
    throw new Error(countError.message || "news_archive_count_failed");
  }

  if (listError) {
    throw new Error(listError.message || "news_archive_list_failed");
  }

  const totalCount = count || 0;
  const totalPages = totalCount > 0 ? Math.ceil(totalCount / pageSize) : 0;

  return {
    items: data || [],
    page: safePage,
    pageSize,
    totalCount,
    totalPages,
  };
}

const getCachedArchivePageLookup = unstable_cache(
  async (pageKey) => queryNewsArchivePage({ page: Number(pageKey) }),
  ["news-archive-page"],
  {
    revalidate: NEWS_POSTS_CACHE_SECONDS,
    tags: ["news-posts", "news-archive"],
  }
);

export async function getCachedNewsArchivePage(page) {
  const safePage = parseArchivePageNumber(page);
  if (!safePage) {
    return null;
  }

  return getCachedArchivePageLookup(String(safePage));
}

export async function getCachedNewsArchiveSummary() {
  const cachedLookup = unstable_cache(
    async () => {
      const supabase = getNewsSupabaseClient();
      if (!supabase) {
        return { totalCount: 0, totalPages: 0, pageSize: NEWS_ARCHIVE_PAGE_SIZE };
      }

      const { count, error } = await supabase
        .from("news_posts")
        .select("id", { count: "exact", head: true });

      if (error) {
        throw new Error(error.message || "news_archive_count_failed");
      }

      const totalCount = count || 0;
      return {
        totalCount,
        totalPages: totalCount > 0 ? Math.ceil(totalCount / NEWS_ARCHIVE_PAGE_SIZE) : 0,
        pageSize: NEWS_ARCHIVE_PAGE_SIZE,
      };
    },
    ["news-archive-summary"],
    {
      revalidate: NEWS_POSTS_CACHE_SECONDS,
      tags: ["news-posts", "news-archive"],
    }
  );

  return cachedLookup();
}

export { parseArchivePageNumber, countEligibleSitemapPosts } from "./news-sitemap-shared.js";
