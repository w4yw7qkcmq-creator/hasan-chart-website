#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { resetMetricsForTests, recordCycleStart, recordCycleSuccess, getMetricsSnapshot } = require("../worker/lib/news-worker-metrics.js");

resetMetricsForTests();
recordCycleStart();
recordCycleSuccess({ cycleDurationMs: 100, fetched: 3, aiProcessed: 1, dbInserted: 1, telegramPublished: 1 });
const metrics = getMetricsSnapshot();
assert.equal(metrics.cyclesTotal, 1);
assert.equal(metrics.aiCalls, 1);
assert.equal(metrics.publishedSite, 1);

console.log("news worker ai budget metrics PASS");
