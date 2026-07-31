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
import { getDynamicSymbolManager } from "./dynamic-symbol-manager.js";
import { CORE_SYMBOLS } from "./dynamic-symbol-constants.js";
import { getSupportedExchangesForSymbol } from "./symbol-registry.js";
import { EXCHANGE_IDS, formatMarketSymbol, normalizeMarketSymbol } from "./symbols.js";

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
    /** @type {Map<string, { supportedExchanges: string[], startedAt: number }>} */
    this.symbolState = new Map();
    this.subscribers = new Set();
    this.broadcastTimer = null;
    this.pendingBroadcast = false;
    this.started = false;
    /** @type {Map<string, object>} */
    this.latestSnapshots = new Map();
    this.historyRecorder = getHistoricalMarketRecorder();
    this.liquidityWallRecorder = getHistoricalLiquidityWallRecorder();
    this.dynamicManager = getDynamicSymbolManager();

    this.dynamicManager.setHooks({
      onActivate: (symbol, exchanges) => this.ensureSymbolStarted(symbol, exchanges),
      onDeactivate: (symbol) => this.stopSymbol(symbol),
      onHistoryEligible: (symbol) => {
        logMarketDepth("history_eligible", { symbol });
      },
    });
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

  getSymbolExchanges(symbol) {
    const state = this.symbolState.get(symbol);
    if (state?.supportedExchanges?.length) return state.supportedExchanges;
    const fromRegistry = getSupportedExchangesForSymbol(symbol);
    if (fromRegistry.length) return fromRegistry;
    return CORE_SYMBOLS.includes(symbol) ? EXCHANGE_IDS : [];
  }

  ensureSymbolStarted(symbol, exchanges = null) {
    const normalized = normalizeMarketSymbol(symbol);
    if (!normalized) return;

    const targetExchanges = exchanges?.length ? exchanges : this.getSymbolExchanges(normalized);
    if (!targetExchanges.length) return;

    if (!this.symbolState.has(normalized)) {
      this.symbolState.set(normalized, {
        supportedExchanges: targetExchanges,
        startedAt: Date.now(),
      });
    } else {
      const state = this.symbolState.get(normalized);
      state.supportedExchanges = targetExchanges;
    }

    for (const exchange of targetExchanges) {
      const key = this.connectionKey(exchange, normalized);
      if (this.connections.has(key)) {
        continue;
      }

      const ConnectionClass = EXCHANGE_CONNECTIONS[exchange];
      if (!ConnectionClass) continue;

      const connection = new ConnectionClass({
        siteSymbol: normalized,
        onUpdate: () => {
          this.latestSnapshots.set(key, connection.getConnectionSnapshot());
          try {
            const book = connection.getConnectionSnapshot();
            if (this.dynamicManager.isHistoryEligible(normalized)) {
              this.liquidityWallRecorder.recordExchangeSnapshot({
                symbol: normalized,
                exchange,
                bids: book.bids,
                asks: book.asks,
                lastPrice: book.lastPrice,
              });
            }
          } catch {
            // liquidity wall recorder failures must not affect live order book
          }
          this.scheduleBroadcast();
        },
        onTrade: (trade) => {
          const tracker = this.getFlowTracker(normalized);
          tracker.addTrade(trade);
          try {
            if (this.dynamicManager.isHistoryEligible(normalized)) {
              this.historyRecorder.recordTrade(trade);
            }
          } catch {
            // history recorder failures must not affect live order book
          }
          this.scheduleBroadcast();
        },
      });

      this.connections.set(key, connection);
      connection.incrementSubscribers();
      logMarketDepth("connected", { exchange, symbol: normalized, phase: "init" });
    }
  }

  stopSymbol(symbol) {
    const normalized = normalizeMarketSymbol(symbol);
    if (!normalized || CORE_SYMBOLS.includes(normalized)) return;

    const exchanges = this.getSymbolExchanges(normalized);

    for (const exchange of exchanges) {
      const key = this.connectionKey(exchange, normalized);
      const connection = this.connections.get(key);
      if (!connection) continue;

      connection.shutdown?.();
      this.connections.delete(key);
      this.latestSnapshots.delete(key);
    }

    this.flowTrackers.delete(normalized);
    this.symbolState.delete(normalized);
    logMarketDepth("symbol_stopped", { symbol: normalized });
  }

  start(reason = "manual") {
    if (this.started) return this;
    this.started = true;
    logMarketDepth("starting", { reason });
    startHistoricalMarketRecorder();
    startHistoricalLiquidityWallRecorder();

    this.dynamicManager.ensureCoreSymbols();

    for (const symbol of CORE_SYMBOLS) {
      this.ensureSymbolStarted(symbol);
      this.dynamicManager.acquire(symbol, "__core__");
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

  getExchangeSnapshots(symbol, exchanges = null) {
    const target = exchanges?.length ? exchanges : this.getSymbolExchanges(symbol);
    const snapshots = [];

    for (const exchange of target) {
      const key = this.connectionKey(exchange, symbol);
      const connection = this.connections.get(key);
      if (!connection) {
        snapshots.push({
          exchange,
          status: "unsupported",
          stale: true,
          synced: false,
          updatedAt: 0,
          lastMessageAt: 0,
          bids: [],
          asks: [],
          lastPrice: null,
        });
        continue;
      }
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

    const normalized = normalizeMarketSymbol(symbol) || "BTCUSDT";
    const supportedExchanges = this.getSymbolExchanges(normalized);
    const expectedExchangeCount = supportedExchanges.length;

    this.ensureSymbolStarted(normalized, supportedExchanges);

    const exchangeSnapshots = this.getExchangeSnapshots(normalized, supportedExchanges);
    const activeExchanges = exchangeSnapshots.filter((item) => item.synced && !item.stale && item.status !== "unsupported");
    const connectedExchangeCount = activeExchanges.length;
    const flowTracker = this.getFlowTracker(normalized);

    let bids = [];
    let asks = [];
    let lastPrice = null;
    let exchangeStatuses = exchangeSnapshots.map((item) => ({
      exchange: item.exchange,
      status: item.status,
      stale: item.stale,
      synced: item.synced,
      supported: item.status !== "unsupported",
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
      if (selected?.synced && !selected.stale && selected.status !== "unsupported") {
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

    const walls = detectLiquidityWalls({
      bids,
      asks,
      midPrice,
      symbol: normalized,
      supportedExchangeCount: expectedExchangeCount,
    });
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

    const partialExchangeCoverage = connectedExchangeCount > 0 && connectedExchangeCount < expectedExchangeCount;
    const historyCollecting = !this.dynamicManager.isHistoryEligible(normalized);

    return {
      symbol: normalized,
      displaySymbol: formatMarketSymbol(normalized),
      mode,
      supportedExchanges,
      expectedExchangeCount,
      connectedExchangeCount,
      partialExchangeCoverage,
      historyCollecting,
      exchanges: activeExchanges.map((item) => item.exchange),
      exchangeStatuses,
      timestamp: Date.now(),
      updatedAt,
      stale: connectedExchangeCount === 0,
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
      dataSources: supportedExchanges.map((ex) => EXCHANGE_LABELS[ex] || ex),
      disclaimer: "بيانات مجمعة من المنصات المدعومة",
    };
  }

  getSnapshot(params) {
    return this.buildPayload(params);
  }
}

const EXCHANGE_LABELS = {
  okx: "OKX",
  binance: "Binance",
  bybit: "Bybit",
};

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

export function getMarketDepthHealthSnapshot() {
  const hub = getMarketDepthHub();

  const getConnectedCount = (symbol) => {
    const exchanges = hub.getSymbolExchanges(symbol);
    let connected = 0;
    for (const exchange of exchanges) {
      const connection = hub.connections.get(hub.connectionKey(exchange, symbol));
      const snapshot = connection?.getConnectionSnapshot?.();
      if (snapshot?.status === "connected" && !snapshot?.stale) {
        connected += 1;
      }
    }
    return connected;
  };

  return {
    connections: hub.connections.size,
    activeSymbols: hub.symbolState.size,
    subscribers: hub.subscribers.size,
    listenerCount: hub.subscribers.size,
    dynamic: hub.dynamicManager.getHealthSnapshot({
      getConnectedCount,
      listenerCount: hub.subscribers.size,
    }),
  };
}
