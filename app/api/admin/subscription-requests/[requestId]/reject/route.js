import { verifyAdminSession } from "../../../../../../lib/admin-auth";
import {
  assertAdminSubscriptionRejectAuthorized,
  validateSubscriptionRejectPayload,
} from "../../../../../../lib/admin-subscription-request-reject-shared.js";
import { rejectSubscriptionRequest } from "../../../../../../lib/admin-subscription-request-reject.js";
import { CACHE_NO_STORE } from "../../../../../../lib/api-response";
import { enforceRateLimit } from "../../../../../../lib/enforce-rate-limit";
import { adminMutationLimiter } from "../../../../../../lib/rate-limit";
import { requireValidUuid } from "../../../../../../lib/partner-security";

export const dynamic = "force-dynamic";

export async function POST(request, context) {
  try {
    const adminCheck = await verifyAdminSession();
    assertAdminSubscriptionRejectAuthorized(adminCheck);

    const rateLimited = await enforceRateLimit(
      adminMutationLimiter,
      String(adminCheck.user?.email || "admin").toLowerCase()
    );
    if (rateLimited) return rateLimited;

    const params = await context.params;
    let requestId;

    try {
      requestId = requireValidUuid(params?.requestId, "requestId");
    } catch {
      return Response.json(
        { success: false, error: "معرّف طلب الاشتراك غير صالح" },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { rejectionReason, rejectionNotes } = validateSubscriptionRejectPayload(body);

    const result = await rejectSubscriptionRequest(adminCheck.supabase, {
      adminUser: adminCheck.user,
      requestId,
      rejectionReason,
      rejectionNotes,
    });

    return Response.json(
      {
        success: true,
        message: result.notificationWarning || "تم رفض طلب الاشتراك",
        warning: result.notificationWarning || null,
        ...result,
      },
      {
        headers: {
          "Cache-Control": CACHE_NO_STORE,
        },
      }
    );
  } catch (error) {
    console.error("ADMIN_SUBSCRIPTION_REJECT_ERROR", error?.message || error);

    return Response.json(
      {
        success: false,
        error: error?.message || "تعذر رفض طلب الاشتراك",
      },
      { status: error?.status || 500 }
    );
  }
}
