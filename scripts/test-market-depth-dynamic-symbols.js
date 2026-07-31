import assert from "node:assert/strict";
import { getDynamicSymbolManager } from "../lib/market-data/dynamic-symbol-manager.js";
import { resetSymbolRegistryForTests, seedSymbolRegistryForTests } from "../lib/market-data/symbol-registry.js";
import { validateMarketDepthQuery } from "../lib/market-data/validation.js";
import { isSupportedMarketSymbol, getExchangeMarketSymbol } from "../lib/market-data/symbols.js";

resetSymbolRegistryForTests();
seedSymbolRegistryForTests([
  {
    symbol: "DOGEUSDT",
    base: "DOGE",
    quote: "USDT",
    displaySymbol: "DOGE/USDT",
    displayName: "Dogecoin",
    exchanges: {
      binance: { supported: true, marketSymbol: "DOGEUSDT" },
      bybit: { supported: true, marketSymbol: "DOGEUSDT" },
      okx: { supported: true, marketSymbol: "DOGE-USDT" },
    },
    supportedExchangeCount: 3,
    supportedExchanges: ["binance", "bybit", "okx"],
  },
  {
    symbol: "LTCUSDT",
    base: "LTC",
    quote: "USDT",
    displaySymbol: "LTC/USDT",
    displayName: "Litecoin",
    exchanges: {
      binance: { supported: true, marketSymbol: "LTCUSDT" },
      bybit: { supported: true, marketSymbol: "LTCUSDT" },
      okx: { supported: false, marketSymbol: null },
    },
    supportedExchangeCount: 2,
    supportedExchanges: ["binance", "bybit"],
  },
]);

const valid = validateMarketDepthQuery(new URLSearchParams("symbol=DOGEUSDT&mode=aggregated&levels=20&precision=0.0001"));
assert.equal(valid.valid, true);
assert.equal(valid.params.symbol, "DOGEUSDT");

const invalid = validateMarketDepthQuery(new URLSearchParams("symbol=NOTREALUSDT&mode=aggregated&levels=20"));
assert.equal(invalid.valid, false);

assert.equal(isSupportedMarketSymbol("LTCUSDT"), true);
assert.equal(isSupportedMarketSymbol("NOTAUSDT"), false);
assert.equal(getExchangeMarketSymbol("okx", "DOGEUSDT"), "DOGE-USDT");
assert.equal(getExchangeMarketSymbol("okx", "LTCUSDT"), null);

const manager = getDynamicSymbolManager();
manager.resetForTests();

const acquired = manager.acquire("LTCUSDT", "test-client");
assert.equal(acquired.ok, true);
assert.equal(acquired.expectedExchangeCount, 2);
assert.equal(acquired.supportedExchanges.length, 2);
assert.equal(acquired.historyEligible, false);

manager.release("LTCUSDT", "test-client");

console.log("market-depth dynamic symbols tests passed: 9/9");
