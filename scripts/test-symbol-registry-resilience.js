import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  REGISTRY_CACHE_TTL_MS,
  REGISTRY_FAILED_RETRY_MS,
} from "../lib/market-data/dynamic-symbol-constants.js";
import {
  fetchRegistryFromExchanges,
  fetchRegistryWithRetries,
  getRegistryStateForTests,
  getSymbolRegistryHealth,
  getSymbolRegistrySnapshot,
  mergeExchangeSymbolMaps,
  refreshSymbolRegistry,
  resetSymbolRegistryForTests,
  searchRegistrySymbols,
  __advanceSymbolRegistryClockForTests,
  __resetSymbolRegistryClockForTests,
  __setSymbolRegistryClockForTests,
} from "../lib/market-data/symbol-registry.js";

function dogeBinanceMap() {
  return new Map([
    ["DOGEUSDT", { binance: { supported: true, marketSymbol: "DOGEUSDT" } }],
    ["LTCUSDT", { binance: { supported: true, marketSymbol: "LTCUSDT" } }],
    ["BTCUSDT", { binance: { supported: true, marketSymbol: "BTCUSDT" } }],
  ]);
}

function dogeBybitMap() {
  return new Map([
    ["DOGEUSDT", { bybit: { supported: true, marketSymbol: "DOGEUSDT" } }],
    ["LTCUSDT", { bybit: { supported: true, marketSymbol: "LTCUSDT" } }],
    ["BTCUSDT", { bybit: { supported: true, marketSymbol: "BTCUSDT" } }],
  ]);
}

function makeFetchImpl(sequence) {
  let call = 0;
  return async (_url, label) => {
    const round = sequence[Math.min(call, sequence.length - 1)];
    call += 1;
    if (round === "fail") throw new Error(`${label}_unavailable`);
    if (label === "BINANCE") {
      if (round.binance === "fail") throw new Error("BINANCE_unavailable");
      return round.binance;
    }
    if (label === "BYBIT") {
      if (round.bybit === "fail") throw new Error("BYBIT_unavailable");
      return round.bybit;
    }
    if (label === "OKX") {
      if (round.okx === "fail") throw new Error("OKX_unavailable");
      return round.okx;
    }
    throw new Error(`${label}_unknown`);
  };
}

let now = 1_000_000;
const sleepCalls = [];
const sleepImpl = async (ms) => {
  sleepCalls.push(ms);
  now += ms;
  __setSymbolRegistryClockForTests(now);
};

resetSymbolRegistryForTests();
__setSymbolRegistryClockForTests(now);

// 1. first fetch fails -> core fallback
await refreshSymbolRegistry({
  force: true,
  fetchImpl: makeFetchImpl(["fail"]),
  sleepImpl,
});
let state = getRegistryStateForTests();
assert.equal(state.available, true);
assert.equal(state.cacheMode, "failed");
assert.equal(state.registryMode, "bootstrap");
assert.ok(state.count >= 4);
assert.ok(state.nextRetryAt > now);

// 2. unavailable cache does not live 30 minutes
const beforeRetry = now;
await refreshSymbolRegistry({ fetchImpl: makeFetchImpl(["fail"]), sleepImpl });
assert.ok(getRegistryStateForTests().count >= 4);
now = beforeRetry + REGISTRY_FAILED_RETRY_MS - 1;
__setSymbolRegistryClockForTests(now);
resetSymbolRegistryForTests();
__setSymbolRegistryClockForTests(now);
await refreshSymbolRegistry({
  force: true,
  fetchImpl: makeFetchImpl(["fail"]),
  sleepImpl,
});
const retryAt = getRegistryStateForTests().nextRetryAt;
now = retryAt - 1;
await refreshSymbolRegistry({ fetchImpl: makeFetchImpl(["fail"]), sleepImpl });
assert.ok(getRegistryStateForTests().count >= 4, "no fetch before nextRetryAt");

