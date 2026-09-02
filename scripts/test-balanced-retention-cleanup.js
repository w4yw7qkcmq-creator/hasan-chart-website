#!/usr/bin/env node
/**
 * Regression tests for balanced retention policy (static + telemetry throttling).
 * Does not connect to production DB.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();

const migrationSql = readFileSync(
  resolve(ROOT, "supabase/migrations/20260902_balanced_retention_cleanup.sql"),
  "utf8"
);

assert.match(migrationSql, /cleanup_market_flow_buckets/);
assert.match(migrationSql, /cleanup_market_large_trades/);
assert.match(migrationSql, /cleanup_market_liquidity_walls/);
assert.match(migrationSql, /cleanup_news_system_metric_snapshots/);
assert.match(migrationSql, /run_balanced_retention_cleanup/);

assert.match(
  migrationSql,
  /window_key = 'public_chart_quota'\s*\n\s*AND bucket_start = TIMESTAMPTZ '1970-01-01 00:00:00\+00'/
);
assert.match(migrationSql, /REVOKE ALL ON FUNCTION public\.run_balanced_retention_cleanup/);
assert.match(migrationSql, /GRANT EXECUTE ON FUNCTION public\.run_balanced_retention_cleanup.*service_role/s);

const telemetry = require("../worker/lib/price-alert-worker-cycle-telemetry.js");
const newsTelemetry = readFileSync(
  resolve(ROOT, "worker/lib/news-intelligence/autonomy/worker-telemetry-persistence.js"),
  "utf8"
);

assert.match(newsTelemetry, /HEARTBEAT_BUCKET_MS = 5 \* 60_000/);

const healthyRow = telemetry.buildCycleTelemetryRow({
  runId: "par-throttle-test",
  startedAt: new Date().toISOString(),
  completedAt: new Date().toISOString(),
  durationMs: 10,
  status: "success",
  stats: {},
  lock: { acquired: true },
});

assert.equal(telemetry.shouldPersistCycleTelemetry(healthyRow), true, "first healthy row persists");
assert.equal(telemetry.shouldPersistCycleTelemetry(healthyRow), false, "second healthy row throttled");

const failedRow = { ...healthyRow, status: "failed" };
assert.equal(telemetry.shouldPersistCycleTelemetry(failedRow), true, "failed always persists");

const triggeredRow = { ...healthyRow, alerts_triggered: 1 };
assert.equal(telemetry.shouldPersistCycleTelemetry(triggeredRow), true, "triggered always persists");

console.log("balanced retention cleanup policy PASS");
