#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const scheduler = require("../worker/lib/price-alert-scheduler.js");

scheduler.resetSchedulerForTests();
const runs = [];

const result = scheduler.startPriceAlertScheduler({
  intervalMs: 30_000,
  enabled: true,
  runCycle: async ({ triggerSource }) => {
    runs.push({ triggerSource, at: Date.now() });
  },
});

assert.equal(result.started, true);
assert.equal(result.intervalMs, 30_000);

await new Promise((r) => setTimeout(r, 20));
assert.equal(runs.length, 1);
assert.equal(runs[0].triggerSource, "startup");

const second = scheduler.startPriceAlertScheduler({
  intervalMs: 30_000,
  enabled: true,
  runCycle: async () => {},
});
assert.equal(second.started, false);
assert.equal(second.reason, "already_started");

scheduler.resetSchedulerForTests();
console.log("price alert cycle cadence PASS");
