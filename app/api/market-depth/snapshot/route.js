import { CACHE_NO_STORE, jsonResponse } from "../../../../lib/api-response";
import { getSharedMarketDepthSnapshot, startMarketDepth } from "../../../../lib/market-data/market-depth-hub";
import { validateMarketDepthQuery, assertNoMockInProduction } from "../../../../lib/market-data/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  try {
    assertNoMockInProduction();
    startMarketDepth("api-market-depth-snapshot");

    const validation = validateMarketDepthQuery(new URL(request.url).searchParams);
    if (!validation.valid) {
      return jsonResponse({ success: false, error: validation.error }, { status: 400, cacheControl: CACHE_NO_STORE });
    }

    const snapshot = getSharedMarketDepthSnapshot(validation.params);

    return jsonResponse(
      {
        success: true,
        ...snapshot,
      },
      { cacheControl: CACHE_NO_STORE }
    );
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error: error?.message || "MARKET_DEPTH_SNAPSHOT_FAILED",
      },
      { status: 500, cacheControl: CACHE_NO_STORE }
    );
  }
}