// 3-5. after nextRetryAt second attempt succeeds with 2 sources
now = retryAt + 1;
__setSymbolRegistryClockForTests(now);
const fetchImplRecovery = makeFetchImpl([
  {
    binance: { symbols: [{ symbol: "DOGEUSDT", status: "TRADING", quoteAsset: "USDT", isSpotTradingAllowed: true }] },
    bybit: { result: { list: [{ symbol: "DOGEUSDT", status: "Trading", quoteCoin: "USDT" }] } },
    okx: "fail",
  },
]);
await refreshSymbolRegistry({ fetchImpl: fetchImplRecovery, sleepImpl });
state = getRegistryStateForTests();
assert.equal(state.available, true);
assert.equal(state.sourceCount, 2);
const doge = searchRegistrySymbols("DOGE", { limit: 5 });
assert.equal(doge.length, 1);
assert.equal(doge[0].symbol, "DOGEUSDT");

// 6. single-flight prevents duplicate refresh work
resetSymbolRegistryForTests();
let fetchCalls = 0;
const batchFetch = async () => {
  fetchCalls += 1;
  throw new Error("source_down");
};
const parallelA = refreshSymbolRegistry({ force: true, fetchImpl: batchFetch, sleepImpl });
const parallelB = refreshSymbolRegistry({ fetchImpl: batchFetch, sleepImpl });
await Promise.all([parallelA, parallelB]);
assert.equal(fetchCalls, 9, "one shared refresh (3 attempts x 3 exchanges)");

// 13-14. deterministic failure -> recovery mock
resetSymbolRegistryForTests();
now = 5_000_000;
__setSymbolRegistryClockForTests(now);
sleepCalls.length = 0;

await refreshSymbolRegistry({
  force: true,
  fetchImpl: async () => {
    throw new Error("all_down");
  },
  sleepImpl,
});
assert.equal(getRegistryStateForTests().available, true);
assert.equal(getRegistryStateForTests().registryMode, "bootstrap");

const blockedUntil = getRegistryStateForTests().nextRetryAt;
now = blockedUntil - 1;
__setSymbolRegistryClockForTests(now);
await refreshSymbolRegistry({
  fetchImpl: async () => {
    throw new Error("still_blocked");
  },
  sleepImpl,
});
assert.equal(getRegistryStateForTests().available, true);

now = blockedUntil + 1;
__setSymbolRegistryClockForTests(now);
await refreshSymbolRegistry({
  force: true,
  fetchImpl: async (_url, label) => {
    if (label === "BINANCE") {
      return {
        symbols: [
          { symbol: "DOGEUSDT", status: "TRADING", quoteAsset: "USDT", isSpotTradingAllowed: true },
          { symbol: "LTCUSDT", status: "TRADING", quoteAsset: "USDT", isSpotTradingAllowed: true },
        ],
      };
    }
    if (label === "BYBIT") {
      return {
        result: {
          list: [
            { symbol: "DOGEUSDT", status: "Trading", quoteCoin: "USDT" },
            { symbol: "LTCUSDT", status: "Trading", quoteCoin: "USDT" },
          ],
        },
      };
    }
    throw new Error("OKX_unavailable");
  },
  sleepImpl,
});
const afterRecovery = getRegistryStateForTests();
assert.equal(afterRecovery.available, true);
assert.equal(afterRecovery.registryMode, "live");
assert.equal(afterRecovery.sourceCount, 2);
assert.equal(searchRegistrySymbols("DOGE").length, 1);
assert.equal(searchRegistrySymbols("LTC").length, 1);

// 7-8. partial source rules via fetchRegistryFromExchanges
const twoSource = await fetchRegistryFromExchanges({
  fetchImpl: async (_url, label) => {
    if (label === "BINANCE") return { symbols: [] };
    if (label === "BYBIT") return { result: { list: [{ symbol: "DOGEUSDT", status: "Trading", quoteCoin: "USDT" }] } };
    throw new Error("OKX_unavailable");
  },
});
assert.equal(twoSource.available, false);
assert.equal(twoSource.sourceCount, 1);

