import { fetchWithTimeout } from "../fetch-with-timeout.js";
import {
  DISPLAY_NAME_MAP,
  EXCHANGE_FETCH_TIMEOUT_MS,
  MIN_SUPPORTED_EXCHANGES,
  PRIORITY_BASES,
  REGISTRY_CACHE_TTL_MS,
  REGISTRY_STALE_MAX_MS,
} from "./dynamic-symbol-constants.js";
import {
  formatMarketSymbol,
  isValidMarketSymbolFormat,
  normalizeMarketSymbol,
} from "./symbols.js";

const LEVERAGED_SUFFIXES = /(UP|DOWN|BULL|BEAR|[235]L|[235]S)$/i;
const EXCLUDED_BASES = new Set(["USDT", "USDC", "BUSD", "DAI", "TUSD", "USDP", "FDUSD"]);

/** @typedef {"binance"|"bybit"|"okx"} ExchangeId */

/**
 * @typedef {Object} RegistryExchangeMeta
 * @property {boolean} supported
 * @property {string} marketSymbol
 */

/**
 * @typedef {Object} SymbolRegistryEntry
 * @property {string} symbol
 * @property {string} base
 * @property {string} quote
 * @property {string} displaySymbol
 * @property {string} displayName
 * @property {Record<ExchangeId, RegistryExchangeMeta>} exchanges
 * @property {number} supportedExchangeCount
 * @property {ExchangeId[]} supportedExchanges
 */

const registryState = {
  entries: /** @type {Map<string, SymbolRegistryEntry>} */ (new Map()),
  fetchedAt: 0,
  stale: false,
  available: false,
  lastErrorSafe: null,
  inFlight: null,
};

function isExcludedBase(base) {
  if (!base || EXCLUDED_BASES.has(base)) return true;
  if (LEVERAGED_SUFFIXES.test(base)) return true;
  if (base.includes("TEST")) return true;
  return false;
}

function buildEntry(symbol, exchangeMap) {
  const base = symbol.replace(/USDT$/, "");
  if (isExcludedBase(base)) return null;

  const supportedExchanges = /** @type {ExchangeId[]} */ (
    Object.entries(exchangeMap)
      .filter(([, meta]) => meta?.supported)
      .map(([exchange]) => exchange)
  );

  if (supportedExchanges.length < MIN_SUPPORTED_EXCHANGES) return null;

  return {
    symbol,
    base,
    quote: "USDT",
    displaySymbol: formatMarketSymbol(symbol),
    displayName: DISPLAY_NAME_MAP[base] || base,
    exchanges: exchangeMap,
    supportedExchangeCount: supportedExchanges.length,
    supportedExchanges,
  };
}

function sortEntries(entries) {
  return entries.sort((a, b) => {
    const aIdx = PRIORITY_BASES.indexOf(a.base);
    const bIdx = PRIORITY_BASES.indexOf(b.base);
    const aPri = aIdx === -1 ? 999 : aIdx;
    const bPri = bIdx === -1 ? 999 : bIdx;
    if (aPri !== bPri) return aPri - bPri;
    if (b.supportedExchangeCount !== a.supportedExchangeCount) {
      return b.supportedExchangeCount - a.supportedExchangeCount;
    }
    return a.base.localeCompare(b.base);
  });
}

export function parseBinanceSymbols(payload) {
  const rows = payload?.symbols || [];
  const out = new Map();

  for (const row of rows) {
    if (row?.status !== "TRADING") continue;
    if (row?.quoteAsset !== "USDT") continue;
    if (row?.isSpotTradingAllowed === false) continue;

    const symbol = normalizeMarketSymbol(row.symbol);
    if (!symbol || !isValidMarketSymbolFormat(symbol)) continue;
    if (isExcludedBase(symbol.replace(/USDT$/, ""))) continue;

    out.set(symbol, {
      binance: { supported: true, marketSymbol: row.symbol },
    });
  }

  return out;
}

export function parseBybitSymbols(payload) {
  const rows = payload?.result?.list || [];
  const out = new Map();

  for (const row of rows) {
    if (row?.status !== "Trading") continue;
    if (row?.quoteCoin !== "USDT") continue;

    const symbol = normalizeMarketSymbol(row.symbol);
    if (!symbol || !isValidMarketSymbolFormat(symbol)) continue;

    out.set(symbol, {
      bybit: { supported: true, marketSymbol: row.symbol },
    });
  }

  return out;
}

