import { LARGE_TRADE_BANDS } from "./constants.js";
import { FlowBucketAggregator } from "./flow-bucket-aggregator.js";
import { getMarketHistoryConfig, isMarketHistoryWriteEnabled } from "./history-config.js";
import { HistoryMetrics } from "./history-metrics.js";
import {
  MarketHistoryWriter,
  registerMarketHistoryShutdown,
} from "./market-history-writer.js";
import { createSupabaseHistoryClient } from "./supabase-history-client.js";

/**
 * Highest large-trade band reached by notional.
 * @param {number} notional
 * @returns {number|null}
 */
export function resolveThresholdBand(notional) {
  if (!Number.isFinite(notional) || notional < LARGE_TRADE_BANDS[0]) {
    return null;
  }

  let band = null;
  for (const threshold of LARGE_TRADE_BANDS) {
    if (notional >= threshold) {
      band = threshold;
    }
  }
  return band;
}

/**
 * @returns {HistoryMetrics}
 */
function createDisabledMetrics() {
  const metrics = new HistoryMetrics();
  metrics.markStarted(false);
  return metrics;
}

class NoOpHistoricalMarketRecorder {
  constructor() {
    this.metrics = createDisabledMetrics();
  }

  start() {
    return this;
  }

  stop() {
    return this;
  }

  recordTrade() {}

  getStatus() {
    return this.metrics.snapshot();
  }
}

export class HistoricalMarketRecorder {
  /**
   * @param {{
   *   config?: ReturnType<typeof getMarketHistoryConfig>,
   *   metrics?: HistoryMetrics,
   *   aggregator?: FlowBucketAggregator,
   *   writer?: MarketHistoryWriter,
   *   now?: () => number,
   * }} [options]
   */
  constructor(options = {}) {
    this.config = options.config ?? getMarketHistoryConfig({ enabled: true });
    this.metrics = options.metrics ?? new HistoryMetrics();
    this.metrics.markStarted(true);
    this.nowFn = options.now ?? (() => Date.now());
    this.aggregator =
      options.aggregator ??
      new FlowBucketAggregator({
        now: this.nowFn,
      });

    if (options.writer) {
      this.writer = options.writer;
    } else {
      const client = createSupabaseHistoryClient({
        timeoutMs: this.config.requestTimeoutMs,
      });
      this.writer = new MarketHistoryWriter({
        client,
        config: this.config,
        metrics: this.metrics,
        now: this.nowFn,
        getReadyFlowBuckets: (now) => this.aggregator.getReadyBuckets(now),
        acknowledgeFlowBuckets: (keys) => this.aggregator.acknowledgeBuckets(keys),
        getPendingBucketStats: (now) => this.aggregator.getPendingBucketStats(now),
      });
    }
  }

  start() {
    if (this.metrics.collectingSince == null) {
      this.metrics.collectingSince = Date.now();
    }
    this.writer.start();
    registerMarketHistoryShutdown(this.writer);
    return this;
  }

  stop() {
    this.writer.stop();
    return this;
  }

  /**
   * @param {Record<string, unknown>} trade
   * @param {number} [now]
   */
  recordTrade(trade, now = this.nowFn()) {
    try {
      this.metrics.tradesReceived += 1;
      const result = this.aggregator.addTrade(trade, { now });

      if (!result.ok) {
        if (result.duplicate) this.metrics.tradesDuplicate += 1;
        else if (result.reason === "late_dropped") this.metrics.lateDropped += 1;
        else this.metrics.tradesInvalid += 1;
        return;
      }

      this.metrics.tradesAccepted += 1;
      if (result.lateAccepted) this.metrics.lateAccepted += 1;

      const tradeKey = result.tradeKey;
      if (!tradeKey) return;

      const notional =
        typeof trade.notional === "number" && Number.isFinite(trade.notional)
          ? trade.notional
          : Number(trade.price) * Number(trade.quantity);

      const thresholdBand = resolveThresholdBand(notional);
      if (thresholdBand == null) return;

      this.writer.enqueueLargeTrade({
        tradeKey,
        symbol: String(trade.symbol),
        exchange: String(trade.exchange),
        ts: Number(trade.ts) || now,
        side: trade.side === "sell" ? "sell" : "buy",
        price: Number(trade.price),
        quantity: Number(trade.quantity),
        notional,
        thresholdBand,
      });

      const pending = this.aggregator.getPendingBucketStats(now);
      this.metrics.flowBucketsPending = pending.count;
      this.metrics.oldestPendingBucketAgeMs = pending.oldestAgeMs;
      this.metrics.largeTradesPending = this.writer.largeTradeQueue.length;
    } catch {
      // Contain recorder failures — must not affect WS path.
    }
  }

  getStatus() {
    const pending = this.aggregator.getPendingBucketStats(this.nowFn());
    this.metrics.flowBucketsPending = pending.count;
    this.metrics.oldestPendingBucketAgeMs = pending.oldestAgeMs;
    this.metrics.largeTradesPending = this.writer.largeTradeQueue.length;
    return this.metrics.snapshot();
  }
}

/**
 * @param {Record<string, unknown>} [options]
 */
export function createHistoricalMarketRecorder(options = {}) {
  const config = options.config ?? getMarketHistoryConfig();
  if (!config.enabled) {
    return new NoOpHistoricalMarketRecorder();
  }
  return new HistoricalMarketRecorder({ ...options, config });
}

export function getHistoricalMarketRecorder() {
  if (!globalThis.__historicalMarketRecorder) {
    globalThis.__historicalMarketRecorder = createHistoricalMarketRecorder();
  }
  return globalThis.__historicalMarketRecorder;
}

export function resetHistoricalMarketRecorderForTests() {
  const existing = globalThis.__historicalMarketRecorder;
  if (existing?.writer?.stop) {
    existing.writer.stop();
  }
  delete globalThis.__historicalMarketRecorder;
  delete globalThis.__marketHistoryShutdownRegistered;
}

export function getHistoryWriterStatus() {
  return getHistoricalMarketRecorder().getStatus();
}

export function startHistoricalMarketRecorder() {
  const recorder = getHistoricalMarketRecorder();
  if (typeof recorder.start === "function") {
    recorder.start();
  }
  return recorder;
}

export function stopHistoricalMarketRecorder() {
  const recorder = getHistoricalMarketRecorder();
  if (typeof recorder.stop === "function") {
    recorder.stop();
  }
  return recorder;
}

export { isMarketHistoryWriteEnabled };
