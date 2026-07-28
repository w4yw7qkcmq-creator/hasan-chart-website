function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Only explicit "true" or "1" enables writes.
 * @param {string|undefined} value
 * @returns {boolean}
 */
export function parseExplicitBoolean(value) {
  if (value == null) return false;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "true" || normalized === "1";
}

/**
 * @returns {boolean}
 */
export function isMarketHistoryWriteEnabled() {
  return parseExplicitBoolean(process.env.MARKET_HISTORY_WRITE_ENABLED);
}

/**
 * @returns {{
 *   enabled: boolean,
 *   flushIntervalMs: number,
 *   batchSize: number,
 *   queueMax: number,
 *   retryMax: number,
 *   retryBaseMs: number,
 *   requestTimeoutMs: number,
 *   shutdownFlushTimeoutMs: number,
 * }}
 */
export function getMarketHistoryConfig(overrides = {}) {
  return {
    enabled: overrides.enabled ?? isMarketHistoryWriteEnabled(),
    flushIntervalMs: parsePositiveInt(
      overrides.flushIntervalMs ?? process.env.MARKET_HISTORY_FLUSH_INTERVAL_MS,
      10_000,
    ),
    batchSize: parsePositiveInt(
      overrides.batchSize ?? process.env.MARKET_HISTORY_BATCH_SIZE,
      200,
    ),
    queueMax: parsePositiveInt(
      overrides.queueMax ?? process.env.MARKET_HISTORY_QUEUE_MAX,
      10_000,
    ),
    retryMax: parsePositiveInt(
      overrides.retryMax ?? process.env.MARKET_HISTORY_RETRY_MAX,
      3,
    ),
    retryBaseMs: parsePositiveInt(
      overrides.retryBaseMs ?? process.env.MARKET_HISTORY_RETRY_BASE_MS,
      500,
    ),
    requestTimeoutMs: parsePositiveInt(overrides.requestTimeoutMs, 8_000),
    shutdownFlushTimeoutMs: parsePositiveInt(overrides.shutdownFlushTimeoutMs, 1_500),
  };
}
