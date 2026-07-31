import assert from "node:assert/strict";
import { DynamicSymbolManager } from "../lib/market-data/dynamic-symbol-manager.js";
import { seedSymbolRegistryForTests, resetSymbolRegistryForTests } from "../lib/market-data/symbol-registry.js";

function entry(symbol, count = 3) {
  const base = symbol.replace(/USDT$/, "");
  const exchanges = {
    binance: { supported: count >= 1, marketSymbol: symbol },
    bybit: { supported: count >= 2, marketSymbol: symbol },
    okx: { supported: count >= 3, marketSymbol: `${base}-USDT` },
  };
  return {
    symbol,
    base,
    quote: "USDT",
    displaySymbol: `${base}/USDT`,
    displayName: base,
    exchanges,
    supportedExchangeCount: count,
    supportedExchanges: ["binance", "bybit", "okx"].slice(0, count),
  };
}

resetSymbolRegistryForTests();
seedSymbolRegistryForTests([entry("DOGEUSDT"), entry("LTCUSDT", 2)]);

const manager = new DynamicSymbolManager({ idleTtlMs: 50, historyActivationMs: 60_000 });
const activated = [];
const deactivated = [];

manager.setHooks({
  onActivate: (symbol) => activated.push(symbol),
  onDeactivate: (symbol) => deactivated.push(symbol),
});

assert.equal(manager.acquire("DOGEUSDT", "client-a").ok, true);
assert.deepEqual(activated, ["DOGEUSDT"]);

assert.equal(manager.acquire("DOGEUSDT", "client-a").ok, true);
assert.equal(manager.getState("DOGEUSDT").referenceCount, 1);

assert.equal(manager.acquire("DOGEUSDT", "client-b").ok, true);
assert.equal(manager.getState("DOGEUSDT").referenceCount, 2);

manager.release("DOGEUSDT", "client-a");
assert.equal(manager.getState("DOGEUSDT").referenceCount, 1);

manager.release("DOGEUSDT", "client-b");
assert.equal(manager.getState("DOGEUSDT").referenceCount, 0);

manager.acquire("DOGEUSDT", "client-c");
assert.equal(deactivated.length, 0);

assert.equal(manager.acquire("NOTAUSDT", "bad").ok, false);

await new Promise((resolve) => {
  manager.release("DOGEUSDT", "client-c");
  setTimeout(resolve, 120);
});

assert.equal(manager.getState("DOGEUSDT"), null);

console.log("dynamic-symbol-manager tests passed: 8/8");
