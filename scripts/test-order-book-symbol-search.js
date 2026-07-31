import assert from "node:assert/strict";
import {
  filterSymbolSearchEntries,
  normalizeMarketSymbol,
  registryEntryToSearchEntry,
  SITE_SYMBOLS,
} from "../lib/market-data/symbols.js";
import { seedSymbolRegistryForTests, resetSymbolRegistryForTests } from "../lib/market-data/symbol-registry.js";

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
]);

const entries = SITE_SYMBOLS.map((symbol) => ({
  value: symbol,
  label: `${symbol.slice(0, -4)}/USDT`,
  base: symbol.slice(0, -4),
}));

assert.equal(entries.length, SITE_SYMBOLS.length);

const btc = filterSymbolSearchEntries(entries, "btc");
assert.equal(btc.length, 1);
assert.equal(btc[0].value, "BTCUSDT");

const slash = filterSymbolSearchEntries(entries, "BTC/USDT");
assert.equal(slash[0].value, "BTCUSDT");

const dogeEntry = registryEntryToSearchEntry({
  symbol: "DOGEUSDT",
  base: "DOGE",
  displaySymbol: "DOGE/USDT",
  displayName: "Dogecoin",
  supportedExchangeCount: 3,
  supportedExchanges: ["binance", "bybit", "okx"],
});
assert.equal(dogeEntry.value, "DOGEUSDT");

assert.equal(normalizeMarketSymbol("btc-usdt"), "BTCUSDT");
assert.equal(normalizeMarketSymbol("eth/usdt"), "ETHUSDT");
assert.equal(normalizeMarketSymbol("SOLUSDT"), "SOLUSDT");

console.log("order-book symbol search tests passed: 6/6");
