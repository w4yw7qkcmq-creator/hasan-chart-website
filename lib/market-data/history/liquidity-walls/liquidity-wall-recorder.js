import { getMarketHistoryConfig, isMarketHistoryWriteEnabled } from "../history-config.js";
import { createSupabaseHistoryClient } from "../supabase-history-client.js";
import { LiquidityWallMetrics } from "./liquidity-wall-metrics.js";
import {
  LiquidityWallWriter,
  registerLiquidityWallShutdown,
  resetLiquidityWallShutdownForTests,
} from "./liquidity-wall-writer.js";
import { detectSignificantLiquidityWalls, WALL_SAMPLE_INTERVAL_MS } from "./wall-detector.js";
import { LiquidityWallTracker } from "./wall-tracker.js";

class NoOpLiquidityWallRecorder {
  constructor() {
    this.metrics = new LiquidityWallMetrics();
  }

  start() {
    return this;
  }

  stop() {
    return this;
  }

  recordExchangeSnapshot() {}

  getStatus() {
    return this.metrics.snapshot();
  }
}

export class HistoricalLiquidityWallRecorder {
  /**
   * @param {Record<string, unknown>} [options]
   */
  constructor(options = {}) {
    this.config = options.config ?? getMarketHistoryConfig({ enabled: true });
    this.metrics = options.metrics ?? new LiquidityWallMetrics();
    this.metrics.markStarted(true);
    this.nowFn = options.now ?? (() => Date.now());
    this.tracker = options.tracker ?? new LiquidityWallTracker({ now: this.nowFn });
    /** @type {Map<string, number>} */
    this.lastSampleAt = new Map();
    /** @type {Map<string, object>} */
    this.pendingRows = new Map();

    if (options.writer) {
      this.writer = options.writer;
    } else {
      const client = createSupabaseHistoryClient({
        timeoutMs: this.config.requestTimeoutMs,
      });
      this.writer = new LiquidityWallWriter({
        client,
        config: this.config,
        metrics: this.metrics,
        now: this.nowFn,
        getPendingRows: () => [...this.pendingRows.values()],
        acknowledgeRows: (keys) => {
          for (const key of keys) {
            this.pendingRows.delete(key);
          }
          return keys.length;
        },
      });
    }
  }

  start() {
    if (this.metrics.collectingSince == null) {
      this.metrics.collectingSince = this.nowFn();
    }
    this.writer.start();
    registerLiquidityWallShutdown(this.writer);
    return this;
  }

  stop() {
    this.writer.stop();
    return this;
  }

  /**
   * @param {{
   *   symbol: string,
   *   exchange: string,
   *   bids?: Array<{ price: number, quantity: number, notional?: number }>,
   *   asks?: Array<{ price: number, quantity: number, notional?: number }>,
   *   lastPrice?: number|null,
   *   snapshotTime?: number,
   * }} snapshot
   */
  recordExchangeSnapshot(snapshot) {
    try {
      const now = snapshot.snapshotTime ?? this.nowFn();
      const sampleKey = `${snapshot.symbol}:${snapshot.exchange}`;
      const last = this.lastSampleAt.get(sampleKey) ?? 0;
      if (now - last < WALL_SAMPLE_INTERVAL_MS) return;
      this.lastSampleAt.set(sampleKey, now);

      const bestBid = snapshot.bids?.[0]?.price ?? null;
      const bestAsk = snapshot.asks?.[0]?.price ?? null;
      const midPrice =
        bestBid && bestAsk
          ? (bestBid + bestAsk) / 2
          : snapshot.lastPrice ?? bestBid ?? bestAsk ?? null;
      if (!midPrice) return;

      this.metrics.samplesReceived += 1;

      const walls = detectSignificantLiquidityWalls({
        symbol: snapshot.symbol,
        bids: (snapshot.bids || []).map((level) => ({
          price: level.price,
          quantity: level.quantity,
          notional: level.notional ?? level.price * level.quantity,
        })),
        asks: (snapshot.asks || []).map((level) => ({
          price: level.price,
          quantity: level.quantity,
          notional: level.notional ?? level.price * level.quantity,
        })),
        midPrice,
      });

      this.metrics.wallsDetected += walls.length;
      const updates = this.tracker.ingestSnapshot({
        symbol: snapshot.symbol,
        exchange: snapshot.exchange,
        walls,
        snapshotTime: now,
      });

      for (const row of updates) {
        this.pendingRows.set(row.wallKey, row);
      }

      this.metrics.trackedWalls = this.tracker.getTrackedCount();
      this.metrics.pending = this.pendingRows.size;
    } catch {
      // Must not affect live order book path.
    }
  }

  getStatus() {
    this.metrics.trackedWalls = this.tracker.getTrackedCount();
    this.metrics.pending = this.pendingRows.size;
    return this.metrics.snapshot();
  }
}

export function createHistoricalLiquidityWallRecorder(options = {}) {
  const config = options.config ?? getMarketHistoryConfig();
  if (!config.enabled) {
    return new NoOpLiquidityWallRecorder();
  }
  return new HistoricalLiquidityWallRecorder({ ...options, config });
}

export function getHistoricalLiquidityWallRecorder() {
  if (!globalThis.__historicalLiquidityWallRecorder) {
    globalThis.__historicalLiquidityWallRecorder = createHistoricalLiquidityWallRecorder();
  }
  return globalThis.__historicalLiquidityWallRecorder;
}

export function resetHistoricalLiquidityWallRecorderForTests() {
  const existing = globalThis.__historicalLiquidityWallRecorder;
  if (existing?.writer?.stop) {
    existing.writer.stop();
  }
  delete globalThis.__historicalLiquidityWallRecorder;
  resetLiquidityWallShutdownForTests();
}

export function getLiquidityWallWriterStatus() {
  return getHistoricalLiquidityWallRecorder().getStatus();
}

export function startHistoricalLiquidityWallRecorder() {
  const recorder = getHistoricalLiquidityWallRecorder();
  if (typeof recorder.start === "function") {
    recorder.start();
  }
  return recorder;
}

export { isMarketHistoryWriteEnabled };
