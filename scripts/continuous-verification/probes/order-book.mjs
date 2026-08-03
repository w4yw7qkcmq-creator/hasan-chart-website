import { ORDER_BOOK_MIN_CONNECTED, ORDER_BOOK_WARMUP_MS } from "../config.mjs";
import { withRetry } from "../retry.mjs";

export async function runOrderBook(ctx) {
  const t0 = Date.now();
  return withRetry(async () => {
    const deadline = Date.now() + ORDER_BOOK_WARMUP_MS;
    let last = null;
    while (Date.now() < deadline) {
      const { res, data } = await ctx.fetchJson("/api/market-depth/snapshot?symbol=BTCUSDT");
      last = data;
      if (res.status === 200 && data?.success !== false) {
        const connected = Number(data.connectedExchangeCount || 0);
        const bids = Array.isArray(data.bids) ? data.bids : [];
        const asks = Array.isArray(data.asks) ? data.asks : [];
        const price = Number(data.lastPrice || 0);
        if (price > 0 && bids.length > 0 && asks.length > 0 && connected >= ORDER_BOOK_MIN_CONNECTED) {
          return {
            status: "PASS",
            latencyMs: Date.now() - t0,
            evidence: { connected, bids: bids.length, asks: asks.length, lastPrice: price },
            priority: null,
          };
        }
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw Object.assign(new Error(`order book warmup timeout connected=${last?.connectedExchangeCount || 0}`), {
      httpStatus: 503,
    });
  }, { label: "order-book" });
}
