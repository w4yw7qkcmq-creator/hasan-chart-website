import { UI_BROADCAST_MS } from "./constants.js";
import {
  buildDepthMapPoints,
  computeLiquidityDominance,
  computeSpread,
  detectLiquidityWalls,
  enrichLevelsWithDepth,
  mergeExchangeBooks,
} from "./aggregation.js";
import { ExecutedFlowTracker } from "./executed-flow.js";
import { logMarketDepth } from "./logging.js";
import {
  getHistoricalMarketRecorder,
  startHistoricalMarketRecorder,
} from "./history/historical-market-recorder.js";
import {
  getHistoricalLiquidityWallRecorder,
  startHistoricalLiquidityWallRecorder,
} from "./history/liquidity-walls/liquidity-wall-recorder.js";
import { BinanceOrderBookConnection } from "./exchanges/binance.js";
import { BybitOrderBookConnection } from "./exchanges/bybit.js";
import { OkxOrderBookConnection } from "./exchanges/okx.js";
import { EXCHANGE_IDS, SITE_SYMBOLS } from "./symbols.js";

const EXCHANGE_CONNECTIONS = {
  okx: OkxOrderBookConnection,
  binance: BinanceOrderBookConnection,
  bybit: BybitOrderBookConnection,
};

class MarketDepthHub {
  constructor() {
    /** @type {Map<string, object>} */
    this.connections = new Map();
    /** @type {Map<string, ExecutedFlowTracker>} */
    this.flowTrackers = new Map();
    this.subscribers = new Set();
    this.broadcastTimer = null;
    this.pendingBroadcast = false;
    this.started = false;
    /** @type {Map<string, object>} */
    this.latestSnapshots = new Map();
    this.historyRecorder = getHistoricalMarketRecorder();
    this.liquidityWallRecorder = getHistoricalLiquidityWallRecorder();
  }

  connectionKey(exchange, symbol) {
    return `${exchange}:${symbol}`;
  }

  getFlowTracker(symbol) {
    if (!this.flowTrackers.has(symbol)) {
      this.flowTrackers.set(symbol, new ExecutedFlowTracker());
    }
    return this.flowTrackers.get(symbol);
  }

  ensureSymbolStarted(symbol) {
    if (!SITE_SYMBOLS.includes(symbol)) return;

    for (const exchange of EXCHANGE_IDS) {
      const key = this.connectionKey(exchange, symbol);
      if (this.connections.has(key)) continue;

      const ConnectionClass = EXCHANGE_CONNECTIONS[exchange];
      const connection = new ConnectionClass({
        siteSymbol: symbol,
        onUpdate: () => {
          this.latestSnapshots.set(key, connection.getConnectionSnapshot());
          try {
            const book = connection.getConnectionSnapshot();
            this.liquidityWallRecorder.recordExchangeSnapshot({
              symbol,
              exchange,
              bids: book.bids,
              asks: book.asks,
              lastPrice: book.lastPrice,
            });
          } catch {
            // liquidity wall recorder failures must not affect live order book
          }
          this.scheduleBroadcast();
        },
        onTrade: (trade) => {
          const tracker = this.getFlowTracker(symbol);
          tracker.addTrade(trade);
          try {
            this.historyRecorder.recordTrade(trade);
          } catch {
            // history recorder failures must not affect live order book
          }
          this.scheduleBroadcast();
        },
      });

      this.connections.set(key, connection);
      connection.incrementSubscribers();
      logMarketDepth("connected", { exchange, symbol, phase: "init" });
    }
  }

  start(reason = "manual") {
    if (this.started) return this;
    this.started = true;
    logMarketDepth("starting", { reason });
    startHistoricalMarketRecorder();
    startHistoricalLiquidityWallRecorder();

    for (const symbol of SITE_SYMBOLS) {
      this.ensureSymbolStarted(symbol);
    }

    return this;
  }

  scheduleBroadcast() {
    this.pendingBroadcast = true;
    if (this.broadcastTimer) return;

    this.broadcastTimer = setTimeout(() => {
      this.broadcastTimer = null;
      if (!this.pendingBroadcast) return;
      this.pendingBroadcast = false;
      this.broadcast();
    }, UI_BROADCAST_MS);
  }

  broadcast() {
    for (const callback of this.subscribers) {
      try {
        callback();
      } catch {
        // ignore subscriber errors
      }
    }
  }

