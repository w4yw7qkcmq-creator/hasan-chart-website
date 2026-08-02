import { getOptionalSessionUser } from "../../../../lib/auth-session";
import { CACHE_NO_STORE } from "../../../../lib/api-response";
import { runApiRoute } from "../../../../lib/api-route";
import { buildAvailabilityResponse } from "../../../../lib/instant-analysis-cooldown";
import { getInstantAnalysisAvailability } from "../../../../lib/instant-analysis-store";
import { instantAnalysisErrorResponse } from "../../../../lib/instant-analysis-worker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  return runApiRoute(request, {
    route: "/api/instant-analysis/availability",
    handler: async () => {
      const session = await getOptionalSessionUser();

      if (!session) {
        return instantAnalysisErrorResponse({
          status: 401,
          code: "AUTH_REQUIRED",
          message: "يجب تسجيل الدخول لاستخدام التحليل اللحظي.",
        });
      }

      const result = await getInstantAnalysisAvailability(session.id);

      if (!result.ok) {
        return instantAnalysisErrorResponse({
          status: 503,
          code: result.code,
          message: result.message,
          details: result.details,
        });
      }

      return Response.json(buildAvailabilityResponse(result.availability), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": CACHE_NO_STORE,
        },
      });
    },
  });
}
