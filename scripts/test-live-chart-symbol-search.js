import assert from "node:assert/strict";
import {
  interpretLiveChartSearchResponse,
  isLiveChartSymbolSupported,
  LIVE_CHART_SEARCH_ERRORS,
  normalizeLiveChartSymbol,
  pickLiveChartSymbolMatch,
  resolveLatestLiveChartSearch,
  searchLiveChartSymbol,
} from "../lib/live-chart-symbol.js";

const zecEntry = {
  symbol: "ZECUSDT",
  base: "ZEC",
  quote: "USDT",
  displaySymbol: "ZEC/USDT",
  supportedExchanges: ["binance", "bybit"],
  candidateExchanges: ["binance", "bybit"],
};

const btcEntry = {
  symbol: "BTCUSDT",
  base: "BTC",
  quote: "USDT",
  displaySymbol: "BTC/USDT",
  supportedExchanges: ["binance", "bybit", "okx"],
  candidateExchanges: ["binance", "bybit", "okx"],
};

const bybitOnlyEntry = {
  symbol: "BYBITONLYUSDT",
  base: "BYBITONLY",
  quote: "USDT",
  displaySymbol: "BYBITONLY/USDT",
  supportedExchanges: ["bybit"],
  candidateExchanges: ["bybit"],
};

function availablePayload(symbols) {
  return {
    success: true,
    available: true,
    symbols,
  };
}

// A. ZECUSDT resolves successfully
assert.equal(normalizeLiveChartSymbol("ZECUSDT"), "ZECUSDT");
assert.equal(
  pickLiveChartSymbolMatch("ZECUSDT", [zecEntry, btcEntry]),
  "ZECUSDT",
);

// B. zecusdt resolves successfully
assert.equal(normalizeLiveChartSymbol("zecusdt"), "ZECUSDT");

// C. ZEC/USDT -> same canonical symbol
assert.equal(normalizeLiveChartSymbol("ZEC/USDT"), "ZECUSDT");

// D. ZEC-USDT -> same canonical symbol
assert.equal(normalizeLiveChartSymbol("ZEC-USDT"), "ZECUSDT");

// E. BTCUSDT -> no regression
assert.equal(normalizeLiveChartSymbol("BTCUSDT"), "BTCUSDT");
assert.equal(
  pickLiveChartSymbolMatch("BTCUSDT", [btcEntry, zecEntry]),
  "BTCUSDT",
);

// F. truly missing symbol -> clear not-found error
const missing = interpretLiveChartSearchResponse(availablePayload([btcEntry]), "ZECUSDT");
assert.equal(missing.ok, false);
assert.equal(missing.type, "not_found");
assert.equal(missing.error, LIVE_CHART_SEARCH_ERRORS.NOT_FOUND);

// G. API/network failure -> network error, not not-found
const unavailable = interpretLiveChartSearchResponse(
  { success: true, available: false, symbols: [] },
  "ZECUSDT",
);
assert.equal(unavailable.ok, false);
assert.equal(unavailable.type, "network");
assert.equal(unavailable.error, LIVE_CHART_SEARCH_ERRORS.NETWORK);

const httpFailure = interpretLiveChartSearchResponse(null, "ZECUSDT");
assert.equal(httpFailure.type, "network");

// H. successful symbol change returns the new symbol
const success = interpretLiveChartSearchResponse(availablePayload([zecEntry]), "ZECUSDT");
assert.equal(success.ok, true);
assert.equal(success.symbol, "ZECUSDT");

// I. failed request does not return a symbol payload
assert.equal("symbol" in missing, false);
assert.equal("symbol" in unavailable, false);

// Binance support is required because TradingView uses BINANCE:{symbol}
assert.equal(isLiveChartSymbolSupported(zecEntry), true);
assert.equal(isLiveChartSymbolSupported(bybitOnlyEntry), false);
assert.equal(
  pickLiveChartSymbolMatch("BYBITONLYUSDT", [bybitOnlyEntry]),
  null,
);

// J. rapid consecutive requests -> last request wins
const firstResultPromise = new Promise((resolve) => {
  setTimeout(() => resolve({ ok: true, symbol: "BTCUSDT" }), 30);
});
const secondResultPromise = Promise.resolve({ ok: true, symbol: "ZECUSDT" });

const latest = await resolveLatestLiveChartSearch([firstResultPromise, secondResultPromise]);
assert.equal(latest.ok, true);
assert.equal(latest.symbol, "ZECUSDT");

const mockedSearch = await searchLiveChartSymbol("ZECUSDT", {
  fetchFn: async () => ({
    ok: true,
    async json() {
      return availablePayload([zecEntry]);
    },
  }),
});
assert.equal(mockedSearch.ok, true);
assert.equal(mockedSearch.symbol, "ZECUSDT");

const mockedNetworkFailure = await searchLiveChartSymbol("ZECUSDT", {
  fetchFn: async () => {
    throw new TypeError("Failed to fetch");
  },
});
assert.equal(mockedNetworkFailure.ok, false);
assert.equal(mockedNetworkFailure.type, "network");

const abortController = new AbortController();
abortController.abort();
const abortedBeforeFetch = await searchLiveChartSymbol("ZECUSDT", {
  signal: abortController.signal,
  fetchFn: async () => {
    throw new Error("fetch should not run");
  },
});
assert.equal(abortedBeforeFetch.aborted, true);
assert.equal("error" in abortedBeforeFetch, false);

const slowController = new AbortController();
const slowSearchPromise = searchLiveChartSymbol("ZECUSDT", {
  signal: slowController.signal,
  fetchFn: (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => {
          const err = new Error("Aborted");
          err.name = "AbortError";
          reject(err);
        },
        { once: true },
      );
    }),
});
setTimeout(() => slowController.abort(), 10);
const slowResult = await slowSearchPromise;
assert.equal(slowResult.aborted, true);
assert.equal("error" in slowResult, false);

console.log("live chart symbol search tests passed: 21/21");
