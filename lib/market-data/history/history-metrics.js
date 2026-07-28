export class HistoryMetrics {
  constructor() {
    this.enabled = false;
    this.startedAt = null;
    this.tradesReceived = 0;
    this.tradesAccepted = 0;
    this.tradesDuplicate = 0;
    this.tradesInvalid = 0;
    this.lateAccepted = 0;
    this.lateDropped = 0;
    this.largeTradesQueued = 0;
    this.flowBucketsPending = 0;
    this.largeTradesPending = 0;
    this.flushAttempts = 0;
    this.flushSuccesses = 0;
    this.flushFailures = 0;
    this.rowsWrittenFlow = 0;
    this.rowsWrittenLarge = 0;
    this.droppedEvents = 0;
    this.lastFlushAt = null;
    this.lastSuccessfulFlushAt = null;
    this.lastErrorSafe = null;
    this.lastLatencyMs = null;
    this.inFlight = false;
    this.oldestPendingBucketAgeMs = null;
    this.collectingSince = null;
  }

  markStarted(enabled) {
    this.enabled = enabled;
    if (enabled && this.startedAt == null) {
      this.startedAt = Date.now();
    }
  }

  snapshot() {
    return {
      enabled: this.enabled,
      startedAt: this.startedAt,
      tradesReceived: this.tradesReceived,
      tradesAccepted: this.tradesAccepted,
      tradesDuplicate: this.tradesDuplicate,
      tradesInvalid: this.tradesInvalid,
      lateAccepted: this.lateAccepted,
      lateDropped: this.lateDropped,
      largeTradesQueued: this.largeTradesQueued,
      flowBucketsPending: this.flowBucketsPending,
      largeTradesPending: this.largeTradesPending,
      flushAttempts: this.flushAttempts,
      flushSuccesses: this.flushSuccesses,
      flushFailures: this.flushFailures,
      rowsWrittenFlow: this.rowsWrittenFlow,
      rowsWrittenLarge: this.rowsWrittenLarge,
      droppedEvents: this.droppedEvents,
      lastFlushAt: this.lastFlushAt,
      lastSuccessfulFlushAt: this.lastSuccessfulFlushAt,
      lastErrorSafe: this.lastErrorSafe,
      lastLatencyMs: this.lastLatencyMs,
      inFlight: this.inFlight,
      oldestPendingBucketAgeMs: this.oldestPendingBucketAgeMs,
      collectingSince: this.collectingSince,
    };
  }
}
