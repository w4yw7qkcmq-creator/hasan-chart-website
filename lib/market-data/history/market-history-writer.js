import { getMarketHistoryConfig } from "./history-config.js";
import { HistoryMetrics } from "./history-metrics.js";

/**
 * @typedef {Object} FlowBucketWriteRow
 * @property {string} symbol
 * @property {string} exchangeScope
 * @property {number} bucketStart
 * @property {number} bucketSeconds
 * @property {number} buyNotional
 * @property {number} sellNotional
 * @property {number} buyCount
 * @property {number} sellCount
 * @property {number} maxTradeNotional
 * @property {number} large25kCount
 * @property {number} large50kCount
 * @property {number} large100kCount
 * @property {number} large250kCount
 * @property {number} large500kCount
 * @property {number} large1mCount
 */

/**
 * @typedef {Object} LargeTradeWriteRow
 * @property {string} tradeKey
 * @property {string} symbol
 * @property {string} exchange
 * @property {number} ts
 * @property {"buy"|"sell"} side
 * @property {number} price
 * @property {number} quantity
 * @property {number} notional
 * @property {number} thresholdBand
 */

/**
 * @typedef {Object} HistoryWriteResult
 * @property {boolean} ok
 * @property {number} status
 * @property {number} written
 * @property {number} skipped
 * @property {string} [errorCode]
 * @property {string} [errorMessageSafe]
 * @property {number} latencyMs
 * @property {boolean} [retryable]
 */

/**
 * Overflow policy: drop oldest queued large-trade events when queue is full.
 * Flow buckets stay in the aggregator until acknowledged after a successful write.
 */
export class MarketHistoryWriter {
  /**
   * @param {{
   *   client: {
   *     upsertFlowBuckets: (rows: FlowBucketWriteRow[]) => Promise<HistoryWriteResult>,
   *     insertLargeTrades: (rows: LargeTradeWriteRow[]) => Promise<HistoryWriteResult>,
   *   },
   *   config?: ReturnType<typeof getMarketHistoryConfig>,
   *   metrics?: HistoryMetrics,
   *   now?: () => number,
   *   sleep?: (ms: number) => Promise<void>,
   *   getReadyFlowBuckets?: (now: number) => { snapshots: FlowBucketWriteRow[], keys: string[] },
   *   acknowledgeFlowBuckets?: (keys: string[]) => number,
   *   getPendingBucketStats?: (now: number) => { count: number, oldestAgeMs: number|null },
   * }} options
   */
  constructor(options) {
    this.client = options.client;
    this.config = options.config ?? getMarketHistoryConfig({ enabled: true });
    this.metrics = options.metrics ?? new HistoryMetrics();
    this.nowFn = options.now ?? (() => Date.now());
    this.sleepFn =
      options.sleep ??
      ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

    this.getReadyFlowBuckets = options.getReadyFlowBuckets ?? (() => ({ snapshots: [], keys: [] }));
    this.acknowledgeFlowBuckets = options.acknowledgeFlowBuckets ?? (() => 0);
    this.getPendingBucketStats = options.getPendingBucketStats ?? (() => ({ count: 0, oldestAgeMs: null }));

    /** @type {LargeTradeWriteRow[]} */
    this.largeTradeQueue = [];
    /** @type {LargeTradeWriteRow[]} */
    this.largeTradeDeadLetter = [];
    this.deadLetterMax = Math.min(this.config.queueMax, 1_000);

    this.flushTimer = null;
    this.started = false;
    this.inFlight = null;
    this.shutdownRequested = false;
  }

  /**
   * @param {LargeTradeWriteRow} row
   */
  enqueueLargeTrade(row) {
    if (this.largeTradeQueue.length >= this.config.queueMax) {
      this.largeTradeQueue.shift();
      this.metrics.droppedEvents += 1;
    }
    this.largeTradeQueue.push(row);
    this.metrics.largeTradesQueued += 1;
    this.metrics.largeTradesPending = this.largeTradeQueue.length;

    if (this.largeTradeQueue.length >= this.config.batchSize) {
      this.scheduleFlush(0);
    }
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
    this.started = false;
    return this;
  }

