/** @typedef {"BTCUSDT"|"ETHUSDT"|"SOLUSDT"|"XRPUSDT"} SiteSymbol */
/** @typedef {"okx"|"binance"|"bybit"} ExchangeId */
/** @typedef {"aggregated"|ExchangeId} DisplayMode */

import { CORE_SYMBOLS } from "./dynamic-symbol-constants.js";
import {
  getExchangeMarketSymbolFromRegistry,
  getRegistryEntry,
  isKnownRegistrySymbol,
} from "./symbol-registry.js";
import { resolveDefaultPrecision } from "./symbol-thresholds.js";

export const SITE_SYMBOLS = CORE_SYMBOLS;

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

const LEGACY_EXCHANGE_SYMBOL_MAP = {
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

/**
 * Normalize user input to canonical site symbol (e.g. BTCUSDT).
 * @param {string|null|undefined} input
 * @returns {string|null}
 */
export function normalizeMarketSymbol(input) {
  const raw = String(input || "").trim().toUpperCase();
  if (!raw) return null;

  const compact = raw.replace(/[^A-Z0-9]/g, "");
  if (!compact) return null;

  if (compact.endsWith("USDT") && compact.length > 4) {
    return compact;
  }

  if (/^[A-Z0-9]{2,12}$/.test(compact)) {
    return `${compact}USDT`;
  }

  return null;
}

export function isValidMarketSymbolFormat(symbol) {
  const normalized = normalizeMarketSymbol(symbol);
  if (!normalized) return false;
  const base = normalized.slice(0, -4);
  return /^[A-Z0-9]{2,12}$/.test(base);
}

export function formatMarketSymbol(symbol) {
  const normalized = normalizeMarketSymbol(symbol);
  if (!normalized) return String(symbol || "");
  const entry = getRegistryEntry(normalized);
  if (entry?.displaySymbol) return entry.displaySymbol;
  const base = normalized.replace(/USDT$/, "");
  return `${base}/USDT`;
}

export function isSupportedMarketSymbol(symbol, options) {
  const normalized = normalizeMarketSymbol(symbol);
  if (!normalized) return false;
  if (SITE_SYMBOLS.includes(normalized)) return true;
  return isKnownRegistrySymbol(normalized, options);
}

export function isAllowedSiteSymbol(value, options) {
  return isSupportedMarketSymbol(value, options);
}

export function normalizeSiteSymbol(value, options) {
  const normalized = normalizeMarketSymbol(value);
  if (!normalized) return null;
  return isSupportedMarketSymbol(normalized, options) ? normalized : null;
}

export function getExchangeMarketSymbol(exchange, siteSymbol) {
  const normalizedExchange = normalizeExchange(exchange);
  const normalizedSymbol = normalizeMarketSymbol(siteSymbol);
  if (!normalizedExchange || !normalizedSymbol) return null;

  const fromRegistry = getExchangeMarketSymbolFromRegistry(normalizedSymbol, normalizedExchange);
  if (fromRegistry) return fromRegistry;

  return LEGACY_EXCHANGE_SYMBOL_MAP[normalizedExchange]?.[normalizedSymbol] || null;
}

/** @deprecated use getExchangeMarketSymbol */
export function toExchangeSymbol(exchange, siteSymbol) {
  return getExchangeMarketSymbol(exchange, siteSymbol);
}

export function getBaseAsset(siteSymbol) {
  const normalized = normalizeMarketSymbol(siteSymbol);
  if (!normalized) return null;
  const entry = getRegistryEntry(normalized);
  if (entry?.base) return entry.base;
  return BASE_ASSET[normalized] || normalized.replace(/USDT$/, "");
}

export function getDefaultPrecision(siteSymbol, lastPrice) {
  const symbol = normalizeMarketSymbol(siteSymbol);
  if (!symbol) return 0.01;

  if (symbol === "BTCUSDT") return 1;
  if (symbol === "ETHUSDT") return 0.1;
  if (symbol === "SOLUSDT") return 0.01;
  if (symbol === "XRPUSDT") return 0.0001;

  return resolveDefaultPrecision(lastPrice);
}

export const SYMBOL_SEARCH_ENTRIES = SITE_SYMBOLS.map((symbol) => ({
  value: symbol,
  label: SYMBOL_LABELS[symbol],
  base: BASE_ASSET[symbol],
}));

export function filterSymbolSearchEntries(entries, query) {
  const raw = String(query || "").trim();
  if (!raw) return entries;

  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const slashForm = raw.toUpperCase().includes("/") ? raw.toUpperCase() : null;

  return entries.filter((entry) => {
    const candidates = [
      entry.value,
      entry.label,
      entry.base,
      entry.displayName,
      entry.displaySymbol,
      entry.label.replace("/", ""),
      `${entry.base}USDT`,
    ].filter(Boolean);

    return candidates.some((candidate) => {
      const normalized = String(candidate).toUpperCase();
      if (slashForm && normalized.includes(slashForm.replace("/", ""))) return true;
      return normalized.includes(compact) || compact.includes(normalized.replace("/", ""));
    });
  });
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

export const PRECISION_OPTIONS = [0.0001, 0.001, 0.01, 0.1, 1, 10];

export function registryEntryToSearchEntry(entry) {
  return {
    value: entry.symbol,
    label: entry.displaySymbol,
    base: entry.base,
    displayName: entry.displayName,
    displaySymbol: entry.displaySymbol,
    supportedExchangeCount: entry.supportedExchangeCount,
    supportedExchanges: entry.supportedExchanges,
  };
}
