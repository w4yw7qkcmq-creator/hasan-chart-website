#!/usr/bin/env node

import assert from "node:assert/strict";
import { CORE_SYMBOLS } from "../lib/market-data/dynamic-symbol-constants.js";
import { getDynamicSymbolManager } from "../lib/market-data/dynamic-symbol-manager.js";
import { resetProbeStateForTests } from "../lib/market-data/exchange-symbol-probe.js";
import { getMarketDepthHub, startMarketDepth } from "../lib/market-data/market-depth-hub.js";
import {
  MARKET_DEPTH_LIFECYCLE_STATES,
  ensureMarketDepthConsumer,
  getMarketDepthLifecycle,
  releaseMarketDepthConsumer,
  resetMarketDepthLifecycleForTests,
} from "../lib/market-data/market-depth-lifecycle.js";
import { resetHistoricalMarketRecorderForTests } from "../lib/market-data/history/historical-market-recorder.js";
import { resetHistoricalLiquidityWallRecorderForTests } from "../lib/market-data/history/liquidity-walls/liquidity-wall-recorder.js";
import { resetSymbolRegistryForTests } from "../lib/market-data/symbol-registry.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resetAll() {
  process.env.MARKET_DEPTH_LIFECYCLE_TEST_MODE = "1";
  if (globalThis.__marketDepthLifecycle) {
    globalThis.__marketDepthLifecycle.cancelIdleShutdown();
    try {
      globalThis.__marketDepthLifecycle.shutdown("test-reset");
    } catch {
      // ignore shutdown errors in test cleanup
    }
  }
  resetMarketDepthLifecycleForTests();
  resetHistoricalMarketRecorderForTests();
  resetHistoricalLiquidityWallRecorderForTests();
  resetSymbolRegistryForTests();
  resetProbeStateForTests();
  getDynamicSymbolManager().resetForTests();
  if (globalThis.__marketDepthHub) {
    globalThis.__marketDepthHub.stop("test-reset");
    delete globalThis.__marketDepthHub;
  }
}

async function testZeroConsumersDepthStopped() {
  resetAll();
  const lifecycle = getMarketDepthLifecycle();
  const hub = getMarketDepthHub();

  assert.equal(lifecycle.state, MARKET_DEPTH_LIFECYCLE_STATES.STOPPED);
  assert.equal(hub.started, false);
  assert.equal(hub.connections.size, 0);
  console.log("✓ zero consumers → depth not running");
}

async function testFirstConsumerStartsHub() {
  resetAll();
  process.env.MARKET_DEPTH_IDLE_TTL_MS = "60000";

  await ensureMarketDepthConsumer("test-first-consumer");
  const lifecycle = getMarketDepthLifecycle();
  const hub = getMarketDepthHub();

  assert.equal(lifecycle.state, MARKET_DEPTH_LIFECYCLE_STATES.RUNNING);
  assert.equal(hub.started, true);
  assert.ok(hub.connections.size > 0, "core depth connections should start");

  releaseMarketDepthConsumer("test-first-consumer");
  console.log("✓ first consumer starts hub");
}

async function testConcurrentConsumersSingleStart() {
  resetAll();
  process.env.MARKET_DEPTH_IDLE_TTL_MS = "60000";

  const lifecycle = getMarketDepthLifecycle();
  let startCount = 0;
  const originalStart = getMarketDepthHub().start.bind(getMarketDepthHub());
  const hub = getMarketDepthHub();
  hub.start = (...args) => {
    startCount += 1;
    return originalStart(...args);
  };

  await Promise.all([
    lifecycle.acquireConsumer("consumer-a"),
    lifecycle.acquireConsumer("consumer-b"),
  ]);

  assert.equal(startCount, 1, "hub.start should run once for concurrent acquires");
  assert.equal(lifecycle.consumerCount, 2);

  releaseMarketDepthConsumer("consumer-a");
  releaseMarketDepthConsumer("consumer-b");
  console.log("✓ concurrent consumers share one infrastructure start");
}

async function testSharedHubAcrossSubscribers() {
  resetAll();
  process.env.MARKET_DEPTH_IDLE_TTL_MS = "60000";

  await ensureMarketDepthConsumer("shared-hub");
  const hub = getMarketDepthHub();
  const seen = [];

  const unsubA = hub.subscribe(() => seen.push("a"));
  const unsubB = hub.subscribe(() => seen.push("b"));

  assert.equal(hub.subscribers.size, 2);
  hub.scheduleBroadcast();
  await sleep(200);
  hub.broadcast();

  assert.ok(seen.includes("a"));
  assert.ok(seen.includes("b"));

  unsubA();
  unsubB();
  releaseMarketDepthConsumer("shared-hub");
  console.log("✓ multiple subscribers share same hub");
}

