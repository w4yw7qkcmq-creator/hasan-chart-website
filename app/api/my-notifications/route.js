import { CACHE_PRIVATE_USER, jsonError, jsonOk } from "../../../lib/api-response";
import { runApiRoute } from "../../../lib/api-route";
import { enforceRateLimit } from "../../../lib/enforce-rate-limit";
import { requireSessionEmail } from "../../../lib/auth-session";
import { userReadLimiter } from "../../../lib/rate-limit";
import { normalizeNotification } from "../../../lib/notifications-shared";
import { withReadCache } from "../../../lib/server-read-cache";

export async function GET(request) {
  return runApiRoute(request, {
    route: "/api/my-notifications",
    handler: async (req, logContext) => {
      try {
        const session = await requireSessionEmail();

        if (session.error) {
          return jsonError("يجب تسجيل الدخول.", 401, {
            logContext: { ...logContext, forceLog: false },
            exposeMessage: true,
          });
        }

        const { email, supabase } = session;
        const rateLimited = await enforceRateLimit(userReadLimiter, email);
        if (rateLimited) return rateLimited;

        const { searchParams } = new URL(req.url);
        const includeRead = searchParams.get("include_read") === "1";
        const limit = Math.min(Math.max(Number(searchParams.get("limit") || 20), 1), 50);
        const cacheKey = `notifications:${email}:${includeRead ? "all" : "unread"}:${limit}`;

        const { data } = await withReadCache(cacheKey, 8_000, async () => {
          let query = supabase
            .from("notifications")
            .select("*")
            .eq("user_email", email)
            .order("created_at", { ascending: false })
            .limit(limit);

          if (!includeRead) {
            query = query.eq("is_read", false);
          }

          const { data: rows, error } = await query;

          if (error) {
            throw new Error(error.message);
          }

          const { count: unreadCount, error: countError } = await supabase
            .from("notifications")
            .select("*", { count: "exact", head: true })
            .eq("user_email", email)
            .eq("is_read", false);

          if (countError) {
            throw new Error(countError.message);
          }

          return {
            notifications: (rows || []).map(normalizeNotification).filter(Boolean),
            unreadCount: unreadCount || 0,
          };
        });

        return jsonOk(data, {
          cacheControl: CACHE_PRIVATE_USER,
          extraHeaders: logContext.requestId
            ? { "x-request-id": logContext.requestId }
            : {},
        });
      } catch (error) {
        return jsonError(error, 500, {
          logContext: {
            ...logContext,
            userEmail: logContext.userEmail,
            forceLog: true,
          },
        });
      }
    },
  });
}
