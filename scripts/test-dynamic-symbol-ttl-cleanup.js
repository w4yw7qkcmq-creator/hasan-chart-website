import assert from "node:assert/strict";
import { DynamicSymbolManager } from "../lib/market-data/dynamic-symbol-manager.js";
import {
  resetSymbolRegistryForTests,
  seedSymbolRegistryForTests,
} from "../lib/market-data/symbol-registry.js";
import { isBootstrapCatalogSymbol } from "../lib/market-data/bootstrap-symbol-catalog.js";
import { isKnownRegistrySymbol } from "../lib/market-data/symbol-registry.js";

/** Test-only symbol — seeded in isolated registry, never public/bootstrap catalog. */
const TEST_SYMBOL = "TESTTTLUSDT";
const IDLE_TTL_MS = 40;

function makeTestEntry(symbol) {
  const base = symbol.replace(/USDT$/, "");
  return {
    symbol,
    base,
    quote: "USDT",
    displaySymbol: `${base}/USDT`,
    displayName: "Test TTL Symbol",
    exchanges: {
      binance: { supported: true, marketSymbol: symbol },
      bybit: { supported: true, marketSymbol: symbol },
      okx: { supported: false, marketSymbol: null },
    },
    supportedExchangeCount: 2,
    supportedExchanges: ["binance", "bybit"],
  };
}