const twoOk = await fetchRegistryFromExchanges({
  fetchImpl: async (_url, label) => {
    if (label === "BINANCE") {
      return {
        symbols: [{ symbol: "DOGEUSDT", status: "TRADING", quoteAsset: "USDT", isSpotTradingAllowed: true }],
      };
    }
    if (label === "BYBIT") {
      return { result: { list: [{ symbol: "DOGEUSDT", status: "Trading", quoteCoin: "USDT" }] } };
    }
    throw new Error("OKX_unavailable");
  },
});
assert.equal(twoOk.available, true);
assert.equal(twoOk.sourceCount, 2);

// 9. successful cache stays 30 minutes
resetSymbolRegistryForTests();
await refreshSymbolRegistry({
  force: true,
  fetchImpl: makeFetchImpl([
    {
      binance: { symbols: [{ symbol: "BTCUSDT", status: "TRADING", quoteAsset: "USDT", isSpotTradingAllowed: true }] },
      bybit: { result: { list: [{ symbol: "BTCUSDT", status: "Trading", quoteCoin: "USDT" }] } },
      okx: { data: [{ instType: "SPOT", instId: "BTC-USDT", state: "live", quoteCcy: "USDT" }] },
    },
  ]),
  sleepImpl,
});
const successAt = getRegistryStateForTests();
assert.equal(successAt.available, true);
now += REGISTRY_CACHE_TTL_MS - 1;
__setSymbolRegistryClockForTests(now);
let fetchCalled = false;
await refreshSymbolRegistry({
  fetchImpl: async () => {
    fetchCalled = true;
    throw new Error("should_not_fetch");
  },
  sleepImpl,
});
assert.equal(fetchCalled, false);

// 10. stale successful registry kept on refresh failure
now += 2;
__setSymbolRegistryClockForTests(now);
await refreshSymbolRegistry({
  force: true,
  fetchImpl: makeFetchImpl(["fail"]),
  sleepImpl,
});
assert.equal(getRegistryStateForTests().available, true);
assert.equal(getSymbolRegistrySnapshot().stale, true);

// 11. API cache-control strings
const route = readFileSync(join(process.cwd(), "app/api/market-symbols/route.js"), "utf8");
assert.match(route, /CACHE_CONTROL_UNAVAILABLE/);
assert.match(route, /REGISTRY_UNAVAILABLE_CACHE_MAX_AGE_SEC/);
assert.match(route, /snapshot\.available \? CACHE_CONTROL_SUCCESS : CACHE_CONTROL_UNAVAILABLE/);

// 12. UI retry without storm
const ui = readFileSync(join(process.cwd(), "app/components/order-book/order-book-ui.js"), "utf8");
assert.match(ui, /CLIENT_REGISTRY_RETRY_MS/);
assert.match(ui, /cache: "no-store"/);
assert.match(ui, /retryTimerRef/);

// 15. health metrics safe
const health = getSymbolRegistryHealth();
assert.equal(typeof health.registryAvailable, "boolean");
assert.equal(typeof health.registryRefreshInFlight, "boolean");
assert.equal(JSON.stringify(health).includes("api.binance.com"), false);
assert.equal(JSON.stringify(health).includes("stack"), false);

// retry backoff in fetchRegistryWithRetries
resetSymbolRegistryForTests();
sleepCalls.length = 0;
await fetchRegistryWithRetries({
  fetchImpl: async () => {
    throw new Error("down");
  },
  sleepImpl,
  maxAttempts: 3,
  backoffs: [1000, 3000, 8000],
});
assert.deepEqual(sleepCalls, [1000, 3000]);

