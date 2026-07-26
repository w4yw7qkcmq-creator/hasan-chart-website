import { getSupabaseAdmin } from "../../../../lib/auth-session";
import { enforceRateLimit } from "../../../../lib/enforce-rate-limit";
import { getClientIp, pushUnsubscribeIpLimiter } from "../../../../lib/rate-limit";
import { logApiError, logApiRequest } from "../../../../lib/structured-logger";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function POST(request) {
  try {
    const rateLimited = await enforceRateLimit(
      pushUnsubscribeIpLimiter,
      getClientIp(request)
    );

    if (rateLimited) {
      return rateLimited;
    }

    const body = await request.json().catch(() => null);
    const endpoint = String(body?.endpoint || "").trim();

    if (!endpoint) {
      return Response.json(
        {
          success: false,
          error: "endpoint مطلوب",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);

    if (error) {
      logApiError({
        route: "/api/push/unsubscribe",
        method: "POST",
        event: "PUSH_UNSUBSCRIBE_FAILED",
        error: error.message,
      });
      return Response.json(
        {
          success: false,
          error: "تعذر إلغاء اشتراك الإشعارات",
        },
        { status: 500 }
      );
    }

    logApiRequest({
      route: "/api/push/unsubscribe",
      method: "POST",
      event: "PUSH_UNSUBSCRIBE_SUCCESS",
    });

    return Response.json({
      success: true,
    });
  } catch (error) {
    logApiError({
      route: "/api/push/unsubscribe",
      method: "POST",
      event: "PUSH_UNSUBSCRIBE_ERROR",
      error: error?.message || String(error),
    });
    return Response.json(
      {
        success: false,
        error: "خطأ في الخادم",
      },
      { status: 500 }
    );
  }
}
