import { requireSessionUser } from "../../../../lib/auth-session";
import { enforceRateLimit } from "../../../../lib/enforce-rate-limit";
import { deleteOwnedPushSubscription } from "../../../../lib/push-subscriptions-server";
import { getClientIp, pushSubscribeLimiter, pushUnsubscribeIpLimiter } from "../../../../lib/rate-limit";
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

    const session = await requireSessionUser();

    if (session.error) {
      return Response.json(
        {
          success: false,
          error: "يجب تسجيل الدخول قبل إلغاء اشتراك الإشعارات",
        },
        { status: 401 }
      );
    }

    const userRateLimited = await enforceRateLimit(pushSubscribeLimiter, session.id);

    if (userRateLimited) {
      return userRateLimited;
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

    const { error } = await deleteOwnedPushSubscription({
      userId: session.id,
      endpoint,
    });

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
