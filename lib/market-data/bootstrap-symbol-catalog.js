import { DISPLAY_NAME_MAP, CORE_SYMBOLS } from "./dynamic-symbol-constants.js";

/** @typedef {"binance"|"bybit"|"okx"} ExchangeId */

/**
 * @typedef {Object} BootstrapCatalogItem
 * @property {string} symbol
 * @property {string} base
 * @property {string} quote
 * @property {string} displaySymbol
 * @property {string} displayName
 * @property {ExchangeId[]} candidateExchanges
 * @property {Record<ExchangeId, string>} exchangeMarketSymbols
 * @property {"bootstrap"} source
 */

/** Known USDT spot mappings — candidate only until runtime probe confirms. */
const BOOTSTRAP_EXCHANGE_MARKET_SYMBOLS = {
  DOGEUSDT: { binance: "DOGEUSDT", bybit: "DOGEUSDT", okx: "DOGE-USDT" },
  LTCUSDT: { binance: "LTCUSDT", bybit: "LTCUSDT", okx: "LTC-USDT" },
  BNBUSDT: { binance: "BNBUSDT", bybit: "BNBUSDT", okx: "BNB-USDT" },
  ADAUSDT: { binance: "ADAUSDT", bybit: "ADAUSDT", okx: "ADA-USDT" },
  LINKUSDT: { binance: "LINKUSDT", bybit: "LINKUSDT", okx: "LINK-USDT" },
};

const BOOTSTRAP_BASES = ["DOGE", "LTC", "BNB", "ADA", "LINK"];

/** @type {BootstrapCatalogItem[]} */
export const BOOTSTRAP_CATALOG = BOOTSTRAP_BASES.map((base) => {
  const symbol = `${base}USDT`;
  const candidateExchanges = /** @type {ExchangeId[]} */ (["binance", "bybit", "okx"]);
  return {
    symbol,
    base,
    quote: "USDT",
    displaySymbol: `${base}/USDT`,
    displayName: DISPLAY_NAME_MAP[base] || base,
    candidateExchanges,
    exchangeMarketSymbols: BOOTSTRAP_EXCHANGE_MARKET_SYMBOLS[symbol],
    source: "bootstrap",
  };
});

const bootstrapBySymbol = new Map(BOOTSTRAP_CATALOG.map((item) => [item.symbol, item]));

export function getBootstrapCatalog() {
  return BOOTSTRAP_CATALOG;
}

export function getBootstrapCatalogCount() {
  return BOOTSTRAP_CATALOG.length;
}

export function isBootstrapCatalogSymbol(symbol) {
  const normalized = String(symbol || "").toUpperCase();
  return bootstrapBySymbol.has(normalized);
}

export function getBootstrapCatalogItem(symbol) {
  const normalized = String(symbol || "").toUpperCase();
  return bootstrapBySymbol.get(normalized) || null;
}

export function getBootstrapCandidateExchanges(symbol) {
  return getBootstrapCatalogItem(symbol)?.candidateExchanges || [];
}

export function getBootstrapExchangeMarketSymbol(symbol, exchange) {
  const item = getBootstrapCatalogItem(symbol);
  if (!item) return null;
  return item.exchangeMarketSymbols?.[exchange] || item.symbol;
}

export function isCoreCatalogSymbol(symbol) {
  return CORE_SYMBOLS.includes(String(symbol || "").toUpperCase());
}
