import { verifyAdminSession } from "../../../../../../lib/admin-auth";
import { assertAdminSubscriptionRemoveAuthorized } from "../../../../../../lib/admin-subscription-request-remove-shared.js";
import { requireValidSubscriptionRequestId } from "../../../../../../lib/id-validation.js";
import { removeSubscriptionRequest } from "../../../../../../lib/admin-subscription-request-remove.js";
import { validateSubscriptionRemovePayload } from "../../../../../../lib/admin-subscription-request-remove-shared.js";
import { CACHE_NO_STORE } from "../../../../../../lib/api-response";
import { enforceRateLimit } from "../../../../../../lib/enforce-rate-limit";
import { adminMutationLimiter } from "../../../../../../lib/rate-limit";

export const dynamic = "force-dynamic";

const REMOVE_ERROR_CODES = {
  400: "INVALID_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "STATUS_CONFLICT",
  429: "RATE_LIMITED",
  500: "REMOVE_FAILED",
};

function resolveRemoveErrorCode(status) {
  return REMOVE_ERROR_CODES[status] || "REMOVE_FAILED";
}

export async function POST(request, context) {
  const startedAt = Date.now();
  let stage = "start";
  let requestId = null;

  console.info("SUBSCRIPTION_REMOVE_START", { requestId: requestId || "pending" });

  try {
    stage = "auth";
    const adminCheck = await verifyAdminSession();
    assertAdminSubscriptionRemoveAuthorized(adminCheck);

    const rateLimited = await enforceRateLimit(
      adminMutationLimiter,
      String(adminCheck.user?.email || "admin").toLowerCase()
    );
    if (rateLimited) {
      return rateLimited;
    }

    stage = "validation";
    const params = await context.params;

    try {
      requestId = requireValidSubscriptionRequestId(params?.requestId, "requestId");
    } catch {
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
    const { removalNotes } = validateSubscriptionRemovePayload(body);
    console.info("SUBSCRIPTION_REMOVE_VALIDATION_OK", { requestId });

    stage = "remove";
    const result = await removeSubscriptionRequest(adminCheck.supabase, {
      adminUser: adminCheck.user,
      requestId,
      removalNotes,
    });

    const warnings = [
      result.profileReconcileWarning,
      result.notificationWarning,
      result.emailWarning,
      result.auditWarning,
      ...(Array.isArray(result.warnings) ? result.warnings : []),
    ].filter(Boolean);

    console.info("SUBSCRIPTION_REMOVE_RESPONSE", {
      requestId,
      durationMs: Date.now() - startedAt,
      notificationCreated: result.notificationCreated,
      emailQueued: result.emailQueued,
      auditLogged: result.auditLogged,
      profileReconciled: result.profileReconciled,
      warningsCount: warnings.length,
    });

    return Response.json(
      {
        success: true,
        message: "تم إزالة الاشتراك",
        warnings,
        profileReconciled: Boolean(result.profileReconciled),
        hasOtherActiveSameService: Boolean(result.hasOtherActiveSameService),
        notificationCreated: Boolean(result.notificationCreated),
        emailQueued: Boolean(result.emailQueued),
        auditLogged: Boolean(result.auditLogged),
        warning: warnings[0] || null,
        requestId: result.requestId,
        status: result.status,
        previousStatus: result.previousStatus,
        removalDetails: result.removalDetails,
      },
      {
        headers: {
          "Cache-Control": CACHE_NO_STORE,
        },
      }
    );
  } catch (error) {
    const statusCode = error?.status || 500;

    console.error("SUBSCRIPTION_REMOVE_FAILED", {
      stage,
      requestId,
      statusCode,
      error: error?.message || String(error),
      stack: error?.stack,
    });

    return Response.json(
      {
        success: false,
        errorCode: resolveRemoveErrorCode(statusCode),
        error: error?.message || "تعذر إزالة الاشتراك",
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
