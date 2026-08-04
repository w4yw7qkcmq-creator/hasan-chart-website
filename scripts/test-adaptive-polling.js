#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAdaptivePoller } from "../lib/client/adaptive-poller.js";
import {
  getPollingMetricsSnapshot,
  resetPollingMetrics,
} from "../lib/client/polling-metrics.js";
import { dedupeInFlightRequest, getInFlightRequestCount } from "../lib/client/in-flight-dedupe.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function installDomMocks({ hidden = false } = {}) {
  globalThis.document = {
    hidden,
    addEventListener() {},
    removeEventListener() {},
  };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { onLine: true },
  });
  globalThis.window = {
    addEventListener() {},
    removeEventListener() {},
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testHiddenPausesPolling() {
  resetPollingMetrics();
  installDomMocks({ hidden: true });

  let runs = 0;
  const poller = createAdaptivePoller({
    intervalMs: 20,
    fetch: async () => {
      runs += 1;
    },
  });

  poller.start({ immediate: true });
  await sleep(60);
  poller.destroy();

  assert.equal(runs, 0);
  assert.ok(getPollingMetricsSnapshot().pollingPausedHidden >= 1);
}

async function testVisibleTriggersRefresh() {
  resetPollingMetrics();
  installDomMocks({ hidden: false });

  let runs = 0;
  const poller = createAdaptivePoller({
    intervalMs: 60_000,
    visibilityJitterMs: 0,
    fetch: async () => {
      runs += 1;
    },
  });

  poller.start({ immediate: false });
  poller.triggerRefresh("visible");
  await sleep(10);
  poller.destroy();
  assert.equal(runs, 1);
}

async function testNoOverlappingRequests() {
  resetPollingMetrics();
  installDomMocks();

  let active = 0;
  let maxActive = 0;

  const poller = createAdaptivePoller({
    intervalMs: 10,
    fetch: async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await sleep(40);
      active -= 1;
    },
  });

  poller.start({ immediate: true });
  await sleep(80);
  poller.destroy();

  assert.equal(maxActive, 1);
}

async function testAbortOnDestroy() {
  installDomMocks();

  let aborted = false;
  const poller = createAdaptivePoller({
    intervalMs: 60_000,
    fetch: async ({ signal }) => {
      signal.addEventListener("abort", () => {
        aborted = true;
      });
      await sleep(100);
    },
  });

  poller.start({ immediate: true });
  await sleep(10);
  poller.destroy();
  await sleep(10);
  assert.equal(aborted, true);
}

async function testStaleResponseIgnoredByHookPattern() {
  let requestId = 0;
  let visible = "first";

  async function load(label) {
    const current = ++requestId;
    await sleep(20);
    if (current === requestId) {
      visible = label;
    }
  }

  await Promise.all([load("first"), load("second")]);
  assert.equal(visible, "second");
}

async function testShouldPollGate() {
  installDomMocks();
  let enabled = false;
  let runs = 0;
  const poller = createAdaptivePoller({
    intervalMs: 15,
    shouldPoll: () => enabled,
    fetch: async () => {
      runs += 1;
    },
  });

  poller.start({ immediate: true });
  await sleep(40);
  enabled = true;
  poller.triggerRefresh("enabled");
  await sleep(10);
  poller.destroy();
  assert.equal(runs, 1);
}

async function testErrorBackoff() {
  resetPollingMetrics();
  installDomMocks();

  let attempts = 0;
  const poller = createAdaptivePoller({
    intervalMs: 20,
    minIntervalMs: 20,
    maxIntervalMs: 80,
    fetch: async () => {
      attempts += 1;
      throw new Error("fail");
    },
  });

  poller.start({ immediate: true });
  await sleep(70);
  poller.destroy();
  assert.ok(attempts >= 2);
  assert.ok(getPollingMetricsSnapshot().pollingRetries >= 1);
}

async function testSuccessResetsBackoff() {
  installDomMocks();
  let failOnce = true;
  const poller = createAdaptivePoller({
    intervalMs: 15,
    minIntervalMs: 15,
    maxIntervalMs: 60,
    fetch: async () => {
      if (failOnce) {
        failOnce = false;
        throw new Error("once");
      }
    },
  });

  poller.start({ immediate: true });
  await sleep(80);
  poller.destroy();
  poller.resetBackoff();
  assert.equal(failOnce, false);
}

async function testInFlightDedupe() {
  let calls = 0;
  const first = dedupeInFlightRequest("key", async () => {
    calls += 1;
    await sleep(30);
    return "ok";
  });
  const second = dedupeInFlightRequest("key", async () => {
    calls += 1;
    return "ok2";
  });

  const [a, b] = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(a, "ok");
  assert.equal(b, "ok");
  assert.equal(getInFlightRequestCount(), 0);
}

function testOrderBookHooksUseAdaptivePoller() {
  for (const file of ["app/hooks/useOrderBook24hSummary.js", "app/hooks/useOrderBookLiquidations.js"]) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    assert.match(source, /createAdaptivePoller/);
    assert.doesNotMatch(source, /setInterval\(/);
  }
}

function testMyAnalysisRemovedFixed15sPoll() {
  const source = fs.readFileSync(path.join(root, "app/(app)/my-analysis/page.js"), "utf8");
  assert.doesNotMatch(source, /,\s*15000\)/);
  assert.match(source, /createAdaptivePoller/);
  assert.match(source, /incrementPollingMetric\("realtimeEvents"\)/);
}

function testPriceAlertIntervalUntouched() {
  const workerIndex = fs.readFileSync(path.join(root, "worker/index.js"), "utf8");
  assert.match(workerIndex, /30000|30_000|30 \* 1000/);
  assert.doesNotMatch(
    fs.readFileSync(path.join(root, "app/hooks/useOrderBook24hSummary.js"), "utf8"),
    /checkIntervalMs/
  );
}

function testHealthCompactChecksShim() {
  const routeSource = fs.readFileSync(path.join(root, "app/api/health/route.js"), "utf8");
  assert.match(routeSource, /checks:/);
  assert.match(routeSource, /database:\s*report\.checks\.database/);
}

const tests = [
  ["hidden document pauses polling", testHiddenPausesPolling],
  ["visible triggers one refresh", testVisibleTriggersRefresh],
  ["no overlapping requests", testNoOverlappingRequests],
  ["abort on destroy", testAbortOnDestroy],
  ["stale response ignored pattern", testStaleResponseIgnoredByHookPattern],
  ["shouldPoll gate", testShouldPollGate],
  ["error backoff", testErrorBackoff],
  ["success resets backoff helper", testSuccessResetsBackoff],
  ["in-flight dedupe", testInFlightDedupe],
  ["order book hooks use adaptive poller", testOrderBookHooksUseAdaptivePoller],
  ["my-analysis removed fixed 15s poll", testMyAnalysisRemovedFixed15sPoll],
  ["price alert interval untouched", testPriceAlertIntervalUntouched],
  ["health compact checks shim in route", testHealthCompactChecksShim],
];

installDomMocks();

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`  ✔ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✖ ${name}: ${error.message}`);
  }
}

if (failed > 0) process.exit(1);
console.log(`\n${tests.length}/${tests.length} adaptive polling tests passed`);
