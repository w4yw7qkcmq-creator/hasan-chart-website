import assert from "node:assert/strict";
import { DynamicSymbolManager } from "../lib/market-data/dynamic-symbol-manager.js";
import { getBootstrapCatalogCount } from "../lib/market-data/bootstrap-symbol-catalog.js";
import {
  classifyProbeConnectionSnapshot,
  finalizeSymbolProbe,
  getProbeMetrics,
  getSymbolProbeState,
  resetProbeStateForTests,
  startSymbolProbe,
  summarizeProbeResults,
} from "../lib/market-data/exchange-symbol-probe.js";
import {
  getRegistryStateForTests,
  getSymbolRegistryHealth,
  isKnownRegistrySymbol,
  refreshSymbolRegistry,
  resetSymbolRegistryForTests,
  searchRegistrySymbols,
} from "../lib/market-data/symbol-registry.js";
import { isSupportedMarketSymbol } from "../lib/market-data/symbols.js";

function makeFailFetch() {
  return async () => {
    throw new Error("all_down");
  };
}

resetSymbolRegistryForTests();
resetProbeStateForTests();

// 1. REST registry fails -> DOGE/LTC appear from bootstrap
await refreshSymbolRegistry({ force: true, fetchImpl: makeFailFetch(), sleepImpl: async () => {} });
const failedState = getRegistryStateForTests();
assert.equal(failedState.registryMode, "bootstrap");
assert.equal(failedState.available, true);
assert.equal(failedState.sourceCount, 0);
const dogeSearch = searchRegistrySymbols("DOGE", { limit: 5 });
const ltcSearch = searchRegistrySymbols("LTC", { limit: 5 });
assert.equal(dogeSearch.length, 1);
assert.equal(ltcSearch.length, 1);
assert.equal(dogeSearch[0].symbol, "DOGEUSDT");
assert.equal(ltcSearch[0].symbol, "LTCUSDT");
assert.equal(dogeSearch[0].source, "bootstrap");
assert.equal(dogeSearch[0].metadataVerified, false);

// 2. registryMode = bootstrap
assert.equal(getSymbolRegistryHealth().registryMode, "bootstrap");

// 3. RANDOMUSDT rejected
assert.equal(isKnownRegistrySymbol("RANDOMUSDT"), false);
assert.equal(isSupportedMarketSymbol("RANDOMUSDT"), false);

// 4. DOGE passes validation
assert.equal(isKnownRegistrySymbol("DOGEUSDT"), true);
assert.equal(isSupportedMarketSymbol("DOGEUSDT"), true);

// 5. probe: 2 succeed, 1 rejects -> expected=2 connected coverage
resetProbeStateForTests();
startSymbolProbe("DOGEUSDT", ["binance", "bybit", "okx"]);
const binanceOk = classifyProbeConnectionSnapshot({ synced: true, status: "connected" }, 1000);
const bybitOk = classifyProbeConnectionSnapshot({ synced: true, status: "connected" }, 1000);
const okxReject = classifyProbeConnectionSnapshot({ synced: false, status: "reconnecting", lastError: "invalid symbol OKX" }, 1000);
assert.equal(binanceOk, "supported");
assert.equal(bybitOk, "supported");
assert.equal(okxReject, "unsupported");
const timeoutOutcome = classifyProbeConnectionSnapshot({ synced: false, status: "reconnecting" }, 20_000, 12_000);
assert.equal(timeoutOutcome, "unavailable");
assert.notEqual(timeoutOutcome, "unsupported");

// 6. dynamic manager acquire + probe complete 2/2
const manager = new DynamicSymbolManager({ idleTtlMs: 40, historyActivationMs: 60_000 });
const activated = [];
const deactivated = [];
manager.setHooks({
  onActivate: (symbol, exchanges, meta) => {
    activated.push({ symbol, exchanges, meta });
  },
  onDeactivate: (symbol) => deactivated.push(symbol),
});

const acquireDoge = manager.acquire("DOGEUSDT", "client-a");
assert.equal(acquireDoge.ok, true);
assert.equal(acquireDoge.bootstrap, true);
assert.equal(acquireDoge.probeStatus, "probing");

const probe = startSymbolProbe("DOGEUSDT", ["binance", "bybit", "okx"]);
probe.results.binance = "supported";
probe.results.bybit = "supported";
probe.results.okx = "unsupported";
const finalized = finalizeSymbolProbe("DOGEUSDT", { force: true });
assert.ok(finalized);
assert.deepEqual(finalized.summary.supportedExchanges, ["binance", "bybit"]);
assert.equal(finalized.summary.expectedExchangeCount, 3);

const complete = manager.completeProbe("DOGEUSDT", finalized.summary);
assert.equal(complete.ok, true);
assert.deepEqual(manager.getState("DOGEUSDT").supportedExchanges, ["binance", "bybit"]);
assert.equal(manager.getState("DOGEUSDT").probeStatus, "complete");

