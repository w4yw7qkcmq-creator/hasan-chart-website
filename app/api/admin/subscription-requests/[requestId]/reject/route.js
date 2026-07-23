import { verifyAdminSession } from "../../../../../../lib/admin-auth";
import {
  assertAdminSubscriptionRejectAuthorized,
  validateSubscriptionRejectPayload,
} from "../../../../../../lib/admin-subscription-request-reject-shared.js";
import { requireValidSubscriptionRequestId } from "../../../../../../lib/id-validation.js";
import { rejectSubscriptionRequest } from "../../../../../../lib/admin-subscription-request-reject.js";
import { CACHE_NO_STORE } from "../../../../../../lib/api-response";
import { enforceRateLimit } from "../../../../../../lib/enforce-rate-limit";
import { adminMutationLimiter } from "../../../../../../lib/rate-limit";

export const dynamic = "force-dynamic";

const REJECT_ERROR_CODES = {
  400: "INVALID_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "STATUS_CONFLICT",
  429: "RATE_LIMITED",
  500: "REJECT_FAILED",
};

function resolveRejectErrorCode(status) {
  return REJECT_ERROR_CODES[status] || "REJECT_FAILED";
}

export async function POST(request, context) {
  const startedAt = Date.now();
  let stage = "start";
  let requestId = null;

  console.info("SUBSCRIPTION_REJECT_START", { requestId: requestId || "pending" });

  try {
    stage = "auth";
    const adminCheck = await verifyAdminSession();
    assertAdminSubscriptionRejectAuthorized(adminCheck);

    const rateLimited = await enforceRateLimit(
      adminMutationLimiter,
      String(adminCheck.user?.email || "admin").toLowerCase()
    );
    if (rateLimited) {
      console.error("SUBSCRIPTION_REJECT_FAILED", {
        stage: "rate-limit",
        requestId,
        statusCode: 429,
        error: "rate-limited",
      });
      return rateLimited;
    }

    stage = "validation";
    const params = await context.params;

    try {
      requestId = requireValidSubscriptionRequestId(params?.requestId, "requestId");
    } catch {
      console.error("SUBSCRIPTION_REJECT_FAILED", {
        stage,
        statusCode: 400,
        error: "invalid-request-id",
        validation: "subscription_request_id",
      });
      return Response.json(
        {
          success: false,
          errorCode: "INVALID_REQUEST_ID",
          error: "معرّف طلب الاشتراك غير صالح",
        },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { rejectionReason, rejectionNotes } = validateSubscriptionRejectPayload(body);
    console.info("SUBSCRIPTION_REJECT_VALIDATION_OK", { requestId });

    stage = "reject";
    const result = await rejectSubscriptionRequest(adminCheck.supabase, {
      adminUser: adminCheck.user,
      requestId,
      rejectionReason,
      rejectionNotes,
    });

    const warnings = [
      result.notificationWarning,
      result.emailWarning,
      result.auditWarning,
    ].filter(Boolean);

    console.info("SUBSCRIPTION_REJECT_RESPONSE", {
      requestId,
      durationMs: Date.now() - startedAt,
      notificationCreated: result.notificationCreated,
      emailQueued: result.emailQueued,
      auditLogged: result.auditLogged,
      warningsCount: warnings.length,
    });

    return Response.json(
      {
        success: true,
        message: "تم رفض طلب الاشتراك",
        warnings,
        notificationCreated: Boolean(result.notificationCreated),
        emailQueued: Boolean(result.emailQueued),
        auditLogged: Boolean(result.auditLogged),
        warning: warnings[0] || null,
        requestId: result.requestId,
        status: result.status,
        previousStatus: result.previousStatus,
        rejectionDetails: result.rejectionDetails,
      },
      {
        headers: {
          "Cache-Control": CACHE_NO_STORE,
        },
      }
    );
  } catch (error) {
    const statusCode = error?.status || 500;

    console.error("SUBSCRIPTION_REJECT_FAILED", {
      stage,
      requestId,
      statusCode,
      error: error?.message || String(error),
      supabaseCode: error?.code || null,
      stack: error?.stack,
    });

    return Response.json(
      {
        success: false,
        errorCode: resolveRejectErrorCode(statusCode),
        error: error?.message || "تعذر رفض طلب الاشتراك",
      },
      {
        status: statusCode,
        headers: {
          "Cache-Control": CACHE_NO_STORE,
        },
      }
    );
  }
}
