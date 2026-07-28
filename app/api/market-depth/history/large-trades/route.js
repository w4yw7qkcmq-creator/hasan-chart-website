import { CACHE_NO_STORE, jsonResponse } from "../../../../../lib/api-response";
import { enforceRateLimit } from "../../../../../lib/enforce-rate-limit";
import { getHistoryWriterStatus } from "../../../../../lib/market-data/history/historical-market-recorder.js";
import { validateHistoryLargeTradesQuery } from "../../../../../lib/market-data/history/history-api-validation.js";
import {
  createHistoryQueryClient,
  queryHistoricalLargeTrades,
} from "../../../../../lib/market-data/history/history-query.js";
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

    const validation = validateHistoryLargeTradesQuery(new URL(request.url).searchParams);
    if (!validation.valid) {
      return jsonResponse(
        { success: false, error: validation.error },
        { status: 400, cacheControl: CACHE_NO_STORE },
      );
    }

    const writerStatus = getHistoryWriterStatus();
    const client = createHistoryQueryClient();
    const payload = await queryHistoricalLargeTrades({
      client,
      ...validation.params,
      collectingSince: writerStatus.collectingSince ?? null,
    });

    return jsonResponse(payload, {
      status: 200,
      cacheControl: CACHE_CONTROL,
    });
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error: "MARKET_HISTORY_LARGE_TRADES_FAILED",
        messageSafe: "history_query_failed",
      },
      { status: 500, cacheControl: CACHE_NO_STORE },
    );
  }
}
