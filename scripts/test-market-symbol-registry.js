import assert from "node:assert/strict";
import {
  classifyRegistrySupport,
  mergeExchangeSymbolMaps,
  parseBinanceSymbols,
  parseBybitSymbols,
  parseOkxSymbols,
  resetSymbolRegistryForTests,
  searchRegistrySymbols,
  seedSymbolRegistryForTests,
} from "../lib/market-data/symbol-registry.js";
import { normalizeMarketSymbol } from "../lib/market-data/symbols.js";

function sampleDogeMaps() {
  const binance = new Map([
    [
      "DOGEUSDT",
      { binance: { supported: true, marketSymbol: "DOGEUSDT" } },
    ],
  ]);
  const bybit = new Map([
    [
      "DOGEUSDT",
      { bybit: { supported: true, marketSymbol: "DOGEUSDT" } },
    ],
  ]);
  const okx = new Map([
    [
      "DOGEUSDT",
      { okx: { supported: true, marketSymbol: "DOGE-USDT" } },
    ],
  ]);
  return [binance, bybit, okx];
}

resetSymbolRegistryForTests();

const merged = mergeExchangeSymbolMaps(sampleDogeMaps());
assert.equal(merged.length, 1);
assert.equal(merged[0].symbol, "DOGEUSDT");
assert.equal(merged[0].supportedExchangeCount, 3);
assert.equal(classifyRegistrySupport(merged[0]), "supported3Of3");

const twoOfThree = mergeExchangeSymbolMaps([
  sampleDogeMaps()[0],
  sampleDogeMaps()[1],
  new Map(),
]);
assert.equal(twoOfThree[0].supportedExchangeCount, 2);
assert.equal(classifyRegistrySupport(twoOfThree[0]), "supported2Of3");

assert.equal(normalizeMarketSymbol("btc/usdt"), "BTCUSDT");
assert.equal(normalizeMarketSymbol("DOGE-USDT"), "DOGEUSDT");
assert.equal(normalizeMarketSymbol("doge"), "DOGEUSDT");

seedSymbolRegistryForTests(merged);
const search = searchRegistrySymbols("doge", { limit: 10 });
assert.equal(search.length, 1);
assert.equal(search[0].base, "DOGE");

const binancePayload = {
  symbols: [
    { symbol: "BTCUSDT", status: "TRADING", quoteAsset: "USDT", isSpotTradingAllowed: true },
    { symbol: "DOGEUPUSDT", status: "TRADING", quoteAsset: "USDT", isSpotTradingAllowed: true },
  ],
};
const parsed = parseBinanceSymbols(binancePayload);
assert.ok(parsed.has("BTCUSDT"));
assert.ok(!parsed.has("DOGEUPUSDT"));

console.log("market-symbol-registry tests passed: 10/10");
