import { getMarketHistoryConfig } from "../history-config.js";
import { LiquidityWallMetrics } from "./liquidity-wall-metrics.js";
import {
  buildLiquidityWallFingerprint,
  dedupeBatchByKey,
  filterUnchangedRows,
} from "../write-fingerprint.js";

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
   *   writeState?: { lastWrittenFingerprints: Map<string, string>, skippedUnchangedWrites?: number, skippedDuplicateKeys?: number },
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
    this.writeState = options.writeState ?? { lastWrittenFingerprints: new Map() };
    this.flushTimer = null;
    this.started = false;
    this.inFlight = null;
    this.shutdownRequested = false;
    this.emptyFlushes = 0;
    this.unchangedSkips = 0;
    this.duplicateKeySkips = 0;
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
    if (this.shutdownRequested || !this.started || this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flushOnce().finally(() => {
        if (!this.shutdownRequested && this.started) {
          this.scheduleFlush(this.config.flushIntervalMs);
        }
      });
    }, delayMs);
  }

  /**
   * @param {LiquidityWallWriteRow[]} rows
   * @returns {{ rows: LiquidityWallWriteRow[], skippedUnchanged: number, skippedDuplicate: number }}
   */
  prepareWriteBatch(rows) {
    const deduped = dedupeBatchByKey(rows, (row) => row.wallKey);
    const skippedDuplicate = Math.max(0, rows.length - deduped.length);
    const { changed, skipped } = filterUnchangedRows(
      deduped,
      (row) => row.wallKey,
      buildLiquidityWallFingerprint,
      this.writeState.lastWrittenFingerprints,
    );
    return {
      rows: changed,
      skippedUnchanged: skipped,
      skippedDuplicate,
    };
  }

  async flushOnce() {
    if (this.inFlight) {
      return this.inFlight;
    }

    this.inFlight = this.runFlush().finally(() => {
      this.inFlight = null;
      this.metrics.inFlight = false;
    });
    return this.inFlight;
  }

  async runFlush() {
    const pending = this.getPendingRows();
    const prepared = this.prepareWriteBatch(pending);
    this.duplicateKeySkips += prepared.skippedDuplicate;
    this.unchangedSkips += prepared.skippedUnchanged;

    if (!prepared.rows.length) {
      this.emptyFlushes += 1;
      if (prepared.skippedUnchanged > 0 || prepared.skippedDuplicate > 0) {
        const unchangedKeys = pending.map((row) => row.wallKey);
        this.acknowledgeRows(unchangedKeys);
      }
      return { ok: true, written: 0, skipped: prepared.skippedUnchanged + prepared.skippedDuplicate };
    }

    this.metrics.flushAttempts += 1;
    this.metrics.inFlight = true;
    this.metrics.lastFlush = this.nowFn();

    /** @type {LiquidityWallWriteRow[]} */
    let batch = prepared.rows;
    let attempt = 0;

    while (attempt <= this.config.retryMax) {
      const result = await this.client.upsertLiquidityWalls(batch);
      this.metrics.lastLatencyMs = result.latencyMs ?? null;
      if (result.ok) {
        this.acknowledgeRows(batch.map((row) => row.wallKey));
        this.metrics.flushSuccesses += 1;
        this.metrics.lastSuccessfulFlushAt = this.nowFn();
        this.metrics.storedWalls += result.written ?? batch.length;
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
      batch = this.prepareWriteBatch(batch).rows;
      if (!batch.length) {
        this.metrics.flushSuccesses += 1;
        return { ok: true, written: 0 };
      }
    }

    this.metrics.flushFailures += 1;
    return { ok: false, written: 0 };
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
