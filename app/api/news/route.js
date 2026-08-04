import { createClient } from "@supabase/supabase-js";
import { CACHE_PUBLIC_CONTENT, jsonError, jsonOk } from "../../../lib/api-response";
import { runApiRoute } from "../../../lib/api-route";
import {
  applyCreatedAtIdCursor,
  buildPaginationResult,
  decodeCursor,
  parseLimit,
  parseOffset,
} from "../../../lib/pagination.js";
import {
  NEWS_API_CACHE_MS,
  NEWS_LIST_MAX_PAGE_SIZE,
  NEWS_LIST_PAGE_SIZE,
} from "../../../lib/public-cache-config";
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
  const search = String(searchParams.get("search") || searchParams.get("q") || "").trim();

  if (search.length > 0 && search.length < 2) {
    const error = new Error("Search query must be at least 2 characters");
    error.statusCode = 400;
    throw error;
  }

  if (cursor) {
    decodeCursor(cursor);
  }

  return { limit, cursor, offset, includeTotal, search };
}

async function fetchNewsList({ limit, cursor, offset, includeTotal, search }) {
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

  if (cursor) {
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

  return {
    success: true,
    items,
    posts: items,
    pagination,
  };
}

export async function GET(request) {
  return runApiRoute(request, {
    route: "/api/news",
    handler: async (req, logContext) => {
      try {
        const params = parseListParams(req.nextUrl.searchParams);
        const cacheKey = `public:news:list:${params.limit}:${params.cursor || `offset:${params.offset}`}:${params.search}:${params.includeTotal}`;

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
