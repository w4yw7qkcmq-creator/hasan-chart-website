import { getOptionalSessionUser } from "../../../../lib/auth-session";
import { CACHE_NO_STORE } from "../../../../lib/api-response";
import { runApiRoute } from "../../../../lib/api-route";
import {
  findInstantAnalysisRequestByJobId,
  updateInstantAnalysisRequestStatus,
} from "../../../../lib/instant-analysis-store";
import {
  forwardInstantAnalysisRequest,
  instantAnalysisErrorResponse,
  isInlineInstantAnalysisJobId,
  isWorkerInstantAnalysisJobId,
} from "../../../../lib/instant-analysis-worker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request, { params }) {
  const resolvedParams = await params;
  return runApiRoute(request, {
    route: "/api/instant-analysis/[jobId]",
    handler: async () => {
      const session = await getOptionalSessionUser();

      if (!session) {
        return instantAnalysisErrorResponse({
          status: 401,
          code: "AUTH_REQUIRED",
          message: "يجب تسجيل الدخول لاستخدام التحليل اللحظي.",
        });
      }

      const jobId = String(resolvedParams?.jobId || "").trim();

      if (isInlineInstantAnalysisJobId(jobId)) {
        return instantAnalysisErrorResponse({
          status: 400,
          code: "INLINE_JOB_NOT_POLLABLE",
          message: "تعذر قراءة نتيجة التحليل.",
        });
      }

      if (!isWorkerInstantAnalysisJobId(jobId)) {
        return instantAnalysisErrorResponse({
          status: 400,
          code: "INVALID_JOB_ID",
          message: "معرّف مهمة التحليل غير صالح.",
        });
      }

      const ownership = await findInstantAnalysisRequestByJobId(session.id, jobId);

      if (!ownership.ok) {
        return instantAnalysisErrorResponse({
          status: 404,
          code: "JOB_NOT_FOUND",
          message: "تعذر العثور على مهمة التحليل.",
        });
      }

      const result = await forwardInstantAnalysisRequest(
        `/api/instant-analysis/${encodeURIComponent(jobId)}`,
        {
          method: "GET",
        }
      );

      if (!result.ok) {
        return instantAnalysisErrorResponse({
          status: result.status,
          code: result.code,
          message: result.message,
          details: result.details,
        });
      }

      const workerStatus = String(result.data?.status || "").toLowerCase();

      if (workerStatus === "completed") {
        await updateInstantAnalysisRequestStatus(ownership.request.id, session.id, "completed");
      } else if (workerStatus === "failed") {
        await updateInstantAnalysisRequestStatus(
          ownership.request.id,
          session.id,
          "failed",
          result.data?.error || "ANALYSIS_FAILED"
        );
      }

      return Response.json(result.data, {
        status: result.status,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": CACHE_NO_STORE,
        },
      });
    },
  });
}