export function parseOkxSymbols(payload) {
  const rows = payload?.data || [];
  const out = new Map();

  for (const row of rows) {
    if (row?.state !== "live") continue;
    if (row?.quoteCcy !== "USDT") continue;
    if (row?.instType !== "SPOT") continue;

    const symbol = normalizeMarketSymbol(row.instId?.replace(/-/g, "") || row.baseCcy + row.quoteCcy);
    if (!symbol || !isValidMarketSymbolFormat(symbol)) continue;

    out.set(symbol, {
      okx: { supported: true, marketSymbol: row.instId },
    });
  }

  return out;
}

export function mergeExchangeSymbolMaps(maps) {
  const merged = new Map();

  for (const map of maps) {
    for (const [symbol, partial] of map.entries()) {
      const current = merged.get(symbol) || {
        binance: { supported: false, marketSymbol: null },
        bybit: { supported: false, marketSymbol: null },
        okx: { supported: false, marketSymbol: null },
      };

      merged.set(symbol, {
        binance: partial.binance || current.binance,
        bybit: partial.bybit || current.bybit,
        okx: partial.okx || current.okx,
      });
    }
  }

  const entries = [];
  for (const [symbol, exchangeMap] of merged.entries()) {
    const entry = buildEntry(symbol, exchangeMap);
    if (entry) entries.push(entry);
  }

  return sortEntries(entries);
}

async function fetchExchangeJson(url, label) {
  const response = await fetchWithTimeout(
    url,
    { headers: { Accept: "application/json" } },
    EXCHANGE_FETCH_TIMEOUT_MS,
  );

  if (!response.ok) {
    throw new Error(`${label}_HTTP_${response.status}`);
  }

  return response.json();
}

export async function fetchRegistryFromExchanges({ fetchImpl = fetchExchangeJson } = {}) {
  const results = await Promise.allSettled([
    fetchImpl("https://api.binance.com/api/v3/exchangeInfo", "BINANCE"),
    fetchImpl("https://api.bybit.com/v5/market/instruments-info?category=spot&limit=1000", "BYBIT"),
    fetchImpl("https://www.okx.com/api/v5/public/instruments?instType=SPOT", "OKX"),
  ]);

  const maps = [];
  const errors = [];

  if (results[0].status === "fulfilled") {
    maps.push(parseBinanceSymbols(results[0].value));
  } else {
    errors.push("binance_unavailable");
  }

  if (results[1].status === "fulfilled") {
    maps.push(parseBybitSymbols(results[1].value));
  } else {
    errors.push("bybit_unavailable");
  }

  if (results[2].status === "fulfilled") {
    maps.push(parseOkxSymbols(results[2].value));
  } else {
    errors.push("okx_unavailable");
  }

  if (!maps.length) {
    return {
      entries: [],
      available: false,
      lastErrorSafe: errors.join(","),
    };
  }

  return {
    entries: mergeExchangeSymbolMaps(maps),
    available: true,
    lastErrorSafe: errors.length ? errors.join(",") : null,
  };
}

function applyRegistryResult(result, { stale = false } = {}) {
  registryState.entries = new Map(result.entries.map((entry) => [entry.symbol, entry]));
  registryState.fetchedAt = Date.now();
  registryState.stale = stale;
  registryState.available = result.available;
  registryState.lastErrorSafe = result.lastErrorSafe;
}

function buildCoreFallbackEntries() {
  const cores = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT"];
  return cores.map((symbol) => {
    const base = symbol.replace(/USDT$/, "");
    const exchanges = {
      binance: { supported: true, marketSymbol: symbol },
      bybit: { supported: true, marketSymbol: symbol },
      okx: { supported: true, marketSymbol: `${base}-USDT` },
    };
    return buildEntry(symbol, exchanges);
  }).filter(Boolean);
}

