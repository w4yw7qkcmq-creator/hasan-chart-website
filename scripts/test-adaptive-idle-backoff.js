#!/usr/bin/env node

import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  AdaptiveIdleBackoff,
  resolveAdaptiveIdleBounds,
} = require("../worker/lib/adaptive-idle-backoff.js");

function testBoundedGrowthAndReset() {
  const backoff = new AdaptiveIdleBackoff({ minMs: 2000, maxMs: 30000, multiplier: 2 });

  const first = backoff.recordEmpty();
  assert.equal(first.sleepMs, 2000);
  assert.equal(first.consecutiveEmptyCycles, 1);
  assert.equal(first.nextDelayMs, 4000);

  const second = backoff.recordEmpty();
  assert.equal(second.sleepMs, 4000);

  const third = backoff.recordEmpty();
  assert.equal(third.sleepMs, 8000);

  const atMax = backoff.recordEmpty();
  assert.equal(atMax.sleepMs, 16000);

  const capped = backoff.recordEmpty();
  assert.equal(capped.sleepMs, 30000);
  assert.equal(capped.nextDelayMs, 30000);

  const reset = backoff.recordWork();
  assert.equal(reset.sleepMs, 0);
  assert.equal(reset.reset, true);
  assert.equal(backoff.snapshot().currentDelayMs, 2000);
  assert.equal(backoff.snapshot().consecutiveEmptyCycles, 0);

  const afterWorkEmpty = backoff.recordEmpty();
  assert.equal(afterWorkEmpty.sleepMs, 2000);
  assert.equal(afterWorkEmpty.consecutiveEmptyCycles, 1);

  console.log("✓ bounded growth and reset on work");
}

function testResolveBoundsLegacyFallback() {
  const bounds = resolveAdaptiveIdleBounds(
    {
      EMAIL_QUEUE_IDLE_DELAY_MS: "2500",
      EMAIL_QUEUE_IDLE_MAX_DELAY_MS: "20000",
    },
    {
      minKey: "EMAIL_QUEUE_IDLE_MIN_DELAY_MS",
      maxKey: "EMAIL_QUEUE_IDLE_MAX_DELAY_MS",
      legacyMinKey: "EMAIL_QUEUE_IDLE_DELAY_MS",
      defaultMinMs: 2000,
      defaultMaxMs: 30000,
    }
  );

  assert.equal(bounds.minMs, 2500);
  assert.equal(bounds.maxMs, 20000);

  console.log("✓ resolve bounds with legacy min key");
}

function main() {
  testBoundedGrowthAndReset();
  testResolveBoundsLegacyFallback();
  console.log("\nAll adaptive idle backoff tests passed.");
}

main();