  subscribe(callback) {
    this.start("subscribe");
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  getExchangeSnapshots(symbol) {
    const snapshots = [];

    for (const exchange of EXCHANGE_IDS) {
      const key = this.connectionKey(exchange, symbol);
      const connection = this.connections.get(key);
      if (!connection) continue;
      snapshots.push(connection.getConnectionSnapshot());
    }

    return snapshots;
  }

  buildPayload(params) {
    const {
      symbol,
      mode,
      precision,
      levels,
      liquidityRange,
      flowWindow,
      dominanceWindow,
      largeTradeWindow,
      largeTradeThreshold,
    } = params;

    this.ensureSymbolStarted(symbol);

    const exchangeSnapshots = this.getExchangeSnapshots(symbol);
    const activeExchanges = exchangeSnapshots.filter((item) => item.synced && !item.stale);
    const flowTracker = this.getFlowTracker(symbol);

    let bids = [];
    let asks = [];
    let lastPrice = null;
    let exchangeStatuses = exchangeSnapshots.map((item) => ({
      exchange: item.exchange,
      status: item.status,
      stale: item.stale,
      synced: item.synced,
      updatedAt: item.updatedAt,
      lastMessageAt: item.lastMessageAt,
      latencyMs: item.lastMessageAt ? Date.now() - item.lastMessageAt : null,
    }));

    if (mode === "aggregated") {
      const books = activeExchanges.map((item) => ({
        exchange: item.exchange,
        bids: item.bids,
        asks: item.asks,
        synced: item.synced,
      }));

      bids = enrichLevelsWithDepth(mergeExchangeBooks(books, { precision, side: "bid", limit: levels }));
      asks = enrichLevelsWithDepth(mergeExchangeBooks(books, { precision, side: "ask", limit: levels }));

      const prices = activeExchanges
        .map((item) => item.lastPrice || item.bids?.[0]?.price)
        .filter(Boolean);
      lastPrice = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null;
    } else {
      const selected = exchangeSnapshots.find((item) => item.exchange === mode);
      if (selected?.synced && !selected.stale) {
        bids = enrichLevelsWithDepth(
          selected.bids.slice(0, levels).map((level) => ({
            ...level,
            notional: level.price * level.quantity,
            exchanges: [selected.exchange],
          }))
        );
        asks = enrichLevelsWithDepth(
          selected.asks.slice(0, levels).map((level) => ({
            ...level,
            notional: level.price * level.quantity,
            exchanges: [selected.exchange],
          }))
        );
        lastPrice = selected.lastPrice || selected.bids?.[0]?.price || selected.asks?.[0]?.price || null;
      }
    }

    const bestBid = bids[0] || null;
    const bestAsk = asks[0] || null;
    const spreadInfo = computeSpread(bestBid, bestAsk);
    const midPrice = spreadInfo.midPrice || lastPrice;

    if (!lastPrice && midPrice) lastPrice = midPrice;

    const liquidity = computeLiquidityDominance({
      bids,
      asks,
      midPrice,
      rangePercent: liquidityRange,
    });

    const walls = detectLiquidityWalls({ bids, asks, midPrice });
    const executedFlow = flowTracker.computeFlow(flowWindow);
    const dominanceFlow = flowTracker.computeFlow(dominanceWindow || flowWindow);
    const largeTradeResult = flowTracker.getLargeTrades(
      largeTradeThreshold,
      largeTradeWindow,
      50
    );
    const recentTrades = flowTracker.getRecentTrades(30);
    const depthMap = buildDepthMapPoints({ bids, asks, midPrice, rangePercent: 2 });

    const updatedAt = Math.max(
      0,
      ...exchangeSnapshots.map((item) => item.updatedAt || 0)
    );
    const lastMessageAt = Math.max(
      0,
      ...activeExchanges.map((item) => item.lastMessageAt || 0)
    );

    return {
      symbol,
      mode,
      exchanges: activeExchanges.map((item) => item.exchange),
      exchangeStatuses,
      timestamp: Date.now(),
      updatedAt,
      stale: activeExchanges.length === 0,
      latencyMs: lastMessageAt ? Date.now() - lastMessageAt : null,
      lastPrice,
      midPrice,
      spread: spreadInfo.spread,
      spreadPercent: spreadInfo.spreadPercent,
      bids,
      asks,
      liquidity,
      walls,
      executedFlow,
      dominanceFlow,
      largeTrades: largeTradeResult.trades,
      largeTradeStats: {
        tradesInWindow: largeTradeResult.tradesInWindow,
        tradesAboveThreshold: largeTradeResult.tradesAboveThreshold,
      },
      recentTrades,
      depthMap,
      dataSources: ["OKX", "Binance", "Bybit"],
      disclaimer: "بيانات مجمعة من المنصات المدعومة",
    };
  }

  getSnapshot(params) {
    return this.buildPayload(params);
  }
}

export function getMarketDepthHub() {
  if (!globalThis.__marketDepthHub) {
    globalThis.__marketDepthHub = new MarketDepthHub();
  }
  return globalThis.__marketDepthHub;
}

export function startMarketDepth(reason = "manual") {
  const hub = getMarketDepthHub();
  hub.start(reason);
  return hub;
}

export function getSharedMarketDepthSnapshot(params) {
  const hub = startMarketDepth("snapshot");
  return hub.getSnapshot(params);
}
