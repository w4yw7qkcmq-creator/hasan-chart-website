import {
  DEFAULT_LARGE_TRADE_THRESHOLD,
  HISTORY_FLOW_API_WINDOWS,
  HISTORY_LARGE_TRADE_API_WINDOWS,
  LARGE_TRADE_THRESHOLDS,
} from "../constants.js";
import {
  isAllowedExchange,
  normalizeSiteSymbol,
} from "../symbols.js";
import {
  parseAllowedOption,
  parsePositiveInt,
} from "../validation.js";

const HISTORY_SCOPES = ["aggregated", "okx", "binance", "bybit"];

/**
 * @param {URLSearchParams} searchParams
 */
export function validateHistoryFlowQuery(searchParams = new URLSearchParams()) {
  const symbol = normalizeSiteSymbol(searchParams.get("symbol"));
  if (!symbol) {
    return { valid: false, error: "INVALID_SYMBOL" };
  }

  const window = searchParams.get("window");
  if (!HISTORY_FLOW_API_WINDOWS.includes(window)) {
    return { valid: false, error: "INVALID_WINDOW" };
  }

  const scopeRaw = searchParams.get("scope") || "aggregated";
  const scope = scopeRaw === "aggregated" ? "aggregated" : scopeRaw;
  if (!HISTORY_SCOPES.includes(scope)) {
    return { valid: false, error: "INVALID_SCOPE" };
  }
  if (scope !== "aggregated" && !isAllowedExchange(scope)) {
    return { valid: false, error: "INVALID_SCOPE" };
  }

  return {
    valid: true,
    params: { symbol, window, scope },
  };
}

/**
 * @param {URLSearchParams} searchParams
 */
export function validateHistoryLargeTradesQuery(searchParams = new URLSearchParams()) {
  const symbol = normalizeSiteSymbol(searchParams.get("symbol"));
  if (!symbol) {
    return { valid: false, error: "INVALID_SYMBOL" };
  }

  const window = searchParams.get("window");
  if (!HISTORY_LARGE_TRADE_API_WINDOWS.includes(window)) {
    return { valid: false, error: "INVALID_WINDOW" };
  }

  const minNotional = parseAllowedOption(
    searchParams.get("minNotional"),
    LARGE_TRADE_THRESHOLDS,
    DEFAULT_LARGE_TRADE_THRESHOLD,
  );

  const limit = parsePositiveInt(searchParams.get("limit"), 50, { min: 1, max: 100 });

  const exchangeParam = searchParams.get("exchange");
  let exchange = null;
  if (exchangeParam) {
    if (!isAllowedExchange(exchangeParam)) {
      return { valid: false, error: "INVALID_EXCHANGE" };
    }
    exchange = exchangeParam;
  }

  return {
    valid: true,
    params: { symbol, window, minNotional, limit, exchange },
  };
}

export { HISTORY_SCOPES };
