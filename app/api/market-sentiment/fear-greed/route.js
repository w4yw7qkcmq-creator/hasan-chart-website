import { CACHE_NO_STORE, jsonResponse } from "../../../../lib/api-response";
import { fetchFearGreedIndex } from "../../../../lib/market-data/fear-greed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

export async function GET() {
  const payload = await fetchFearGreedIndex();

  return jsonResponse(payload, {
    status: payload.success === false && !payload.current ? 503 : 200,
    cacheControl: CACHE_NO_STORE,
  });
}
