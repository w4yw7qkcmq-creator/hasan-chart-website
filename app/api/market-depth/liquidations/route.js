import { CACHE_PUBLIC_MARKET, jsonResponse } from "../../../../lib/api-response";
import {
  createEmptyLiquidationsPayload,
  getCoinglassLiquidations,
} from "../../../../lib/market-data/liquidations/coinglass-public-source";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const payload = await getCoinglassLiquidations();

    return jsonResponse(
      {
        success: true,
        available: true,
        ...payload,
      },
      { cacheControl: CACHE_PUBLIC_MARKET },
    );
  } catch {
    return jsonResponse(
      {
        success: false,
        available: false,
        error: "LIQUIDATIONS_UNAVAILABLE",
        message: "بيانات التصفيات غير متاحة مؤقتًا.",
        ...createEmptyLiquidationsPayload({ stale: false }),
      },
      { status: 200, cacheControl: CACHE_PUBLIC_MARKET },
    );
  }
}
