import { getOptionalSessionUser } from "../../../lib/auth-session";
import { CACHE_NO_STORE } from "../../../lib/api-response";
import { runApiRoute } from "../../../lib/api-route";
import {
  buildAvailabilityResponse,
  normalizeInstantAnalysisSymbol,
} from "../../../lib/instant-analysis-cooldown";
import {
  confirmInstantAnalysisJob,
  getInstantAnalysisAvailability,
  releaseInstantAnalysisReservation,
  reserveInstantAnalysisRequest,
  updateInstantAnalysisRequestStatus,
} from "../../../lib/instant-analysis-store";
import {
  forwardInstantAnalysisRequest,
  instantAnalysisErrorResponse,
} from "../../../lib/instant-analysis-worker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const safeJson = async (request) => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};

export async function POST(request) {
  return runApiRoute(request, {
    route: "/api/instant-analysis",
    handler: async (req) => {
      const session = await getOptionalSessionUser();

      if (!session) {
        return instantAnalysisErrorResponse({
          status: 401,
          code: "AUTH_REQUIRED",
          message: "يجب تسجيل الدخول لاستخدام التحليل اللحظي.",
        });
      }

      const body = await safeJson(req);
      const symbol = normalizeInstantAnalysisSymbol(body?.symbol);

      if (!symbol) {
        return instantAnalysisErrorResponse({
          status: 400,
          code: "SYMBOL_INVALID",
          message: "رمز العملة غير صالح.",
        });
      }

      const reservation = await reserveInstantAnalysisRequest(session.id, symbol);

      if (!reservation.ok) {
        const status =
          reservation.code === "INSTANT_ANALYSIS_COOLDOWN" ||
          reservation.code === "INSTANT_ANALYSIS_IN_PROGRESS"
            ? 429
            : 503;

        return instantAnalysisErrorResponse({
          status,
          code: reservation.code,
          message:
            reservation.code === "INSTANT_ANALYSIS_COOLDOWN"
              ? "يمكنك طلب تحليل لحظي واحد فقط كل ساعة."
              : reservation.message || "خدمة التحليل اللحظي غير متاحة مؤقتاً. يرجى المحاولة بعد قليل.",
          retryAfterSeconds: reservation.retryAfterSeconds,
          nextAllowedAt: reservation.nextAllowedAt,
          details: reservation.details,
        });
      }

      const result = await forwardInstantAnalysisRequest("/api/instant-analysis", {
        method: "POST",
        body: {
          ...body,
          symbol,
          requestId: reservation.requestId,
          source: body?.source || "my-dashboard",
        },
      });

      if (!result.ok || !result.data?.success) {
        await releaseInstantAnalysisReservation(
          reservation.requestId,
          session.id,
          result.code || "WORKER_UNAVAILABLE"
        );

        return instantAnalysisErrorResponse({
          status: result.status || 503,
          code: result.code || "WORKER_UNAVAILABLE",
          message: result.message,
          details: result.details,
        });
      }

      const jobId = result.data?.jobId ? String(result.data.jobId).trim() : "";

      if (jobId) {
        await confirmInstantAnalysisJob(reservation.requestId, session.id, jobId);
        const supabase = (await import("../../../lib/auth-session.js")).getSupabaseAdmin();
        const { emitTrustedQualificationActivity, ACTIVITY_EVENT_TYPES } = await import(
          "../../../lib/partner-center/qualification-activity.js"
        );
        emitTrustedQualificationActivity(supabase, {
          referredUserId: session.id,
          activityType: ACTIVITY_EVENT_TYPES.INSTANT_ANALYSIS,
          sourceEntityId: jobId,
          payload: { symbol },
        });
      } else if (result.data?.result) {
        const inlineJobId = `inline:${reservation.requestId}`;
        const inlineConfirm = await confirmInstantAnalysisJob(
          reservation.requestId,
          session.id,
          inlineJobId
        );

        if (inlineConfirm.ok) {
          await updateInstantAnalysisRequestStatus(
            reservation.requestId,
            session.id,
            "completed"
          );
          const supabase = (await import("../../../lib/auth-session.js")).getSupabaseAdmin();
          const { emitTrustedQualificationActivity, ACTIVITY_EVENT_TYPES } = await import(
            "../../../lib/partner-center/qualification-activity.js"
          );
          emitTrustedQualificationActivity(supabase, {
            referredUserId: session.id,
            activityType: ACTIVITY_EVENT_TYPES.INSTANT_ANALYSIS,
            sourceEntityId: inlineJobId,
            payload: { symbol, inline: true },
          });
        }

        const availabilityResult = await getInstantAnalysisAvailability(session.id);
        const availability = availabilityResult.ok
          ? availabilityResult.availability
          : { allowed: false, retryAfterSeconds: 3600, nextAllowedAt: null };

        return Response.json(
          {
            success: true,
            result: result.data.result,
            availability: buildAvailabilityResponse(availability),
          },
          {
            status: 200,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Cache-Control": CACHE_NO_STORE,
            },
          }
        );
      } else {
        await releaseInstantAnalysisReservation(
          reservation.requestId,
          session.id,
          "WORKER_NO_JOB_ID"
        );

        return instantAnalysisErrorResponse({
          status: 502,
          code: "WORKER_NO_JOB_ID",
          message: "خدمة التحليل اللحظي غير متاحة مؤقتاً. يرجى المحاولة بعد قليل.",
        });
      }

      const availabilityResult = await getInstantAnalysisAvailability(session.id);
      const availability = availabilityResult.ok
        ? availabilityResult.availability
        : { allowed: false, retryAfterSeconds: 3600, nextAllowedAt: null };

      return Response.json(
        {
          ...result.data,
          availability: buildAvailabilityResponse(availability),
        },
        {
          status: result.status,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": CACHE_NO_STORE,
          },
        }
      );
    },
  });
}
