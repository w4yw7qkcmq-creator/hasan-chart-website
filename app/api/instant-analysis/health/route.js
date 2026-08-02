import { CACHE_NO_STORE } from "../../../../lib/api-response";
import { runApiRoute } from "../../../../lib/api-route";
import { probeInstantAnalysisWorkerHealth } from "../../../../lib/instant-analysis-worker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  return runApiRoute(request, {
    route: "/api/instant-analysis/health",
    handler: async () => {
      const report = await probeInstantAnalysisWorkerHealth();

      return Response.json(report, {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": CACHE_NO_STORE,
        },
      });
    },
  });
}
