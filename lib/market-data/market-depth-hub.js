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
import { CORE_SYMBOLS, PROBE_TIMEOUT_MS } from "./dynamic-symbol-constants.js";
import {
  getSupportedExchangesForSymbol,
  getRegistryEntry,
  isBootstrapSymbol,
} from "./symbol-registry.js";
import {
  classifyProbeConnectionSnapshot,
  finalizeSymbolProbe,
  formatExchangeProbeLabel,
  getProbeMetrics,
  getSymbolProbeState,
  recordProbeExchangeOutcome,
  startSymbolProbe,
  summarizeProbeResults,
} from "./exchange-symbol-probe.js";
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
      onActivate: (symbol, exchanges, meta) => this.ensureSymbolStarted(symbol, exchanges, meta),
      onDeactivate: (symbol) => this.stopSymbol(symbol),
      onHistoryEligible: (symbol) => {
        logMarketDepth("history_eligible", { symbol });
      },
    });
    /** @type {Map<string, ReturnType<typeof setTimeout>>} */
    this.probeTimers = new Map();
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
    if (state?.candidateExchanges?.length) return state.candidateExchanges;

    const managerState = this.dynamicManager.getState(symbol);
    if (managerState?.supportedExchanges?.length) return managerState.supportedExchanges;
    if (managerState?.candidateExchanges?.length) return managerState.candidateExchanges;

    const fromRegistry = this.getRegistryExchanges(symbol);
    if (fromRegistry.length) return fromRegistry;
    return CORE_SYMBOLS.includes(symbol) ? EXCHANGE_IDS : [];
  }

  getRegistryExchanges(symbol) {
    return getSupportedExchangesForSymbol(symbol);
  }

  clearProbeTimer(symbol) {
    const timer = this.probeTimers.get(symbol);
    if (timer) {
      clearTimeout(timer);
      this.probeTimers.delete(symbol);
    }
  }

  updateProbeFromSnapshot(symbol, exchange, snapshot) {
    const state = this.symbolState.get(symbol);
    if (!state?.bootstrapProbe) return;

    const probe = getSymbolProbeState(symbol);
    if (!probe || probe.status !== "probing") return;

    const elapsedMs = Date.now() - probe.startedAt;
    const outcome = classifyProbeConnectionSnapshot(snapshot, elapsedMs, PROBE_TIMEOUT_MS);
    if (outcome === "pending") return;

    recordProbeExchangeOutcome(symbol, exchange, outcome);
    this.tryFinalizeProbe(symbol);
  }

  tryFinalizeProbe(symbol, { force = false } = {}) {
    const probe = getSymbolProbeState(symbol);
    if (!probe || probe.status !== "probing") return;

    const finalized = finalizeSymbolProbe(symbol, { force });
    if (!finalized) return;

    this.clearProbeTimer(symbol);
    const { summary } = finalized;
    const state = this.symbolState.get(symbol);
    if (state) {
      state.probeStatus = finalized.probe.status;
      state.supportedExchanges = summary.supportedExchanges;
      state.probeSummary = summary;
    }

    for (const exchange of probe.candidateExchanges) {
      if (!summary.supportedExchanges.includes(exchange)) {
        this.shutdownConnection(exchange, symbol);
      }
    }

    const result = this.dynamicManager.completeProbe(symbol, summary);
    if (!result.ok) {
      this.stopSymbol(symbol);
    } else if (state) {
      state.supportedExchanges = summary.supportedExchanges;
    }

    this.scheduleBroadcast();
  }

  scheduleProbeFinalize(symbol) {
    this.clearProbeTimer(symbol);
    const timer = setTimeout(() => {
      this.probeTimers.delete(symbol);
      this.tryFinalizeProbe(symbol, { force: true });
    }, PROBE_TIMEOUT_MS + 250);
    timer.unref?.();
    this.probeTimers.set(symbol, timer);
  }

  shutdownConnection(exchange, symbol) {
    const key = this.connectionKey(exchange, symbol);
    const connection = this.connections.get(key);
    if (!connection) return;
    connection.shutdown?.();
    this.connections.delete(key);
    this.latestSnapshots.delete(key);
  }

  ensureSymbolStarted(symbol, exchanges = null, meta = {}) {
    const normalized = normalizeMarketSymbol(symbol);
    if (!normalized) return;

    const bootstrapProbe = Boolean(meta?.bootstrap || meta?.probe || isBootstrapSymbol(normalized));
    const targetExchanges = exchanges?.length ? exchanges : this.getSymbolExchanges(normalized);
    if (!targetExchanges.length) return;

    if (!this.symbolState.has(normalized)) {
      this.symbolState.set(normalized, {
        supportedExchanges: bootstrapProbe ? [] : targetExchanges,
        candidateExchanges: targetExchanges,
        startedAt: Date.now(),
        bootstrapProbe,
        probeStatus: bootstrapProbe ? "probing" : "verified",
      });
      if (bootstrapProbe) {
        startSymbolProbe(normalized, targetExchanges);
        this.scheduleProbeFinalize(normalized);
      }
    } else {
      const state = this.symbolState.get(normalized);
      state.candidateExchanges = targetExchanges;
      if (!bootstrapProbe) {
        state.supportedExchanges = targetExchanges;
      }
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
          const book = connection.getConnectionSnapshot();
          this.latestSnapshots.set(key, book);
          this.updateProbeFromSnapshot(normalized, exchange, book);
          try {
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

    this.clearProbeTimer(normalized);
    const exchanges = this.symbolState.get(normalized)?.candidateExchanges || this.getSymbolExchanges(normalized);

    for (const exchange of exchanges) {
      this.shutdownConnection(exchange, normalized);
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
    const symbolState = this.symbolState.get(normalized) || {};
    const managerProbe = this.dynamicManager.getProbeStatus(normalized);
    const probeState = getSymbolProbeState(normalized);
    const supportedExchanges = symbolState.supportedExchanges?.length
      ? symbolState.supportedExchanges
      : this.getSymbolExchanges(normalized);
    const candidateExchanges = symbolState.candidateExchanges?.length
      ? symbolState.candidateExchanges
      : supportedExchanges;
    const expectedExchangeCount = candidateExchanges.length;
    const probeStatus = managerProbe?.probeStatus || symbolState.probeStatus || "verified";
    const probing = probeStatus === "probing";

    this.ensureSymbolStarted(normalized, candidateExchanges, {
      bootstrap: symbolState.bootstrapProbe || getRegistryEntry(normalized)?.source === "bootstrap",
      probe: probing,
    });

    const exchangeSnapshots = this.getExchangeSnapshots(
      normalized,
      probing ? candidateExchanges : supportedExchanges.length ? supportedExchanges : candidateExchanges,
    );
    const activeExchanges = exchangeSnapshots.filter((item) => item.synced && !item.stale && item.status !== "unsupported");
    const connectedExchangeCount = activeExchanges.length;
    const flowTracker = this.getFlowTracker(normalized);

    let exchangeStatuses = exchangeSnapshots.map((item) => {
      const probeOutcome = probeState?.results?.[item.exchange] || (item.status === "connected" && item.synced ? "supported" : "pending");
      const probeLabel = probing
        ? formatExchangeProbeLabel(probeOutcome)
        : item.status === "connected" && item.synced
          ? "متصل"
          : probeOutcome === "unsupported"
            ? "غير مدعومة لهذا الرمز"
            : probeOutcome === "unavailable"
              ? "تعذر الاتصال مؤقتًا"
              : "غير متصل";

      return {
        exchange: item.exchange,
        status: probing && probeOutcome === "pending" ? "probing" : item.status,
        probeOutcome,
        probeLabel,
        stale: item.stale,
        synced: item.synced,
        supported: probeOutcome === "supported" || (item.status === "connected" && item.synced),
        updatedAt: item.updatedAt,
        lastMessageAt: item.lastMessageAt,
        latencyMs: item.lastMessageAt ? Date.now() - item.lastMessageAt : null,
      };
    });

    let bids = [];
    let asks = [];
    let lastPrice = null;

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
    const probeSummary = probeState ? summarizeProbeResults(probeState) : null;
    const symbolLoadError =
      probeStatus === "failed"
        ? `تعذّر تشغيل بيانات ${formatMarketSymbol(normalized)} حاليًا.`
        : null;

    return {
      symbol: normalized,
      displaySymbol: formatMarketSymbol(normalized),
      mode,
      supportedExchanges,
      candidateExchanges,
      expectedExchangeCount,
      connectedExchangeCount,
      partialExchangeCoverage,
      historyCollecting,
      probeStatus,
      probing,
      probeSummary,
      symbolLoadError,
      exchanges: activeExchanges.map((item) => item.exchange),
      exchangeStatuses,
      timestamp: Date.now(),
      updatedAt,
      stale: !probing && connectedExchangeCount === 0,
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
    dynamic: {
      ...hub.dynamicManager.getHealthSnapshot({
        getConnectedCount,
        listenerCount: hub.subscribers.size,
      }),
      probe: getProbeMetrics(),
    },
  };
}
