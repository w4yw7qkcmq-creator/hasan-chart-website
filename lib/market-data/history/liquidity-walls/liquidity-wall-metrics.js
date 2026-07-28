export class LiquidityWallMetrics {
  constructor() {
    this.enabled = false;
    this.collectingSince = null;
    this.trackedWalls = 0;
    this.storedWalls = 0;
    this.pending = 0;
    this.flushAttempts = 0;
    this.flushSuccesses = 0;
    this.flushFailures = 0;
    this.lastFlush = null;
    this.lastSuccessfulFlushAt = null;
    this.lastErrorSafe = null;
    this.lastLatencyMs = null;
    this.inFlight = false;
    this.samplesReceived = 0;
    this.wallsDetected = 0;
  }

  markStarted(enabled) {
    this.enabled = enabled;
    if (enabled && this.collectingSince == null) {
      this.collectingSince = Date.now();
    }
  }

  snapshot() {
    return {
      enabled: this.enabled,
      collectingSince: this.collectingSince,
      trackedWalls: this.trackedWalls,
      storedWalls: this.storedWalls,
      pending: this.pending,
      flushAttempts: this.flushAttempts,
      flushSuccesses: this.flushSuccesses,
      flushFailures: this.flushFailures,
      lastFlush: this.lastFlush,
      lastSuccessfulFlushAt: this.lastSuccessfulFlushAt,
      lastErrorSafe: this.lastErrorSafe,
      lastLatencyMs: this.lastLatencyMs,
      inFlight: this.inFlight,
      samplesReceived: this.samplesReceived,
      wallsDetected: this.wallsDetected,
    };
  }
}
