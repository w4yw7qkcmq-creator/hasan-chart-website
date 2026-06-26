import { CACHE_NO_STORE, jsonResponse } from "../../../lib/api-response";
import { collectHealthReport } from "../../../lib/health-check";
import {
  buildApiErrorLogContext,
  logApiError,
  logApiRequest,
} from "../../../lib/structured-logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  const logContext = buildApiErrorLogContext(request, { route: "/api/health" });
  const startedAt = Date.now();

  try {
    const report = await collectHealthReport();
    const statusCode = report.status === "down" ? 503 : 200;

    logApiRequest({
      ...logContext,
      route: "/api/health",
      method: "GET",
      status: statusCode,
      responseTimeMs: Date.now() - startedAt,
      healthStatus: report.status,
    });

    return jsonResponse(
      {
        success: report.status !== "down",
        ...report,
      },
      {
        status: statusCode,
        cacheControl: CACHE_NO_STORE,
        extraHeaders: {
          "x-request-id": logContext.requestId || "",
        },
      }
    );
  } catch (error) {
    logApiError({
      ...logContext,
      route: "/api/health",
      method: "GET",
      responseTimeMs: Date.now() - startedAt,
      error: error?.message || String(error),
    });

    return jsonResponse(
      {
        success: false,
        status: "down",
        error: "تعذر إنشاء تقرير الصحة.",
        timestamp: new Date().toISOString(),
      },
      {
        status: 503,
        cacheControl: CACHE_NO_STORE,
      }
    );
  }
}
