const DEFAULT_MULTIPLIER = 1.5;

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function parseMultiplier(value, fallback = DEFAULT_MULTIPLIER) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
}

/**
 * Bounded exponential idle backoff for queue workers polling empty tables.
 * Resets to minMs immediately when work is observed.
 */
class AdaptiveIdleBackoff {
  constructor({ minMs, maxMs, multiplier = DEFAULT_MULTIPLIER } = {}) {
    if (!Number.isFinite(minMs) || minMs <= 0) {
      throw new Error("AdaptiveIdleBackoff requires minMs > 0");
    }
    if (!Number.isFinite(maxMs) || maxMs < minMs) {
      throw new Error("AdaptiveIdleBackoff requires maxMs >= minMs");
    }

    this.minMs = minMs;
    this.maxMs = maxMs;
    this.multiplier = multiplier;
    this.consecutiveEmptyCycles = 0;
    this.currentDelayMs = minMs;
  }

  recordWork() {
    this.consecutiveEmptyCycles = 0;
    this.currentDelayMs = this.minMs;
    return {
      sleepMs: 0,
      consecutiveEmptyCycles: 0,
      delayMs: this.minMs,
      reset: true,
    };
  }

  recordEmpty() {
    this.consecutiveEmptyCycles += 1;
    const sleepMs = this.currentDelayMs;
    const nextDelay = Math.min(Math.ceil(this.currentDelayMs * this.multiplier), this.maxMs);
    this.currentDelayMs = nextDelay;

    return {
      sleepMs,
      consecutiveEmptyCycles: this.consecutiveEmptyCycles,
      delayMs: sleepMs,
      nextDelayMs: this.currentDelayMs,
      reset: false,
    };
  }

  snapshot() {
    return {
      minMs: this.minMs,
      maxMs: this.maxMs,
      multiplier: this.multiplier,
      consecutiveEmptyCycles: this.consecutiveEmptyCycles,
      currentDelayMs: this.currentDelayMs,
    };
  }
}

function resolveAdaptiveIdleBounds(env, {
  minKey,
  maxKey,
  legacyMinKey,
  defaultMinMs,
  defaultMaxMs,
}) {
  const legacyMin = env[legacyMinKey];
  const explicitMin = env[minKey];
  const minMs = Math.max(
    1000,
    parsePositiveInt(explicitMin ?? legacyMin, defaultMinMs)
  );
  const maxMs = Math.max(
    minMs,
    parsePositiveInt(env[maxKey], defaultMaxMs)
  );

  return { minMs, maxMs };
}

module.exports = {
  DEFAULT_MULTIPLIER,
  AdaptiveIdleBackoff,
  parsePositiveInt,
  parseMultiplier,
  resolveAdaptiveIdleBounds,
};
