import { CACHE_NO_STORE, jsonResponse } from "../../../../../lib/api-response";
import { enforceRateLimit } from "../../../../../lib/enforce-rate-limit";
import { validateHistoryLiquidityWallsQuery } from "../../../../../lib/market-data/history/history-api-validation.js";
import { createHistoryQueryClient } from "../../../../../lib/market-data/history/history-query.js";
import { getLiquidityWallWriterStatus } from "../../../../../lib/market-data/history/liquidity-walls/liquidity-wall-recorder.js";
import { queryHistoricalLiquidityWalls } from "../../../../../lib/market-data/history/liquidity-walls/liquidity-wall-query.js";
import { marketHistoryLimiter, getClientIp } from "../../../../../lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CACHE_CONTROL = "public, max-age=30, s-maxage=30, stale-while-revalidate=60";

export async function GET(request) {
  try {
    const rateLimited = await enforceRateLimit(
      marketHistoryLimiter,
      getClientIp(request),
    );
    if (rateLimited) return rateLimited;

    const validation = validateHistoryLiquidityWallsQuery(new URL(request.url).searchParams);
    if (!validation.valid) {
      return jsonResponse(
        { success: false, error: validation.error },
        { status: 400, cacheControl: CACHE_NO_STORE },
      );
    }

    const writerStatus = getLiquidityWallWriterStatus();
    const client = createHistoryQueryClient();
    const payload = await queryHistoricalLiquidityWalls({
      client,
      ...validation.params,
      collectingSince: writerStatus.collectingSince ?? null,
    });

    return jsonResponse(payload, {
      status: 200,
      cacheControl: CACHE_CONTROL,
    });
  } catch {
    return jsonResponse(
      {
        success: false,
        error: "MARKET_HISTORY_LIQUIDITY_WALLS_FAILED",
        messageSafe: "history_query_failed",
      },
      { status: 500, cacheControl: CACHE_NO_STORE },
    );
  }
}
