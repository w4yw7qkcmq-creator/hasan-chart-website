import { createClient } from "@supabase/supabase-js";
import { jsonError, jsonOk } from "../../../lib/api-response";
import { runApiRoute } from "../../../lib/api-route";
import { enforceRateLimit } from "../../../lib/enforce-rate-limit";
import {
  applyCreatedAtIdCursor,
  applyNewerThanCreatedAtIdCursor,
  buildPaginationResult,
  decodeCursor,
  parseDeltaRefreshParams,
  parseLimit,
  parseOffset,
} from "../../../lib/pagination.js";
import {
  NEWS_API_CACHE_MS,
  NEWS_LIST_MAX_PAGE_SIZE,
  NEWS_LIST_PAGE_SIZE,
} from "../../../lib/public-cache-config";
import { getClientIp, publicNewsIpLimiter } from "../../../lib/rate-limit";
import { withReadCache } from "../../../lib/server-read-cache";
import { NEWS_LIST_COLUMNS } from "../../../lib/supabase-query-columns";
import { instrumentSupabaseClient } from "../../../lib/supabase-dev-metrics";

export const dynamic = "force-dynamic";

const CACHE_NEWS_LIST = "public, max-age=30, s-maxage=30, stale-while-revalidate=60";

function getSupabaseClient() {
  return instrumentSupabaseClient(
    createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )
  );
}

function parseListParams(searchParams) {
  const limit = parseLimit(searchParams.get("limit"), {
    defaultLimit: NEWS_LIST_PAGE_SIZE,
    maxLimit: NEWS_LIST_MAX_PAGE_SIZE,
  });
  const cursor = String(searchParams.get("cursor") || "").trim() || null;
  const offset = parseOffset(searchParams.get("offset"));
  const includeTotal = searchParams.get("includeTotal") === "true";
  const legacyPosts = searchParams.get("legacyPosts") === "true";
  const search = String(searchParams.get("search") || searchParams.get("q") || "").trim();
  const delta = parseDeltaRefreshParams(searchParams);

  if (search.length > 0 && search.length < 2) {
    const error = new Error("Search query must be at least 2 characters");
    error.statusCode = 400;
    throw error;
  }

  if (cursor) {
    decodeCursor(cursor);
  }

  if (delta && cursor) {
    const error = new Error("cursor cannot be combined with afterCreatedAt/afterId");
    error.statusCode = 400;
    throw error;
  }

  return { limit, cursor, offset, includeTotal, legacyPosts, search, delta };
}

function buildNewsListResponse({ items, pagination, legacyPosts }) {
  const body = {
    success: true,
    items,
    pagination,
  };

  if (legacyPosts) {
    body.posts = items;
  }

  return body;
}

async function fetchNewsList({ limit, cursor, offset, includeTotal, legacyPosts, search, delta }) {
  const supabase = getSupabaseClient();
  const fetchLimit = limit + 1;

  let query = supabase
    .from("news_posts")
    .select(NEWS_LIST_COLUMNS, includeTotal ? { count: "exact" } : undefined)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (search.length >= 2) {
    const escaped = search.replace(/[%_,]/g, " ");
    query = query.or(`title.ilike.%${escaped}%,slug.ilike.%${escaped}%`);
  }

  if (delta) {
    query = applyNewerThanCreatedAtIdCursor(query, delta);
    query = query.limit(fetchLimit);
  } else if (cursor) {
    query = applyCreatedAtIdCursor(query, cursor);
    query = query.limit(fetchLimit);
  } else {
    query = query.range(offset, offset + limit);
  }

  const { data, error, count } = await query;

  if (error) {
    throw new Error(error.message || "تعذر تحميل الأخبار.");
  }

  const rows = data || [];
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];

  const pagination = {
    limit,
    hasMore,
    nextCursor:
      hasMore && last?.created_at && last?.id
        ? buildPaginationResult(rows, limit).pagination.nextCursor
        : null,
  };

  if (offset > 0) {
    pagination.offset = offset;
  }

  if (includeTotal && typeof count === "number") {
    pagination.total = count;
  }

  return buildNewsListResponse({ items, pagination, legacyPosts });
}

function buildNewsListCacheKey(params) {
  const deltaKey = params.delta
    ? `after:${params.delta.afterCreatedAt}:${params.delta.afterId}`
    : params.cursor || `offset:${params.offset}`;

  return `public:news:list:${params.limit}:${deltaKey}:${params.search}:${params.includeTotal}:legacy:${params.legacyPosts}`;
}

export async function GET(request) {
  return runApiRoute(request, {
    route: "/api/news",
    handler: async (req, logContext) => {
      try {
        const rateLimited = await enforceRateLimit(publicNewsIpLimiter, getClientIp(req));
        if (rateLimited) return rateLimited;

        const params = parseListParams(req.nextUrl.searchParams);

        if (params.delta) {
          const data = await fetchNewsList(params);
          return jsonOk(data, { cacheControl: CACHE_NEWS_LIST });
        }

        const cacheKey = buildNewsListCacheKey(params);
        const { data } = await withReadCache(cacheKey, NEWS_API_CACHE_MS, async () => fetchNewsList(params));

        return jsonOk(data, { cacheControl: CACHE_NEWS_LIST });
      } catch (error) {
        if (error?.code === "INVALID_CURSOR" || error?.statusCode === 400) {
          return jsonError(error, 400, { logContext });
        }
        return jsonError(error, 500, {
          logContext: { ...logContext, forceLog: true },
        });
      }
    },
  });
}