async function testDisconnectOneKeepsRunning() {
  resetAll();
  process.env.MARKET_DEPTH_IDLE_TTL_MS = "60000";

  await ensureMarketDepthConsumer("consumer-a");
  await ensureMarketDepthConsumer("consumer-b");

  releaseMarketDepthConsumer("consumer-a");
  const lifecycle = getMarketDepthLifecycle();
  const hub = getMarketDepthHub();

  assert.equal(lifecycle.consumerCount, 1);
  assert.equal(lifecycle.state, MARKET_DEPTH_LIFECYCLE_STATES.RUNNING);
  assert.equal(hub.started, true);

  releaseMarketDepthConsumer("consumer-b");
  console.log("✓ disconnect one consumer keeps hub running until last release");
}

async function testIdleTtlShutdown() {
  resetAll();
  process.env.MARKET_DEPTH_IDLE_TTL_MS = "80";

  await ensureMarketDepthConsumer("idle-test");
  releaseMarketDepthConsumer("idle-test");

  const lifecycle = getMarketDepthLifecycle();
  assert.equal(lifecycle.state, MARKET_DEPTH_LIFECYCLE_STATES.IDLE_PENDING);

  await sleep(120);

  const hub = getMarketDepthHub();
  assert.equal(lifecycle.state, MARKET_DEPTH_LIFECYCLE_STATES.STOPPED);
  assert.equal(hub.started, false);
  assert.equal(hub.connections.size, 0);
  console.log("✓ idle TTL shuts down depth infrastructure");
}

async function testReconnectBeforeTtlCancelsShutdown() {
  resetAll();
  process.env.MARKET_DEPTH_IDLE_TTL_MS = "200";

  await ensureMarketDepthConsumer("idle-cancel");
  releaseMarketDepthConsumer("idle-cancel");

  const lifecycle = getMarketDepthLifecycle();
  assert.equal(lifecycle.state, MARKET_DEPTH_LIFECYCLE_STATES.IDLE_PENDING);

  await sleep(50);
  await ensureMarketDepthConsumer("idle-cancel-return");
  assert.notEqual(lifecycle.state, MARKET_DEPTH_LIFECYCLE_STATES.STOPPED);
  assert.equal(getMarketDepthHub().started, true);

  releaseMarketDepthConsumer("idle-cancel-return");
  console.log("✓ consumer before TTL cancels shutdown");
}

async function testCleanRestartAfterShutdown() {
  resetAll();
  process.env.MARKET_DEPTH_IDLE_TTL_MS = "60";

  await ensureMarketDepthConsumer("restart-a");
  releaseMarketDepthConsumer("restart-a");
  await sleep(100);

  assert.equal(getMarketDepthLifecycle().state, MARKET_DEPTH_LIFECYCLE_STATES.STOPPED);

  await ensureMarketDepthConsumer("restart-b");
  const hub = getMarketDepthHub();
  assert.equal(hub.started, true);
  assert.ok(hub.connections.size > 0);

  for (const symbol of CORE_SYMBOLS) {
    assert.ok(hub.symbolState.has(symbol), `core symbol ${symbol} restarted`);
  }

  releaseMarketDepthConsumer("restart-b");
  console.log("✓ clean restart after idle shutdown");
}

async function testZeroSubscribersNoBroadcastTimer() {
  resetAll();
  process.env.MARKET_DEPTH_IDLE_TTL_MS = "60000";

  await ensureMarketDepthConsumer("broadcast-off");
  const hub = getMarketDepthHub();

  hub.scheduleBroadcast();
  assert.equal(hub.broadcastTimer, null, "broadcast timer should not start with zero SSE subscribers");

  const unsub = hub.subscribe(() => {});
  hub.scheduleBroadcast();
  assert.ok(hub.broadcastTimer || hub.pendingBroadcast, "broadcast should schedule with subscribers");

  if (hub.broadcastTimer) clearTimeout(hub.broadcastTimer);
  hub.broadcastTimer = null;
  unsub();
  releaseMarketDepthConsumer("broadcast-off");
  console.log("✓ zero subscribers → no broadcast loop");
}

async function testStoppedHubReturnsWarmingSnapshot() {
  resetAll();
  const hub = getMarketDepthHub();
  const payload = hub.getSnapshot({
    symbol: "BTCUSDT",
    mode: "aggregated",
    precision: 1,
    levels: 20,
    liquidityRange: 1,
    flowWindow: 60_000,
    dominanceWindow: 300_000,
    largeTradeWindow: 300_000,
    largeTradeThreshold: 25_000,
  });

  assert.equal(payload.warming, true);
  assert.equal(payload.stale, true);
  assert.equal(hub.connections.size, 0);
  console.log("✓ stopped hub returns warming snapshot without opening sockets");
}

async function main() {
  await testZeroConsumersDepthStopped();
  await testFirstConsumerStartsHub();
  await testConcurrentConsumersSingleStart();
  await testSharedHubAcrossSubscribers();
  await testDisconnectOneKeepsRunning();
  await testIdleTtlShutdown();
  await testReconnectBeforeTtlCancelsShutdown();
  await testCleanRestartAfterShutdown();
  await testZeroSubscribersNoBroadcastTimer();
  await testStoppedHubReturnsWarmingSnapshot();

  resetAll();
  console.log("\nAll market depth lifecycle tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
