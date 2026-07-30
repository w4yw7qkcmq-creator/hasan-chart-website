import { CACHE_NO_STORE, jsonResponse } from "../../../../lib/api-response";
import { fetchFearGreedIndex } from "../../../../lib/market-data/fear-greed";
import { fetchCoinMarketCapFearGreed } from "../../../../lib/market-data/sentiment/coinmarketcap-fear-greed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

export async function GET(request) {
  const source = new URL(request.url).searchParams.get("source");

  if (source === "coinmarketcap") {
    const payload = await fetchCoinMarketCapFearGreed();
    return jsonResponse(payload, {
      status: payload.success === false && payload.value == null ? 503 : 200,
      cacheControl: CACHE_NO_STORE,
    });
  }

  const payload = await fetchFearGreedIndex();

  return jsonResponse(payload, {
    status: payload.success === false && !payload.current ? 503 : 200,
    cacheControl: CACHE_NO_STORE,
  });
}
