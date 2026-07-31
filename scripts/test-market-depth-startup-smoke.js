import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CORE_SYMBOLS } from "../lib/market-data/dynamic-symbol-constants.js";
import { getDynamicSymbolManager } from "../lib/market-data/dynamic-symbol-manager.js";
import { resetProbeStateForTests } from "../lib/market-data/exchange-symbol-probe.js";
import {
  startMarketDepth,
} from "../lib/market-data/market-depth-hub.js";
import {
  isBootstrapSymbol,
  refreshSymbolRegistry,
  resetSymbolRegistryForTests,
} from "../lib/market-data/symbol-registry.js";

const HUB_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../lib/market-data/market-depth-hub.js",
);

function assertBootstrapSymbolImport(source) {
  if (!/\bisBootstrapSymbol\s*\(/.test(source)) return;

  const importMatch = source.match(
    /import\s*\{([\s\S]*?)\}\s*from\s*["']\.\/symbol-registry\.js["']/,
  );
  assert.ok(importMatch, "market-depth-hub must import from ./symbol-registry.js");
  assert.match(
    importMatch[1],
    /\bisBootstrapSymbol\b/,
    "isBootstrapSymbol must be imported when used in market-depth-hub.js",
  );
}

function shutdownHub(hub) {
  for (const connection of hub.connections.values()) {
    connection.shutdown?.();
  }
  hub.connections.clear();
  hub.latestSnapshots.clear();

  for (const timer of hub.probeTimers.values()) {
    clearTimeout(timer);
  }
  hub.probeTimers.clear();

  if (hub.broadcastTimer) {
    clearTimeout(hub.broadcastTimer);
    hub.broadcastTimer = null;
  }
  hub.pendingBroadcast = false;
  hub.subscribers.clear();
  hub.started = false;
}

function resetHubGlobal() {
  if (globalThis.__marketDepthHub) {
    shutdownHub(globalThis.__marketDepthHub);
    delete globalThis.__marketDepthHub;
  }
}

const hubSource = readFileSync(HUB_PATH, "utf8");
assertBootstrapSymbolImport(hubSource);

resetHubGlobal();
resetSymbolRegistryForTests();
resetProbeStateForTests();
getDynamicSymbolManager().resetForTests();

await refreshSymbolRegistry({
  force: true,
  fetchImpl: async () => {
    throw new Error("offline");
  },
  sleepImpl: async () => {},
});

assert.equal(typeof isBootstrapSymbol, "function");
assert.equal(isBootstrapSymbol("DOGEUSDT"), true);
assert.equal(isBootstrapSymbol("BTCUSDT"), false);

const hub = startMarketDepth("startup-smoke-test");
assert.equal(hub.started, true);

for (const symbol of CORE_SYMBOLS) {
  assert.ok(hub.symbolState.has(symbol), `core symbol ${symbol} should start without crash`);
}

const manager = getDynamicSymbolManager();
const acquired = manager.acquire("DOGEUSDT", "startup-smoke-client");
assert.equal(acquired.ok, true);
assert.ok(hub.symbolState.has("DOGEUSDT"), "bootstrap symbol should start without crash");

const bootstrapState = hub.symbolState.get("DOGEUSDT");
assert.equal(bootstrapState?.bootstrapProbe, true);

manager.release("DOGEUSDT", "startup-smoke-client");
hub.stopSymbol("DOGEUSDT");
shutdownHub(hub);
delete globalThis.__marketDepthHub;

assert.equal(globalThis.__marketDepthHub, undefined);

console.log("market-depth startup smoke tests passed: 6/6");
