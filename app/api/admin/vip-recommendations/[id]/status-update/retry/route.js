import { IAM_PERMISSIONS } from "../../../../../../../lib/iam/constants";
import { enforceRateLimit } from "../../../../../../../lib/enforce-rate-limit";
import { adminMutationLimiter } from "../../../../../../../lib/rate-limit";
import { requireAllPermissions } from "../../../../../../../lib/iam/require-permission.js";
import { retryFailedVipStatusDeliveries } from "../../../../../../../lib/vip-recommendation-status-dispatch.js";
import { VIP_STATUS_EVENT_TYPES } from "../../../../../../../lib/vip-recommendation-status-copy.js";
import {
  isVipStatusNotificationsEnabled,
  vipStatusFeatureDisabledResponse,
} from "../../../../../../../lib/vip-status-feature-flag.js";

export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  try {
    if (!isVipStatusNotificationsEnabled()) {
      const disabled = vipStatusFeatureDisabledResponse();
      return Response.json(
        { success: false, error: disabled.error, code: disabled.code },
        { status: disabled.status }
      );
    }

    const adminCheck = await requireAllPermissions(
      [
        IAM_PERMISSIONS.RECOMMENDATIONS_STATUS_UPDATE,
        IAM_PERMISSIONS.RECOMMENDATIONS_NOTIFICATIONS_SEND,
      ],
      { request }
    );

    if (!adminCheck.ok) {
      return Response.json(
        { success: false, error: adminCheck.error },
        { status: adminCheck.status }
      );
    }

    const rateLimited = await enforceRateLimit(
      adminMutationLimiter,
      String(adminCheck.user?.email || "admin").toLowerCase()
    );
    if (rateLimited) return rateLimited;

    const recommendationId = String(params?.id || "").trim();
    if (!recommendationId) {
      return Response.json({ success: false, error: "معرف التوصية مطلوب" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const eventType = String(body?.eventType || "").trim();

    if (!VIP_STATUS_EVENT_TYPES.includes(eventType)) {
      return Response.json({ success: false, error: "eventType غير مدعوم" }, { status: 400 });
    }

    const requestId = String(
      body?.requestId || `vip-status-retry-${recommendationId}-${eventType}`
    ).trim();

    const result = await retryFailedVipStatusDeliveries(adminCheck.supabase, {
      recommendationId,
      eventType,
      adminUser: adminCheck.user,
      requestId,
    });

    if (!result.ok) {
      return Response.json(
        { success: false, error: result.error, code: result.status },
        { status: result.status || 500 }
      );
    }

    return Response.json(
      {
        success: true,
        accepted: result.accepted ?? !result.noOp,
        status: result.deliveryStatus || (result.noOp ? "noop" : "processing"),
        noOp: Boolean(result.noOp),
        partialFailure: result.partialFailure ?? false,
        summary: result.summary,
      },
      { status: result.status || 200 }
    );
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || "Internal error" },
      { status: 500 }
    );
  }
}
