import {
  DEPTH_LEVEL_OPTIONS,
  DEFAULT_DEPTH_LEVELS,
  DEFAULT_FLOW_WINDOW,
  DEFAULT_LARGE_TRADE_THRESHOLD,
  DEFAULT_LARGE_TRADE_WINDOW,
  DEFAULT_LIQUIDITY_RANGE_PERCENT,
  FLOW_WINDOW_OPTIONS,
  LARGE_TRADE_THRESHOLDS,
  LARGE_TRADE_WINDOW_OPTIONS,
  LIQUIDITY_RANGE_OPTIONS,
  MAX_ORDER_BOOK_LEVELS,
} from "./constants.js";
import {
  getDefaultPrecision,
  isAllowedExchange,
  isAllowedSiteSymbol,
  normalizeDisplayMode,
  normalizeExchange,
  normalizeSiteSymbol,
  PRECISION_OPTIONS,
} from "./symbols.js";

export function parsePositiveInt(value, fallback, { min = 1, max = 1000 } = {}) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function parsePositiveFloat(value, fallback) {
  const parsed = Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export function parseAllowedOption(value, allowed, fallback) {
  const normalized = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  if (allowed.includes(normalized)) return normalized;
  if (allowed.includes(value)) return value;
  return fallback;
}

export function validateMarketDepthQuery(searchParams = {}) {
  const symbol = normalizeSiteSymbol(searchParams.get("symbol")) || "BTCUSDT";
  const mode = normalizeDisplayMode(searchParams.get("mode"));
  const precision = parseAllowedOption(
    searchParams.get("precision"),
    PRECISION_OPTIONS,
    getDefaultPrecision(symbol)
  );
  const levels = parseAllowedOption(
    searchParams.get("levels"),
    DEPTH_LEVEL_OPTIONS,
    DEFAULT_DEPTH_LEVELS
  );
  const liquidityRange = parseAllowedOption(
    searchParams.get("liquidityRange"),
    LIQUIDITY_RANGE_OPTIONS,
    DEFAULT_LIQUIDITY_RANGE_PERCENT
  );
  const flowWindow = FLOW_WINDOW_OPTIONS.includes(searchParams.get("flowWindow"))
    ? searchParams.get("flowWindow")
    : DEFAULT_FLOW_WINDOW;
  const dominanceWindow = FLOW_WINDOW_OPTIONS.includes(searchParams.get("dominanceWindow"))
    ? searchParams.get("dominanceWindow")
    : flowWindow;
  const largeTradeWindow = LARGE_TRADE_WINDOW_OPTIONS.includes(searchParams.get("largeTradeWindow"))
    ? searchParams.get("largeTradeWindow")
    : DEFAULT_LARGE_TRADE_WINDOW;
  const largeTradeThreshold = parseAllowedOption(
    searchParams.get("largeTradeThreshold"),
    LARGE_TRADE_THRESHOLDS,
    DEFAULT_LARGE_TRADE_THRESHOLD
  );

  const exchangesParam = searchParams.get("exchanges");
  let exchanges = ["okx", "binance", "bybit"];
  if (exchangesParam) {
    exchanges = exchangesParam
      .split(",")
      .map((item) => normalizeExchange(item))
      .filter(Boolean);
    if (!exchanges.length) exchanges = ["okx", "binance", "bybit"];
  }

  if (mode !== "aggregated" && !isAllowedExchange(mode)) {
    return { valid: false, error: "INVALID_MODE" };
  }

  if (!isAllowedSiteSymbol(symbol)) {
    return { valid: false, error: "INVALID_SYMBOL" };
  }

  return {
    valid: true,
    params: {
      symbol,
      mode,
      precision,
      levels: Math.min(levels, MAX_ORDER_BOOK_LEVELS),
      liquidityRange,
      flowWindow,
      dominanceWindow,
      largeTradeWindow,
      largeTradeThreshold,
      exchanges,
    },
  };
}

export function assertNoMockInProduction() {
  if (process.env.NODE_ENV === "production" && process.env.MARKET_DEPTH_USE_MOCK === "1") {
    throw new Error("Mock market depth is forbidden in production");
  }
}
