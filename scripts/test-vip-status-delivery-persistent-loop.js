#!/usr/bin/env node

import { createRequire } from "module";

const require = createRequire(import.meta.url);
const {
  getPersistentWorkerConfig,
  runPersistentVipStatusDeliveryLoop,
} = require("../worker/vip-status-delivery-persistent-loop.js");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function withEnv(overrides, fn) {
  const previous = {};

  for (const [name, value] of Object.entries(overrides)) {
    previous[name] = process.env[name];
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [name, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = value;
        }
      }
    });
}

function createImmediateSleep() {
  const sleeps = [];
  return {
    sleeps,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  };
}

async function testConfigDefaults() {
  await withEnv(
    {
      VIP_STATUS_DELIVERY_POLL_INTERVAL_MS: undefined,
      VIP_STATUS_DELIVERY_IDLE_DELAY_MS: undefined,
      VIP_STATUS_DELIVERY_EMPTY_MAX_DELAY_MS: undefined,
    },
    () => {
      const config = getPersistentWorkerConfig();
      assert(config.emptyDelayMinMs === 5000, "Default empty min should be 5000ms");
      assert(config.emptyDelayMaxMs === 30000, "Default empty max should be 30000ms");
      assert(config.activeDelayMs === 2000, "Default active delay should be 2000ms");
    }
  );

  console.log("✓ vip persistent config defaults");
}

async function testEmptyQueueBackoff() {
  let cycleCount = 0;
  const { sleep, sleeps } = createImmediateSleep();

  await runPersistentVipStatusDeliveryLoop({
    sleep,
    config: {
      pollIntervalMs: 5000,
      activeDelayMs: 1000,
      errorDelayMs: 100,
      emptyDelayMinMs: 5000,
      emptyDelayMaxMs: 20000,
      idleBackoffMultiplier: 2,
      idleDelayMs: 1000,
    },
    shouldStop: () => cycleCount >= 4,
    runCycle: async () => {
      cycleCount += 1;
      return { claimed: 0, processed: 0, delivered: 0, failed: 0, queued: 0 };
    },
  });

  assert(
    sleeps.length >= 3 && sleeps[0] === 5000 && sleeps[1] === 10000 && sleeps[2] === 20000,
    `Expected backoff [5000,10000,20000,...], got ${JSON.stringify(sleeps)}`
  );

  console.log("✓ vip empty queue adaptive backoff");
}

async function testWorkUsesActiveDelayAndResetsBackoff() {
  let cycleCount = 0;
  const { sleep, sleeps } = createImmediateSleep();

  await runPersistentVipStatusDeliveryLoop({
    sleep,
    config: {
      pollIntervalMs: 5000,
      activeDelayMs: 1500,
      errorDelayMs: 100,
      emptyDelayMinMs: 5000,
      emptyDelayMaxMs: 30000,
      idleBackoffMultiplier: 2,
      idleDelayMs: 1500,
    },
    shouldStop: () => cycleCount >= 3,
    runCycle: async () => {
      cycleCount += 1;
      if (cycleCount === 1) return { claimed: 0 };
      if (cycleCount === 2) return { claimed: 2, processed: 2, delivered: 2, failed: 0, queued: 0 };
      return { claimed: 0 };
    },
  });

  assert(sleeps[0] === 5000, "First empty cycle uses min empty delay");
  assert(sleeps[1] === 1500, "Work cycle uses active delay");
  assert(sleeps[2] === 5000, "Backoff resets after work");

  console.log("✓ vip work delay and backoff reset");
}

async function testRetryAfterError() {
  let cycleCount = 0;
  const { sleep, sleeps } = createImmediateSleep();

  await runPersistentVipStatusDeliveryLoop({
    sleep,
    config: {
      pollIntervalMs: 5000,
      activeDelayMs: 1000,
      errorDelayMs: 4000,
      emptyDelayMinMs: 5000,
      emptyDelayMaxMs: 30000,
      idleBackoffMultiplier: 2,
      idleDelayMs: 1000,
    },
    shouldStop: () => cycleCount >= 2,
    runCycle: async () => {
      cycleCount += 1;
      if (cycleCount === 1) {
        throw new Error("transient");
      }
      return { claimed: 0 };
    },
  });

  assert(sleeps[0] === 4000, "Error path should use error delay");
  assert(sleeps[1] === 5000, "Recovery should resume empty min delay");

  console.log("✓ vip retry after error");
}

async function testGracefulShutdown() {
  let cycleCount = 0;
  let stopRequested = false;
  const { sleep } = createImmediateSleep();

  await runPersistentVipStatusDeliveryLoop({
    sleep,
    config: {
      pollIntervalMs: 5000,
      activeDelayMs: 1000,
      errorDelayMs: 100,
      emptyDelayMinMs: 5000,
      emptyDelayMaxMs: 30000,
      idleBackoffMultiplier: 2,
      idleDelayMs: 1000,
    },
    shouldStop: () => stopRequested,
    runCycle: async () => {
      cycleCount += 1;
      if (cycleCount === 1) {
        stopRequested = true;
      }
      return { claimed: 0 };
    },
  });

  assert(cycleCount === 1, "VIP loop should finish current cycle before stopping");

  console.log("✓ vip graceful shutdown");
}

async function main() {
  await testConfigDefaults();
  await testEmptyQueueBackoff();
  await testWorkUsesActiveDelayAndResetsBackoff();
  await testRetryAfterError();
  await testGracefulShutdown();
  console.log("\nAll VIP persistent loop tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
