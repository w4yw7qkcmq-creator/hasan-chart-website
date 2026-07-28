/** @typedef {"1m"|"5m"|"15m"|"1h"|"4h"|"12h"|"1d"|"3d"|"7d"} HistoryWindow */

export const BUCKET_SECONDS = 60;
export const BUCKET_MS = 60_000;
export const LATE_TRADE_GRACE_MS = 90_000;
export const DEDUP_TTL_MS = 15 * 60 * 1000;
export const DEDUP_MAX_ENTRIES = 250_000;

export const LARGE_TRADE_BANDS = [25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000];

/** @type {HistoryWindow[]} */
export const HISTORY_WINDOW_OPTIONS = ["1m", "5m", "15m", "1h", "4h", "12h", "1d", "3d", "7d"];

/** @type {Record<HistoryWindow, number>} */
export const HISTORY_WINDOW_MS = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "12h": 12 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
  "3d": 3 * 24 * 60 * 60_000,
  "7d": 7 * 24 * 60 * 60_000,
};

export const AGGREGATED_SCOPE = "aggregated";

/**
 * Phase 3B upsert semantics (documentation only — no writer in 3A).
 *
 * market_flow_buckets: ON CONFLICT DO UPDATE with full bucket snapshot (replace),
 * not increment — retries must not double-count.
 *
 * market_large_trades: ON CONFLICT(trade_key) DO NOTHING
 */
export const FLOW_BUCKET_UPSERT_SEMANTICS = "replace";
