#!/usr/bin/env node

/**
 * Tests for persistent email queue worker loop (mocks only).
 *
 * Usage:
 *   node scripts/test-email-queue-persistent-worker.js
 */

import { createRequire } from "module";

const require = createRequire(import.meta.url);

const {
  MIN_POLL_INTERVAL_MS,
  isOneShotMode,
  getPersistentWorkerConfig,
  runPersistentEmailQueueLoop,
} = require("../worker/email-queue-persistent-loop.js");

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

async function testOneShotModeDetection() {
  await withEnv({ EMAIL_QUEUE_WORKER_ONESHOT: "true" }, () => {
    assert(isOneShotMode(), "EMAIL_QUEUE_WORKER_ONESHOT=true should enable one-shot mode");
  });

  await withEnv({ EMAIL_QUEUE_WORKER_ONESHOT: "false" }, () => {
    assert(!isOneShotMode(), "EMAIL_QUEUE_WORKER_ONESHOT=false should disable one-shot mode");
  });

  await withEnv({ EMAIL_QUEUE_WORKER_ONESHOT: undefined }, () => {
    assert(!isOneShotMode(), "Missing EMAIL_QUEUE_WORKER_ONESHOT should default to persistent mode");
  });

  console.log("✓ one-shot mode detection");
}

async function testPersistentWorkerConfigDefaults() {
  await withEnv(
    {
      EMAIL_QUEUE_POLL_INTERVAL_MS: undefined,
      EMAIL_QUEUE_ERROR_DELAY_MS: undefined,
      EMAIL_QUEUE_IDLE_DELAY_MS: undefined,
    },
    () => {
      const config = getPersistentWorkerConfig();
      assert(config.pollIntervalMs === 2000, "Default poll interval should be 2000ms");
      assert(config.errorDelayMs === 5000, "Default error delay should be 5000ms");
      assert(config.idleDelayMs === 2000, "Default idle delay should be 2000ms");
    }
  );

  console.log("✓ persistent worker config defaults");
}

async function testMinimumPollInterval() {
  await withEnv({ EMAIL_QUEUE_POLL_INTERVAL_MS: "50" }, () => {
    const config = getPersistentWorkerConfig();
    assert(
      config.pollIntervalMs >= MIN_POLL_INTERVAL_MS,
      `Poll interval must be at least ${MIN_POLL_INTERVAL_MS}ms`
    );
    assert(config.pollIntervalMs === 1000, "Poll interval below minimum should clamp to 1000ms");
  });

  console.log("✓ minimum poll interval enforcement");
}

async function testMultipleCyclesWhenWorkExists() {
  let cycleCount = 0;
  const { sleep, sleeps } = createImmediateSleep();

  const result = await runPersistentEmailQueueLoop({
    sleep,
    config: { pollIntervalMs: 1000, errorDelayMs: 100, idleDelayMs: 50 },
    shouldStop: () => cycleCount >= 3,
    runCycle: async () => {
      cycleCount += 1;
      return {
        summary: {
          claimed: 1,
          sent: 1,
          retried: 0,
          failed: 0,
          skipped: 0,
        },
      };
    },
  });

  assert(cycleCount === 3, "Worker should run three cycles when work is available");
  assert(result.stopped, "Worker should stop cleanly");
  assert(sleeps.length === 0, "Busy cycles should not idle-sleep between batches");

  console.log("✓ multiple cycles when work exists");
}

async function testIdleWaitWhenQueueEmpty() {
  let cycleCount = 0;
  const { sleep, sleeps } = createImmediateSleep();

  await runPersistentEmailQueueLoop({
    sleep,
    config: { pollIntervalMs: 1000, errorDelayMs: 100, idleDelayMs: 2500 },
    shouldStop: () => cycleCount >= 2,
    runCycle: async () => {
      cycleCount += 1;
      return {
        summary: {
          claimed: 0,
          sent: 0,
          retried: 0,
          failed: 0,
          skipped: 0,
        },
      };
    },
  });

  assert(cycleCount === 2, "Worker should run two idle cycles");
  assert(sleeps.includes(2500), "Empty queue should trigger idle delay sleep");

  console.log("✓ idle wait when queue is empty");
}

async function testNoOverlappingCycles() {
  let activeCycles = 0;
  let maxActiveCycles = 0;
  let cycleCount = 0;
  const { sleep } = createImmediateSleep();

  await runPersistentEmailQueueLoop({
    sleep,
    config: { pollIntervalMs: 1000, errorDelayMs: 100, idleDelayMs: 50 },
    shouldStop: () => cycleCount >= 4,
    runCycle: async () => {
      activeCycles += 1;
      maxActiveCycles = Math.max(maxActiveCycles, activeCycles);
      cycleCount += 1;

      await new Promise((resolve) => setTimeout(resolve, 5));

      activeCycles -= 1;
      return {
        summary: {
          claimed: 1,
          sent: 1,
          retried: 0,
          failed: 0,
          skipped: 0,
        },
      };
    },
  });

  assert(maxActiveCycles === 1, "Only one cycle should run at a time inside the worker process");

  console.log("✓ no overlapping cycles");
}

async function testContinuesAfterTransientError() {
  let cycleCount = 0;
  const { sleep, sleeps } = createImmediateSleep();

  await runPersistentEmailQueueLoop({
    sleep,
    config: { pollIntervalMs: 1000, errorDelayMs: 3000, idleDelayMs: 50 },
    shouldStop: () => cycleCount >= 3,
    runCycle: async () => {
      cycleCount += 1;

      if (cycleCount === 1) {
        throw new Error("Transient Resend failure");
      }

      return {
        summary: {
          claimed: 1,
          sent: 1,
          retried: 0,
          failed: 0,
          skipped: 0,
        },
      };
    },
  });

  assert(cycleCount === 3, "Worker should continue after a transient cycle failure");
  assert(sleeps.includes(3000), "Transient failure should trigger error delay sleep");

  console.log("✓ continues after transient error");
}

async function testGracefulShutdown() {
  let cycleCount = 0;
  let stopRequested = false;
  const { sleep } = createImmediateSleep();

  const result = await runPersistentEmailQueueLoop({
    sleep,
    config: { pollIntervalMs: 1000, errorDelayMs: 100, idleDelayMs: 50 },
    shouldStop: () => stopRequested,
    runCycle: async () => {
      cycleCount += 1;

      if (cycleCount === 1) {
        stopRequested = true;
      }

      return {
        summary: {
          claimed: 0,
          sent: 0,
          retried: 0,
          failed: 0,
          skipped: 0,
        },
      };
    },
  });

  assert(cycleCount >= 1, "Worker should finish the in-flight cycle before stopping");
  assert(result.stopped, "Worker should report stopped=true after graceful shutdown");

  console.log("✓ graceful shutdown");
}

async function main() {
  await testOneShotModeDetection();
  await testPersistentWorkerConfigDefaults();
  await testMinimumPollInterval();
  await testMultipleCyclesWhenWorkExists();
  await testIdleWaitWhenQueueEmpty();
  await testNoOverlappingCycles();
  await testContinuesAfterTransientError();
  await testGracefulShutdown();

  console.log("\nAll persistent email queue worker tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