// 16. source must not freeze module clock at load time
const registrySource = readFileSync(join(process.cwd(), "lib/market-data/symbol-registry.js"), "utf8");
assert.doesNotMatch(registrySource, /let clockNow = Date\.now\(\)/);
assert.match(registrySource, /clockOverride \?\? Date\.now\(\)/);
assert.doesNotMatch(registrySource, /function nowMs\(\)\s*\{\s*return clockNow;/);

// 17. lastAttemptAt advances after nextRetryAt and recovery exposes DOGE/LTC
resetSymbolRegistryForTests();
now = 20_000_000;
__setSymbolRegistryClockForTests(now);
sleepCalls.length = 0;

await refreshSymbolRegistry({
  force: true,
  fetchImpl: async () => {
    throw new Error("all_down");
  },
  sleepImpl,
});

const firstHealth = getSymbolRegistryHealth();
const firstAttemptAt = firstHealth.registryLastAttemptAt;
const firstNextRetryAt = firstHealth.registryNextRetryAt;
const firstFailureCount = getRegistryStateForTests().failureCount;
assert.equal(getRegistryStateForTests().available, true);
assert.equal(getRegistryStateForTests().registryMode, "bootstrap");

now = new Date(firstNextRetryAt).getTime() - 1;
__setSymbolRegistryClockForTests(now);
let recoveryFetchCalls = 0;
await refreshSymbolRegistry({
  fetchImpl: async () => {
    recoveryFetchCalls += 1;
    throw new Error("still_blocked");
  },
  sleepImpl,
});
assert.equal(recoveryFetchCalls, 0, "no refresh before nextRetryAt");
assert.equal(getSymbolRegistryHealth().registryLastAttemptAt, firstAttemptAt);
assert.equal(getRegistryStateForTests().failureCount, firstFailureCount);

now = new Date(firstNextRetryAt).getTime() + 1;
__setSymbolRegistryClockForTests(now);
await refreshSymbolRegistry({
  fetchImpl: async (_url, label) => {
    recoveryFetchCalls += 1;
    if (label === "BINANCE") {
      return {
        symbols: [
          { symbol: "DOGEUSDT", status: "TRADING", quoteAsset: "USDT", isSpotTradingAllowed: true },
          { symbol: "LTCUSDT", status: "TRADING", quoteAsset: "USDT", isSpotTradingAllowed: true },
        ],
      };
    }
    if (label === "BYBIT") {
      return {
        result: {
          list: [
            { symbol: "DOGEUSDT", status: "Trading", quoteCoin: "USDT" },
            { symbol: "LTCUSDT", status: "Trading", quoteCoin: "USDT" },
          ],
        },
      };
    }
    throw new Error("OKX_unavailable");
  },
  sleepImpl,
});

const secondHealth = getSymbolRegistryHealth();
assert.notEqual(secondHealth.registryLastAttemptAt, firstAttemptAt, "lastAttemptAt must advance");
assert.notEqual(secondHealth.registryNextRetryAt, firstNextRetryAt, "nextRetryAt must move");
assert.equal(getRegistryStateForTests().available, true);
assert.equal(searchRegistrySymbols("DOGE").length, 1);
assert.equal(searchRegistrySymbols("LTC").length, 1);

// 18. reset clock restores live Date.now() behavior
__resetSymbolRegistryClockForTests();
resetSymbolRegistryForTests();
const liveStart = Date.now();
await refreshSymbolRegistry({
  force: true,
  fetchImpl: async () => {
    throw new Error("live_clock_fail");
  },
  sleepImpl: async () => {},
});
const liveNextRetry = getRegistryStateForTests().nextRetryAt;
assert.ok(liveNextRetry >= liveStart + REGISTRY_FAILED_RETRY_MS - 250);
assert.ok(liveNextRetry <= liveStart + REGISTRY_FAILED_RETRY_MS + 5000);

console.log("symbol-registry resilience tests passed: 18/18");