export async function refreshSymbolRegistry({ force = false } = {}) {
  const now = Date.now();
  const age = now - registryState.fetchedAt;

  if (!force && registryState.entries.size && age < REGISTRY_CACHE_TTL_MS) {
    return getSymbolRegistrySnapshot();
  }

  if (registryState.inFlight) {
    return registryState.inFlight;
  }

  registryState.inFlight = (async () => {
    try {
      const result = await fetchRegistryFromExchanges();
      if (result.entries.length) {
        applyRegistryResult(result, { stale: false });
      } else if (!registryState.entries.size) {
        applyRegistryResult({ entries: buildCoreFallbackEntries(), available: false, lastErrorSafe: result.lastErrorSafe }, { stale: true });
      } else {
        registryState.stale = age > REGISTRY_CACHE_TTL_MS;
        registryState.lastErrorSafe = result.lastErrorSafe;
      }
    } catch (error) {
      registryState.lastErrorSafe = error?.message || "registry_refresh_failed";
      if (!registryState.entries.size) {
        applyRegistryResult({ entries: buildCoreFallbackEntries(), available: false, lastErrorSafe: registryState.lastErrorSafe }, { stale: true });
      } else if (age > REGISTRY_STALE_MAX_MS) {
        applyRegistryResult({ entries: buildCoreFallbackEntries(), available: false, lastErrorSafe: registryState.lastErrorSafe }, { stale: true });
      } else {
        registryState.stale = true;
      }
    } finally {
      registryState.inFlight = null;
    }

    return getSymbolRegistrySnapshot();
  })();

  return registryState.inFlight;
}

export function getSymbolRegistrySnapshot() {
  return {
    fetchedAt: registryState.fetchedAt ? new Date(registryState.fetchedAt).toISOString() : null,
    stale: registryState.stale,
    available: registryState.available,
    lastErrorSafe: registryState.lastErrorSafe,
    count: registryState.entries.size,
    entries: Array.from(registryState.entries.values()),
  };
}

export function getRegistryEntry(symbol) {
  const normalized = normalizeMarketSymbol(symbol);
  if (!normalized) return null;
  return registryState.entries.get(normalized) || null;
}

export function isRegistrySymbolSupported(symbol, { minExchanges = MIN_SUPPORTED_EXCHANGES } = {}) {
  const entry = getRegistryEntry(symbol);
  if (!entry) return false;
  return entry.supportedExchangeCount >= minExchanges;
}

export function searchRegistrySymbols(query, { limit = 50, minExchanges = MIN_SUPPORTED_EXCHANGES } = {}) {
  const raw = String(query || "").trim();
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");

  let pool = Array.from(registryState.entries.values()).filter(
    (entry) => entry.supportedExchangeCount >= minExchanges,
  );

  if (raw) {
    pool = pool.filter((entry) => {
      const candidates = [
        entry.symbol,
        entry.base,
        entry.displaySymbol,
        entry.displayName,
        entry.displaySymbol.replace("/", ""),
      ];
      return candidates.some((candidate) => {
        const normalized = String(candidate).toUpperCase();
        return normalized.includes(compact) || compact.includes(normalized.replace("/", ""));
      });
    });
  }

  return pool.slice(0, limit);
}

export function getExchangeMarketSymbolFromRegistry(symbol, exchange) {
  const entry = getRegistryEntry(symbol);
  if (!entry) return null;
  const meta = entry.exchanges?.[exchange];
  if (!meta?.supported) return null;
  return meta.marketSymbol;
}

export function getSupportedExchangesForSymbol(symbol) {
  const entry = getRegistryEntry(symbol);
  return entry?.supportedExchanges || [];
}

export function resetSymbolRegistryForTests() {
  registryState.entries = new Map();
  registryState.fetchedAt = 0;
  registryState.stale = false;
  registryState.available = false;
  registryState.lastErrorSafe = null;
  registryState.inFlight = null;
}

export function seedSymbolRegistryForTests(entries) {
  applyRegistryResult({ entries, available: true, lastErrorSafe: null }, { stale: false });
}

export function classifyRegistrySupport(entry) {
  if (!entry) return "unsupported";
  if (entry.supportedExchangeCount >= 3) return "supported3Of3";
  if (entry.supportedExchangeCount === 2) return "supported2Of3";
  if (entry.supportedExchangeCount === 1) return "supported1Of3";
  return "unsupported";
}
