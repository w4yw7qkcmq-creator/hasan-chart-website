import { getMarketHistoryConfig } from "../history-config.js";
import { LiquidityWallMetrics } from "./liquidity-wall-metrics.js";

/**
 * @typedef {Object} LiquidityWallWriteRow
 * @property {string} wallKey
 * @property {string} symbol
 * @property {string} exchange
 * @property {"bid"|"ask"} side
 * @property {number} price
 * @property {number} size
 * @property {number} notional
 * @property {number} distanceFromMid
 * @property {number} snapshotTime
 * @property {number} firstSeen
 * @property {number} lastSeen
 * @property {number} lifetimeSeconds
 * @property {number} appearanceCount
 * @property {number} persistenceScore
 * @property {number} maxSize
 * @property {number} averageSize
 * @property {number} reappearCount
 * @property {number} strongestNotional
 * @property {number} survivedSnapshots
 * @property {boolean} isActive
 */

export class LiquidityWallWriter {
  /**
   * @param {{
   *   client: { upsertLiquidityWalls: (rows: LiquidityWallWriteRow[]) => Promise<{ ok: boolean, written?: number, errorMessageSafe?: string, latencyMs?: number, retryable?: boolean }> },
   *   config?: ReturnType<typeof getMarketHistoryConfig>,
   *   metrics?: LiquidityWallMetrics,
   *   now?: () => number,
   *   sleep?: (ms: number) => Promise<void>,
   *   getPendingRows?: () => LiquidityWallWriteRow[],
   *   acknowledgeRows?: (keys: string[]) => number,
   * }} options
   */
  constructor(options) {
    this.client = options.client;
    this.config = options.config ?? getMarketHistoryConfig({ enabled: true });
    this.metrics = options.metrics ?? new LiquidityWallMetrics();
    this.nowFn = options.now ?? (() => Date.now());
    this.sleepFn =
      options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.getPendingRows = options.getPendingRows ?? (() => []);
    this.acknowledgeRows = options.acknowledgeRows ?? (() => 0);
    this.flushTimer = null;
    this.started = false;
    this.inFlight = null;
    this.shutdownRequested = false;
  }

  start() {
    if (this.started) return this;
    this.started = true;
    this.metrics.markStarted(true);
    this.scheduleFlush(this.config.flushIntervalMs);
    return this;
  }

  stop() {
    this.shutdownRequested = true;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    return this;
  }

  scheduleFlush(delayMs) {
    if (this.shutdownRequested || this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flushOnce();
    }, delayMs);
  }

  async flushOnce() {
    if (this.inFlight) {
      this.scheduleFlush(this.config.flushIntervalMs);
      return this.inFlight;
    }

    this.metrics.flushAttempts += 1;
    this.metrics.inFlight = true;
    this.metrics.lastFlush = this.nowFn();

    this.inFlight = (async () => {
      const rows = this.getPendingRows();
      this.metrics.pending = rows.length;
      if (!rows.length) {
        return { ok: true, written: 0 };
      }

      let attempt = 0;
      while (attempt <= this.config.retryMax) {
        const result = await this.client.upsertLiquidityWalls(rows);
        this.metrics.lastLatencyMs = result.latencyMs ?? null;
        if (result.ok) {
          this.acknowledgeRows(rows.map((row) => row.wallKey));
          this.metrics.flushSuccesses += 1;
          this.metrics.lastSuccessfulFlushAt = this.nowFn();
          this.metrics.storedWalls += result.written ?? rows.length;
          this.metrics.lastErrorSafe = null;
          this.metrics.pending = 0;
          return result;
        }

        this.metrics.lastErrorSafe = result.errorMessageSafe ?? "write_failed";
        if (!result.retryable || attempt >= this.config.retryMax) {
          this.metrics.flushFailures += 1;
          return result;
        }

        attempt += 1;
        await this.sleepFn(this.config.retryBaseMs * 2 ** (attempt - 1));
      }

      this.metrics.flushFailures += 1;
      return { ok: false, written: 0 };
    })();

    try {
      return await this.inFlight;
    } finally {
      this.inFlight = null;
      this.metrics.inFlight = false;
      if (!this.shutdownRequested) {
        this.scheduleFlush(this.config.flushIntervalMs);
      }
    }
  }
}

let shutdownRegistered = false;

/**
 * @param {LiquidityWallWriter} writer
 */
export function registerLiquidityWallShutdown(writer) {
  if (shutdownRegistered || typeof process?.on !== "function") return;
  shutdownRegistered = true;
  const flush = () => {
    void writer.flushOnce();
  };
  process.on("SIGTERM", flush);
  process.on("SIGINT", flush);
}

export function resetLiquidityWallShutdownForTests() {
  shutdownRegistered = false;
}
