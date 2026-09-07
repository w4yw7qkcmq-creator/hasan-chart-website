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

const baseMigrationSql = readFileSync(
  resolve(ROOT, "supabase/migrations/20260902_balanced_retention_cleanup.sql"),
  "utf8"
);
const decisionMigrationSql = readFileSync(
  resolve(ROOT, "supabase/migrations/20260908_news_decision_records_retention.sql"),
  "utf8"
);

assert.match(baseMigrationSql, /cleanup_market_flow_buckets/);
assert.match(baseMigrationSql, /cleanup_market_large_trades/);
assert.match(baseMigrationSql, /cleanup_market_liquidity_walls/);
assert.match(baseMigrationSql, /cleanup_news_system_metric_snapshots/);
assert.match(baseMigrationSql, /run_balanced_retention_cleanup/);

assert.match(
  baseMigrationSql,
  /window_key = 'public_chart_quota'\s*\n\s*AND bucket_start = TIMESTAMPTZ '1970-01-01 00:00:00\+00'/
);

assert.match(decisionMigrationSql, /CREATE OR REPLACE FUNCTION public\.cleanup_news_decision_records/);
assert.match(decisionMigrationSql, /p_retention_days integer DEFAULT 30/);
assert.match(decisionMigrationSql, /GREATEST\(7, LEAST\(COALESCE\(p_retention_days, 30\), 365\)\)/);
assert.match(decisionMigrationSql, /WHERE decision_at < v_cutoff/);
assert.match(decisionMigrationSql, /'table', 'news_decision_records'/);
assert.match(decisionMigrationSql, /cleanup_news_decision_records\(v_decision_days\)/);
assert.match(decisionMigrationSql, /v_decision_days integer := 30/);
assert.match(decisionMigrationSql, /'decisionRetentionDays', v_decision_days/);

assert.doesNotMatch(decisionMigrationSql, /DROP TABLE/i);
assert.doesNotMatch(decisionMigrationSql, /TRUNCATE/i);
assert.doesNotMatch(decisionMigrationSql, /VACUUM/i);

assert.match(
  decisionMigrationSql,
  /cleanup_market_flow_buckets\(v_market_days\)[\s\S]*cleanup_news_worker_cycle_runs\(v_worker_days\)[\s\S]*cleanup_news_decision_records\(v_decision_days\)/
);

assert.match(
  decisionMigrationSql,
  /v_market_days integer := GREATEST\(1, LEAST\(COALESCE\(p_market_retention_days, 7\), 90\)\)/
);
assert.match(
  decisionMigrationSql,
  /v_snapshot_days integer := GREATEST\(1, LEAST\(COALESCE\(p_snapshot_retention_days, 7\), 90\)\)/
);
assert.match(
  decisionMigrationSql,
  /v_worker_days integer := GREATEST\(7, LEAST\(COALESCE\(p_worker_retention_days, 14\), 365\)\)/
);

assert.match(
  decisionMigrationSql,
  /run_balanced_retention_cleanup\(\s*\n\s*p_market_retention_days integer DEFAULT 7,\s*\n\s*p_snapshot_retention_days integer DEFAULT 7,\s*\n\s*p_worker_retention_days integer DEFAULT 14\s*\n\s*\)/
);

assert.match(decisionMigrationSql, /REVOKE ALL ON FUNCTION public\.run_balanced_retention_cleanup/);
assert.match(decisionMigrationSql, /GRANT EXECUTE ON FUNCTION public\.run_balanced_retention_cleanup.*service_role/s);
assert.match(decisionMigrationSql, /GRANT EXECUTE ON FUNCTION public\.cleanup_news_decision_records.*service_role/s);

const schemaSql = readFileSync(
  resolve(ROOT, "supabase/migrations/20260809_news_intelligence_phase3.sql"),
  "utf8"
);
assert.match(schemaSql, /news_decision_records_decision_at_idx/);

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
