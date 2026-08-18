import { CACHE_NO_STORE, jsonResponse } from "../../../../lib/api-response";
import { getSharedMarketDepthSnapshot } from "../../../../lib/market-data/market-depth-hub";
import {
  ensureMarketDepthConsumer,
  releaseMarketDepthConsumer,
} from "../../../../lib/market-data/market-depth-lifecycle";
import { validateMarketDepthQuery, assertNoMockInProduction, ensureMarketSymbolsRegistry } from "../../../../lib/market-data/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request) {
  const consumerReason = "api-market-depth-snapshot";

  try {
    assertNoMockInProduction();
    await ensureMarketSymbolsRegistry();
    await ensureMarketDepthConsumer(consumerReason);

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
  } finally {
    releaseMarketDepthConsumer(consumerReason);
  }
}
