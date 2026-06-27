import { startMarketStream } from "../../../lib/okx-market-stream";
import {
  CACHE_PUBLIC_MARKET,
  jsonError,
  jsonResponse,
} from "../../../lib/api-response";
import { runApiRoute } from "../../../lib/api-route";
import { enforceRateLimit } from "../../../lib/enforce-rate-limit";
import { getClientIp, marketPulseLimiter } from "../../../lib/rate-limit";
import { getCachedMarketPulse } from "../../../lib/server-market-cache";

function isAuthenticatedRequest(request) {
  return Boolean(request.cookies.get("hc_access_token")?.value);
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  return runApiRoute(request, {
    route: "/api/market-pulse",
    handler: async (req, logContext) => {
      startMarketStream("api-market-pulse");

      if (isAuthenticatedRequest(req)) {
        const rateLimited = await enforceRateLimit(
          marketPulseLimiter,
          getClientIp(req)
        );
        if (rateLimited) return rateLimited;
      }

      try {
        const snapshot = await getCachedMarketPulse();

        return jsonResponse(
          {
            success: true,
            prices: snapshot.prices,
            stale: Boolean(snapshot.stale),
            cachedAt: snapshot.cachedAt || null,
            source: snapshot.source || "shared-memory",
          },
          {
            cacheControl: CACHE_PUBLIC_MARKET,
            extraHeaders: logContext.requestId
              ? { "x-request-id": logContext.requestId }
              : {},
          }
        );
      } catch (error) {
        return jsonError(error, 502, {
          logContext: { ...logContext, forceLog: true },
        });
      }
    },
  });
}