  /**
   * @param {number} delayMs
   */
  scheduleFlush(delayMs) {
    if (this.shutdownRequested || !this.started) return;
    if (this.flushTimer) return;

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush().finally(() => {
        if (!this.shutdownRequested && this.started) {
          this.scheduleFlush(this.config.flushIntervalMs);
        }
      });
    }, delayMs);
  }

  /**
   * @param {HistoryWriteResult} result
   * @param {number} attempt
   * @returns {Promise<boolean>}
   */
  async maybeRetry(result, attempt) {
    if (result.ok) return false;
    if (!result.retryable) return false;
    if (attempt >= this.config.retryMax) return false;

    const delay = this.config.retryBaseMs * 2 ** attempt;
    await this.sleepFn(delay);
    return true;
  }

  /**
   * @param {(rows: FlowBucketWriteRow[]) => Promise<HistoryWriteResult>} writeFn
   * @param {FlowBucketWriteRow[]} rows
   */
  async writeWithRetry(writeFn, rows) {
    let attempt = 0;
    while (true) {
      const result = await writeFn(rows);
      if (result.ok) return result;

      const shouldRetry = await this.maybeRetry(result, attempt);
      if (!shouldRetry) return result;
      attempt += 1;
    }
  }

  async flush() {
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
    const now = this.nowFn();
    this.metrics.flushAttempts += 1;
    this.metrics.inFlight = true;
    this.metrics.lastFlushAt = now;

    const pendingStats = this.getPendingBucketStats(now);
    this.metrics.flowBucketsPending = pendingStats.count;
    this.metrics.oldestPendingBucketAgeMs = pendingStats.oldestAgeMs;

    const { snapshots, keys } = this.getReadyFlowBuckets(now);
    const flowBatch = snapshots.slice(0, this.config.batchSize);
    const flowKeys = keys.slice(0, this.config.batchSize);

    const largeBatch = this.largeTradeQueue.splice(0, this.config.batchSize);
    this.metrics.largeTradesPending = this.largeTradeQueue.length;

    let flowResult = { ok: true, written: 0, skipped: 0, latencyMs: 0, status: 200 };
    let largeResult = { ok: true, written: 0, skipped: 0, latencyMs: 0, status: 200 };
    let hadWork = flowBatch.length > 0 || largeBatch.length > 0;

    if (flowBatch.length > 0) {
      flowResult = await this.writeWithRetry(
        (rows) => this.client.upsertFlowBuckets(rows),
        flowBatch,
      );
    }

    if (largeBatch.length > 0) {
      largeResult = await this.writeWithRetry(
        (rows) => this.client.insertLargeTrades(rows),
        largeBatch,
      );
    }

    const totalLatency = Math.max(flowResult.latencyMs || 0, largeResult.latencyMs || 0);
    this.metrics.lastLatencyMs = totalLatency;

    if (flowResult.ok && flowKeys.length > 0) {
      this.acknowledgeFlowBuckets(flowKeys);
      this.metrics.rowsWrittenFlow += flowResult.written;
    }

    if (largeResult.ok) {
      this.metrics.rowsWrittenLarge += largeResult.written;
    } else {
      this.requeueLargeTrades(largeBatch);
    }

    const flushOk = (!flowBatch.length || flowResult.ok) && (!largeBatch.length || largeResult.ok);
    if (flushOk && hadWork) {
      this.metrics.flushSuccesses += 1;
      this.metrics.lastSuccessfulFlushAt = this.nowFn();
      this.metrics.lastErrorSafe = null;
    } else if (!flushOk) {
      this.metrics.flushFailures += 1;
      const error =
        !flowResult.ok
          ? flowResult.errorMessageSafe || flowResult.errorCode
          : largeResult.errorMessageSafe || largeResult.errorCode;
      this.metrics.lastErrorSafe = error || "flush_failed";
    }

    const pendingAfter = this.getPendingBucketStats(this.nowFn());
    this.metrics.flowBucketsPending = pendingAfter.count;
    this.metrics.oldestPendingBucketAgeMs = pendingAfter.oldestAgeMs;
    this.metrics.largeTradesPending = this.largeTradeQueue.length;

    return {
      flowResult,
      largeResult,
      flushOk,
    };
  }

  /**
   * @param {LargeTradeWriteRow[]} rows
   */
  requeueLargeTrades(rows) {
    if (!rows.length) return;

    const combined = [...rows, ...this.largeTradeQueue];
    if (combined.length > this.config.queueMax) {
      const overflow = combined.length - this.config.queueMax;
      combined.splice(0, overflow);
      this.metrics.droppedEvents += overflow;
    }
    this.largeTradeQueue = combined;
    this.metrics.largeTradesPending = this.largeTradeQueue.length;

    while (this.largeTradeDeadLetter.length + rows.length > this.deadLetterMax) {
      this.largeTradeDeadLetter.shift();
    }
    for (const row of rows) {
      this.largeTradeDeadLetter.push(row);
    }
  }

  /**
   * @param {{ timeoutMs?: number }} [options]
   */
  async shutdown(options = {}) {
    this.stop();
    const timeoutMs = options.timeoutMs ?? this.config.shutdownFlushTimeoutMs;
    const flushPromise = this.flush();
    let timeoutId;
    const timeoutPromise = new Promise((resolve) => {
      timeoutId = setTimeout(resolve, timeoutMs);
    });
    await Promise.race([flushPromise, timeoutPromise]);
    clearTimeout(timeoutId);
  }

  getStatus() {
    return this.metrics.snapshot();
  }
}

export function registerMarketHistoryShutdown(writer) {
  if (globalThis.__marketHistoryShutdownRegistered) return;
  globalThis.__marketHistoryShutdownRegistered = true;

  const handler = () => {
    void writer.shutdown({ timeoutMs: writer.config.shutdownFlushTimeoutMs });
  };

  process.once("SIGTERM", handler);
  process.once("SIGINT", handler);
}
