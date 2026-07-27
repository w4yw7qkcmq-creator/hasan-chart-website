"use client";

const STORAGE_KEY = "hasan-chart-order-book-prefs-v1";

export const DEFAULT_ORDER_BOOK_PREFS = {
  symbol: "BTCUSDT",
  mode: "aggregated",
  precision: null,
  levels: 20,
  liquidityRange: 0.5,
  flowWindow: "5m",
  largeTradeThreshold: 100_000,
  mobileSide: "all",
};

export function readOrderBookPreferences() {
  if (typeof window === "undefined") return { ...DEFAULT_ORDER_BOOK_PREFS };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_ORDER_BOOK_PREFS };
    return { ...DEFAULT_ORDER_BOOK_PREFS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_ORDER_BOOK_PREFS };
  }
}

export function writeOrderBookPreferences(prefs) {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
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
  params.set("largeTradeThreshold", String(prefs.largeTradeThreshold));
  return params.toString();
}
