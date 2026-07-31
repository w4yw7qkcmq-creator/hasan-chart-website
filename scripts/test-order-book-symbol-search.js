import assert from "node:assert/strict";
import {
  SITE_SYMBOLS,
  SYMBOL_SEARCH_ENTRIES,
  filterSymbolSearchEntries,
  normalizeSiteSymbol,
} from "../lib/market-data/symbols.js";

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
}

test("search entries mirror allowed site symbols only", () => {
  assert.equal(SYMBOL_SEARCH_ENTRIES.length, SITE_SYMBOLS.length);
  for (const symbol of SITE_SYMBOLS) {
    assert.ok(SYMBOL_SEARCH_ENTRIES.some((entry) => entry.value === symbol));
  }
});

test("filter accepts btc, slash form, and compact form", () => {
  const btc = filterSymbolSearchEntries(SYMBOL_SEARCH_ENTRIES, "btc");
  assert.equal(btc.length, 1);
  assert.equal(btc[0].value, "BTCUSDT");

  const slash = filterSymbolSearchEntries(SYMBOL_SEARCH_ENTRIES, "BTC/USDT");
  assert.equal(slash[0].value, "BTCUSDT");

  const compact = filterSymbolSearchEntries(SYMBOL_SEARCH_ENTRIES, "BTCUSDT");
  assert.equal(compact[0].value, "BTCUSDT");
});

test("filter rejects unsupported symbols", () => {
  assert.equal(filterSymbolSearchEntries(SYMBOL_SEARCH_ENTRIES, "DOGE").length, 0);
  assert.equal(filterSymbolSearchEntries(SYMBOL_SEARCH_ENTRIES, "ADAUSDT").length, 0);
  assert.equal(normalizeSiteSymbol("DOGEUSDT"), null);
});

test("normalize accepts common input shapes", () => {
  assert.equal(normalizeSiteSymbol("btc-usdt"), "BTCUSDT");
  assert.equal(normalizeSiteSymbol("eth/usdt"), "ETHUSDT");
  assert.equal(normalizeSiteSymbol("SOLUSDT"), "SOLUSDT");
});

console.log(`order-book symbol search tests passed: ${passed}/${passed}`);
