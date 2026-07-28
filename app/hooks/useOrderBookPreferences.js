"use client";

import {
  DEFAULT_LARGE_TRADE_THRESHOLD,
  DEFAULT_LARGE_TRADE_WINDOW,
  DEFAULT_FLOW_WINDOW,
  LARGE_TRADE_THRESHOLDS,
  LARGE_TRADE_WINDOW_OPTIONS,
} from "../../lib/market-data/constants.js";

export const PREFERENCES_SCHEMA_VERSION = 3;
export const STORAGE_KEY = "hasan-chart-order-book-prefs-v3";
export const LEGACY_STORAGE_KEYS = [
  "hasan-chart-order-book-prefs-v2",
  "hasan-chart-order-book-prefs-v1",
];

const LEGACY_DEFAULT_LARGE_TRADE_THRESHOLD = 100_000;

export const DEFAULT_ORDER_BOOK_PREFS = {
  symbol: "BTCUSDT",
  mode: "aggregated",
  precision: null,
  levels: 20,
  liquidityRange: 0.5,
  flowWindow: DEFAULT_FLOW_WINDOW,
  dominanceWindow: DEFAULT_FLOW_WINDOW,
  largeTradeThreshold: DEFAULT_LARGE_TRADE_THRESHOLD,
  largeTradeWindow: DEFAULT_LARGE_TRADE_WINDOW,
  mobileSide: "all",
};

function sanitizeThreshold(value) {
  const parsed = Number(value);
  return LARGE_TRADE_THRESHOLDS.includes(parsed) ? parsed : DEFAULT_LARGE_TRADE_THRESHOLD;
}

function sanitizeLargeTradeWindow(value) {
  return LARGE_TRADE_WINDOW_OPTIONS.includes(value) ? value : DEFAULT_LARGE_TRADE_WINDOW;
}

export function migrateOrderBookPreferences(stored = {}, { legacy = false } = {}) {
  const next = { ...stored };

  if (!next.largeTradeWindow) {
    next.largeTradeWindow = DEFAULT_LARGE_TRADE_WINDOW;
  } else {
    next.largeTradeWindow = sanitizeLargeTradeWindow(next.largeTradeWindow);
  }

  if (!next.dominanceWindow && next.flowWindow) {
    next.dominanceWindow = next.flowWindow;
  }

  const explicitThreshold = next.__explicitLargeTradeThreshold === true;
  const threshold = sanitizeThreshold(next.largeTradeThreshold);

  if (
    legacy &&
    !explicitThreshold &&
    Number(next.largeTradeThreshold) === LEGACY_DEFAULT_LARGE_TRADE_THRESHOLD
  ) {
    next.largeTradeThreshold = DEFAULT_LARGE_TRADE_THRESHOLD;
  } else {
    next.largeTradeThreshold = threshold;
  }

  next.__schemaVersion = PREFERENCES_SCHEMA_VERSION;
  delete next.__explicitLargeTradeThreshold;

  return normalizeOrderBookPreferences(next);
}

export function normalizeOrderBookPreferences(stored = {}) {
  const merged = {
    ...DEFAULT_ORDER_BOOK_PREFS,
    ...stored,
  };

  merged.largeTradeThreshold = sanitizeThreshold(merged.largeTradeThreshold);
  merged.largeTradeWindow = sanitizeLargeTradeWindow(merged.largeTradeWindow);

  if (!merged.dominanceWindow) {
    merged.dominanceWindow = merged.flowWindow || DEFAULT_FLOW_WINDOW;
  }

  delete merged.__schemaVersion;
  delete merged.__explicitLargeTradeThreshold;

  return merged;
}

export function readStoredOrderBookPreferences() {
  if (typeof window === "undefined") return { ...DEFAULT_ORDER_BOOK_PREFS };

  try {
    const currentRaw = localStorage.getItem(STORAGE_KEY);
    if (currentRaw) {
      const parsed = JSON.parse(currentRaw);
      if (parsed?.__schemaVersion === PREFERENCES_SCHEMA_VERSION) {
        const normalized = normalizeOrderBookPreferences(parsed);
        if (parsed.__explicitLargeTradeThreshold === true) {
          normalized.__explicitLargeTradeThreshold = true;
        }
        return normalized;
      }

      const migrated = migrateOrderBookPreferences(parsed, { legacy: false });
      writeOrderBookPreferences(migrated, {
        explicitLargeTradeThreshold: parsed.__explicitLargeTradeThreshold === true,
      });
      return migrated;
    }

    for (const legacyKey of LEGACY_STORAGE_KEYS) {
      const legacyRaw = localStorage.getItem(legacyKey);
      if (!legacyRaw) continue;

      const parsed = JSON.parse(legacyRaw);
      const migrated = migrateOrderBookPreferences(parsed, { legacy: true });
      writeOrderBookPreferences(migrated, {
        explicitLargeTradeThreshold: parsed.__explicitLargeTradeThreshold === true,
      });
      localStorage.removeItem(legacyKey);
      return migrated;
    }

    return { ...DEFAULT_ORDER_BOOK_PREFS };
  } catch {
    return { ...DEFAULT_ORDER_BOOK_PREFS };
  }
}

export function readOrderBookPreferences() {
  return readStoredOrderBookPreferences();
}

export function writeOrderBookPreferences(prefs, { explicitLargeTradeThreshold = null } = {}) {
  if (typeof window === "undefined") return;

  try {
    const normalized = normalizeOrderBookPreferences(prefs);
    const payload = {
      ...normalized,
      __schemaVersion: PREFERENCES_SCHEMA_VERSION,
    };

    const explicit =
      explicitLargeTradeThreshold === true
        ? true
        : prefs.__explicitLargeTradeThreshold === true
          ? true
          : null;

    if (explicit === true) {
      payload.__explicitLargeTradeThreshold = true;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore quota errors
  }
}

export function buildMarketDepthQuery(prefs) {
  const params = new URLSearchParams();
  params.set("symbol", prefs.symbol);
  params.set("mode", prefs.mode);
  if (prefs.precision != null) params.set("precision", String(prefs.precision));
  params.set("levels", String(prefs.levels));
  params.set("liquidityRange", String(prefs.liquidityRange));
  params.set("flowWindow", prefs.flowWindow);
  params.set("dominanceWindow", prefs.dominanceWindow || prefs.flowWindow);
  params.set("largeTradeWindow", prefs.largeTradeWindow || DEFAULT_LARGE_TRADE_WINDOW);
  params.set("largeTradeThreshold", String(prefs.largeTradeThreshold));
  return params.toString();
}
