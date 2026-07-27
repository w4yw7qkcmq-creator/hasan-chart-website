/** @typedef {"BTCUSDT"|"ETHUSDT"|"SOLUSDT"|"XRPUSDT"} SiteSymbol */
/** @typedef {"okx"|"binance"|"bybit"} ExchangeId */
/** @typedef {"aggregated"|ExchangeId} DisplayMode */

export const SITE_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT"];

export const EXCHANGE_IDS = ["okx", "binance", "bybit"];

export const SYMBOL_LABELS = {
  BTCUSDT: "BTC/USDT",
  ETHUSDT: "ETH/USDT",
  SOLUSDT: "SOL/USDT",
  XRPUSDT: "XRP/USDT",
};

export const EXCHANGE_LABELS = {
  okx: "OKX",
  binance: "Binance",
  bybit: "Bybit",
  aggregated: "مجمّع",
};

const EXCHANGE_SYMBOL_MAP = {
  okx: {
    BTCUSDT: "BTC-USDT",
    ETHUSDT: "ETH-USDT",
    SOLUSDT: "SOL-USDT",
    XRPUSDT: "XRP-USDT",
  },
  binance: {
    BTCUSDT: "BTCUSDT",
    ETHUSDT: "ETHUSDT",
    SOLUSDT: "SOLUSDT",
    XRPUSDT: "XRPUSDT",
  },
  bybit: {
    BTCUSDT: "BTCUSDT",
    ETHUSDT: "ETHUSDT",
    SOLUSDT: "SOLUSDT",
    XRPUSDT: "XRPUSDT",
  },
};

const BASE_ASSET = {
  BTCUSDT: "BTC",
  ETHUSDT: "ETH",
  SOLUSDT: "SOL",
  XRPUSDT: "XRP",
};

export function isAllowedSiteSymbol(value) {
  return SITE_SYMBOLS.includes(String(value || "").toUpperCase());
}

export function normalizeSiteSymbol(value) {
  const symbol = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return isAllowedSiteSymbol(symbol) ? symbol : null;
}

export function isAllowedExchange(value) {
  return EXCHANGE_IDS.includes(String(value || "").toLowerCase());
}

export function normalizeExchange(value) {
  const exchange = String(value || "").toLowerCase();
  return isAllowedExchange(exchange) ? exchange : null;
}

export function normalizeDisplayMode(value) {
  const mode = String(value || "aggregated").toLowerCase();
  if (mode === "aggregated" || mode === "all") return "aggregated";
  return normalizeExchange(mode) || "aggregated";
}

export function toExchangeSymbol(exchange, siteSymbol) {
  const normalizedExchange = normalizeExchange(exchange);
  const normalizedSymbol = normalizeSiteSymbol(siteSymbol);
  if (!normalizedExchange || !normalizedSymbol) return null;
  return EXCHANGE_SYMBOL_MAP[normalizedExchange]?.[normalizedSymbol] || null;
}

export function getBaseAsset(siteSymbol) {
  const normalized = normalizeSiteSymbol(siteSymbol);
  return normalized ? BASE_ASSET[normalized] : null;
}

export function getDefaultPrecision(siteSymbol) {
  const symbol = normalizeSiteSymbol(siteSymbol);
  if (symbol === "BTCUSDT") return 1;
  if (symbol === "ETHUSDT") return 0.1;
  if (symbol === "SOLUSDT") return 0.01;
  if (symbol === "XRPUSDT") return 0.0001;
  return 0.01;
}

export const PRECISION_OPTIONS = [0.0001, 0.001, 0.01, 0.1, 1, 10];