function getDebugSnapshotForTests(manager) {
  let idleTimerCount = 0;
  for (const state of manager.symbols.values()) {
    if (state.idleTimer) idleTimerCount += 1;
  }
  return {
    symbolKeys: [...manager.symbols.keys()],
    clientKeys: [...manager.clientSymbols.keys()],
    clientSymbolCounts: Object.fromEntries(
      [...manager.clientSymbols.entries()].map(([id, set]) => [id, set.size]),
    ),
    idleTimerCount,
    health: manager.getHealthSnapshot({ listenerCount: 0 }),
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

resetSymbolRegistryForTests();
seedSymbolRegistryForTests([makeTestEntry(TEST_SYMBOL)]);

assert.equal(isBootstrapCatalogSymbol(TEST_SYMBOL), false, "test symbol must not be bootstrap catalog");
assert.equal(isKnownRegistrySymbol(TEST_SYMBOL), true, "test symbol must be known in isolated registry");

const manager = new DynamicSymbolManager({
  idleTtlMs: IDLE_TTL_MS,
  historyActivationMs: 60_000,
});

let activateCalls = 0;
let deactivateCalls = 0;
let lastActivatedExchanges = [];
const mockAdapter = {
  subscriptions: { binance: 0, bybit: 0, okx: 0 },
  listeners: 0,
  reconnectAttempts: 0,
};

manager.setHooks({
  onActivate: (symbol, exchanges) => {
    assert.equal(symbol, TEST_SYMBOL);
    activateCalls += 1;
    lastActivatedExchanges = [...exchanges];
    mockAdapter.listeners += 1;
    for (const exchange of exchanges) {
      mockAdapter.subscriptions[exchange] = (mockAdapter.subscriptions[exchange] || 0) + 1;
    }
  },
  onDeactivate: (symbol) => {
    assert.equal(symbol, TEST_SYMBOL);
    deactivateCalls += 1;
    mockAdapter.listeners = Math.max(0, mockAdapter.listeners - 1);
    for (const exchange of lastActivatedExchanges) {
      mockAdapter.subscriptions[exchange] = Math.max(0, (mockAdapter.subscriptions[exchange] || 0) - 1);
    }
  },
  onHistoryEligible: () => {
    throw new Error("history must not activate in TTL cleanup test");
  },
});

function symbolHealth() {
  return manager.getHealthSnapshot({ listenerCount: mockAdapter.listeners }).symbols.find(
    (entry) => entry.symbol === TEST_SYMBOL,
  );
}

// 1. acquire client A -> refCount = 1
assert.equal(manager.acquire(TEST_SYMBOL, "client-a").ok, true);
assert.equal(manager.getState(TEST_SYMBOL).referenceCount, 1);
assert.equal(activateCalls, 1);
assert.equal(manager.getState(TEST_SYMBOL).idleTimer, null);
assert.equal(symbolHealth()?.status, "active");
assert.equal(symbolHealth()?.hasIdleTimer, false);

// 2. acquire client B -> refCount = 2, single subscribe
assert.equal(manager.acquire(TEST_SYMBOL, "client-b").ok, true);
assert.equal(manager.getState(TEST_SYMBOL).referenceCount, 2);
assert.equal(activateCalls, 1, "onActivate must run once despite second client");
assert.equal(mockAdapter.listeners, 1);
assert.equal(mockAdapter.subscriptions.binance, 1);
assert.equal(mockAdapter.subscriptions.bybit, 1);

// 3. release A -> refCount = 1, no idle timer
manager.release(TEST_SYMBOL, "client-a");
assert.equal(manager.getState(TEST_SYMBOL).referenceCount, 1);
assert.equal(manager.getState(TEST_SYMBOL).idleTimer, null, "idle timer must not start while refCount > 0");
assert.equal(symbolHealth()?.status, "active");
assert.equal(deactivateCalls, 0);

// 4. release B -> refCount = 0, idle + timer
manager.release(TEST_SYMBOL, "client-b");
const idleState = manager.getState(TEST_SYMBOL);
assert.equal(idleState.referenceCount, 0);
assert.notEqual(idleState.idleTimer, null, "idle timer must start only at refCount 0");
assert.equal(idleState.activeClients.size, 0);
assert.equal(symbolHealth()?.status, "idle");
assert.equal(symbolHealth()?.hasIdleTimer, true);

const idleSnapshot = getDebugSnapshotForTests(manager);
assert.equal(idleSnapshot.health.idleSymbols, 1);
assert.equal(idleSnapshot.health.idleTimerCount, 1);
assert.equal(idleSnapshot.health.dynamicSymbols, 0);
assert.deepEqual(idleSnapshot.clientSymbolCounts, { "client-a": 0, "client-b": 0 });

// 5. TTL elapses
await sleep(IDLE_TTL_MS + 25);

// 6. cleanup
assert.equal(manager.getState(TEST_SYMBOL), null, "symbol must be removed from manager Map");
assert.equal(deactivateCalls, 1, "onDeactivate must run exactly once");
assert.equal(activateCalls, 1);

const afterSnapshot = getDebugSnapshotForTests(manager);
assert.equal(afterSnapshot.symbolKeys.includes(TEST_SYMBOL), false);
assert.equal(afterSnapshot.idleTimerCount, 0);
assert.equal(afterSnapshot.health.idleTimerCount, 0);
assert.equal(afterSnapshot.health.idleSymbols, 0);
assert.equal(afterSnapshot.health.dynamicSymbols, 0);
assert.equal(afterSnapshot.health.symbols.some((entry) => entry.symbol === TEST_SYMBOL), false);
assert.equal(mockAdapter.subscriptions.binance, 0);
assert.equal(mockAdapter.subscriptions.bybit, 0);
assert.equal(mockAdapter.subscriptions.okx, 0);
assert.equal(mockAdapter.listeners, 0);
assert.equal(mockAdapter.reconnectAttempts, 0);

// client reference maps cleared for test clients
assert.equal(manager.clientSymbols.get("client-a")?.has(TEST_SYMBOL) ?? false, false);
assert.equal(manager.clientSymbols.get("client-b")?.has(TEST_SYMBOL) ?? false, false);

// no re-activation without user
await sleep(30);
assert.equal(activateCalls, 1, "no reconnect/subscribe after cleanup");
assert.equal(manager.getState(TEST_SYMBOL), null);

// fresh acquire after cleanup works without stale state
assert.equal(manager.acquire(TEST_SYMBOL, "client-reopen").ok, true);
assert.equal(manager.getState(TEST_SYMBOL).referenceCount, 1);
assert.equal(activateCalls, 2);
assert.equal(deactivateCalls, 1);
manager.resetForTests();

console.log("dynamic-symbol ttl cleanup tests passed: 28/28");