// 7. all exchanges fail -> cleanup, no silent BTC fallback in manager
resetProbeStateForTests();
const managerFail = new DynamicSymbolManager({ idleTtlMs: 40, historyActivationMs: 60_000 });
const failHooks = [];
managerFail.setHooks({
  onActivate: (symbol) => failHooks.push(symbol),
  onDeactivate: (symbol) => failHooks.push(`deactivate:${symbol}`),
});
managerFail.acquire("LTCUSDT", "client-z");
startSymbolProbe("LTCUSDT", ["binance", "bybit", "okx"]);
const ltcFinal = finalizeSymbolProbe("LTCUSDT", { force: true });
assert.ok(ltcFinal);
assert.equal(ltcFinal.summary.supportedExchanges.length, 0);
const ltcComplete = managerFail.completeProbe("LTCUSDT", ltcFinal.summary);
assert.equal(ltcComplete.ok, false);
assert.equal(managerFail.getState("LTCUSDT"), null);

// 8. no duplicate subscriptions on second client
manager.acquire("DOGEUSDT", "client-b");
assert.equal(manager.getState("DOGEUSDT").referenceCount, 2);
manager.release("DOGEUSDT", "client-a");
assert.equal(manager.getState("DOGEUSDT").referenceCount, 1);

// 9. TTL cleanup still works
await new Promise((resolve) => {
  manager.release("DOGEUSDT", "client-b");
  setTimeout(resolve, 80);
});
assert.equal(manager.getState("DOGEUSDT"), null);

// 10. live registry overrides bootstrap metadata
resetSymbolRegistryForTests();
await refreshSymbolRegistry({
  force: true,
  fetchImpl: async (_url, label) => {
    if (label === "BINANCE") {
      return {
        symbols: [
          { symbol: "DOGEUSDT", status: "TRADING", quoteAsset: "USDT", isSpotTradingAllowed: true },
          { symbol: "BTCUSDT", status: "TRADING", quoteAsset: "USDT", isSpotTradingAllowed: true },
        ],
      };
    }
    if (label === "BYBIT") {
      return {
        result: {
          list: [
            { symbol: "DOGEUSDT", status: "Trading", quoteCoin: "USDT" },
            { symbol: "BTCUSDT", status: "Trading", quoteCoin: "USDT" },
          ],
        },
      };
    }
    return {
      data: [
        { instType: "SPOT", instId: "DOGE-USDT", state: "live", quoteCcy: "USDT" },
        { instType: "SPOT", instId: "BTC-USDT", state: "live", quoteCcy: "USDT" },
      ],
    };
  },
  sleepImpl: async () => {},
});
const liveState = getRegistryStateForTests();
assert.equal(liveState.registryMode, "live");
const liveDoge = searchRegistrySymbols("DOGE")[0];
assert.equal(liveDoge.source, "live");
assert.equal(liveDoge.supportedExchangeCount, 3);

// 11. health metrics safe
const health = getSymbolRegistryHealth();
assert.equal(typeof health.registryMode, "string");
assert.equal(typeof health.bootstrapSymbolCount, "number");
assert.equal(health.bootstrapSymbolCount, getBootstrapCatalogCount());
assert.equal(JSON.stringify(health).includes("apiKey"), false);

// 12. runtime mock: REST fail + probe 2/2 without duplicate websocket hooks count
resetSymbolRegistryForTests();
resetProbeStateForTests();
await refreshSymbolRegistry({ force: true, fetchImpl: makeFailFetch(), sleepImpl: async () => {} });
const mockManager = new DynamicSymbolManager({ idleTtlMs: 50, historyActivationMs: 60_000 });
let wsStarts = 0;
mockManager.setHooks({
  onActivate: () => {
    wsStarts += 1;
  },
});
mockManager.acquire("DOGEUSDT", "tab-1");
mockManager.acquire("DOGEUSDT", "tab-2");
assert.equal(wsStarts, 1);
startSymbolProbe("DOGEUSDT", ["binance", "bybit", "okx"]);
const mockProbeState = getSymbolProbeState("DOGEUSDT");
mockProbeState.results.binance = "supported";
mockProbeState.results.bybit = "supported";
mockProbeState.results.okx = "unavailable";
const mockFinalized = finalizeSymbolProbe("DOGEUSDT", { force: true });
assert.ok(mockFinalized);
assert.equal(mockFinalized.summary.supportedExchanges.length, 2);
mockManager.completeProbe("DOGEUSDT", mockFinalized.summary);
assert.equal(mockManager.getState("DOGEUSDT").supportedExchanges.length, 2);

console.log("bootstrap symbol registry tests passed: 12/12");
