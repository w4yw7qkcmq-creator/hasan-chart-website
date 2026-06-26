import { CACHE_PRIVATE_USER, jsonError, jsonResponse } from "../../../lib/api-response";
import { enforceRateLimit } from "../../../lib/enforce-rate-limit";
import { requireSessionEmail } from "../../../lib/auth-session";
import { userReadLimiter } from "../../../lib/rate-limit";
import { buildSubscriptionStatusResponse } from "../../../lib/subscription-mode";
import { withReadCache } from "../../../lib/server-read-cache";

export async function GET() {
  try {
    const session = await requireSessionEmail();

    if (session.error) {
      return jsonError("يجب تسجيل الدخول.", 401);
    }

    const { email, supabase } = session;
    const rateLimited = await enforceRateLimit(userReadLimiter, email);
    if (rateLimited) return rateLimited;

    const { data } = await withReadCache(`subscription-status:${email}`, 10_000, async () => {
      const { data: rows, error } = await supabase
        .from("subscription_requests")
        .select("id,plan_name,category,price,status,started_at,expires_at,created_at")
        .eq("user_email", email)
        .eq("status", "مفعل")
        .order("created_at", { ascending: false });

      if (error) {
        throw new Error(error.message);
      }

      return buildSubscriptionStatusResponse(rows);
    });

    return jsonResponse(data, { cacheControl: CACHE_PRIVATE_USER });
  } catch (err) {
    return jsonError(err?.message || "Server Error", 500);
  }
}
