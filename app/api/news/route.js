import { createClient } from "@supabase/supabase-js";
import { CACHE_PUBLIC_CONTENT, jsonError, jsonOk } from "../../../lib/api-response";
import { runApiRoute } from "../../../lib/api-route";
import {
  NEWS_API_CACHE_MS,
  NEWS_LIST_MAX_PAGE_SIZE,
  NEWS_LIST_PAGE_SIZE,
} from "../../../lib/public-cache-config";
import { withReadCache } from "../../../lib/server-read-cache";
import { NEWS_LIST_COLUMNS } from "../../../lib/supabase-query-columns";

export const dynamic = "force-dynamic";

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

function parsePagination(searchParams) {
  const requestedLimit = Number.parseInt(String(searchParams.get("limit") || NEWS_LIST_PAGE_SIZE), 10);
  const requestedOffset = Number.parseInt(String(searchParams.get("offset") || "0"), 10);

  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), NEWS_LIST_MAX_PAGE_SIZE)
    : NEWS_LIST_PAGE_SIZE;
  const offset = Number.isFinite(requestedOffset) ? Math.max(requestedOffset, 0) : 0;

  return { limit, offset };
}

export async function GET(request) {
  return runApiRoute(request, {
    route: "/api/news",
    handler: async (req, logContext) => {
      try {
        const { limit, offset } = parsePagination(req.nextUrl.searchParams);
        const cacheKey = `public:news:list:${limit}:${offset}`;

        const { data } = await withReadCache(cacheKey, NEWS_API_CACHE_MS, async () => {
          const supabase = getSupabaseClient();
          const rangeEnd = offset + limit - 1;

          const { data: rows, error, count } = await supabase
            .from("news_posts")
            .select(NEWS_LIST_COLUMNS, { count: "exact" })
            .order("created_at", { ascending: false })
            .range(offset, rangeEnd);

          if (error) {
            throw new Error(error.message || "تعذر تحميل الأخبار.");
          }

          return {
            success: true,
            items: rows || [],
            pagination: {
              limit,
              offset,
              count: typeof count === "number" ? count : null,
              hasMore:
                typeof count === "number"
                  ? offset + (rows?.length || 0) < count
                  : (rows?.length || 0) === limit,
            },
          };
        });

        return jsonOk(data, { cacheControl: CACHE_PUBLIC_CONTENT });
      } catch (error) {
        return jsonError(error, 500, {
          logContext: { ...logContext, forceLog: true },
        });
      }
    },
  });
}
