#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  PRICE_ALERT_WORKER_STATUS,
  getPriceAlertWorkerStatusFromDb,
  resolveStaleThresholdMs,
} from "../lib/price-alert-worker-status/read-model.js";

function createQueryBuilder(result) {
  const builder = {
    select() {
      return builder;
    },
    order() {
      return builder;
    },
    limit() {
      return builder;
    },
    then(resolve, reject) {
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return builder;
}

function createMockSupabase(rows = [], error = null) {
  return {
    from(table) {
      assert.equal(table, "price_alert_worker_runs");
      return createQueryBuilder({ data: rows, error });
    },
  };
}

const nowMs = Date.now();

const freshRun = {
  run_id: "par-1",
  worker_instance: "worker-a",
  started_at: new Date(nowMs - 20_000).toISOString(),
  completed_at: new Date(nowMs - 15_000).toISOString(),
  duration_ms: 5000,
  status: "success",
  alerts_fetched: 1,
  alerts_evaluated: 1,
  alerts_triggered: 0,
  alerts_completed: 0,
  site_sent: 0,
  push_sent: 0,
  push_failed: 0,
  email_queued: 0,
  email_failed: 0,
  stale_prices: 0,
  error_code_safe: null,
  build_commit: "abc1234",
};

async function main() {
  assert.equal(resolveStaleThresholdMs(30_000), 420_000);

  const healthy = await getPriceAlertWorkerStatusFromDb(createMockSupabase([freshRun]), {
    expectedCycleMs: 30_000,
  });
  assert.equal(healthy.workerStatus, PRICE_ALERT_WORKER_STATUS.HEALTHY);
  assert.equal(healthy.lastCycleCompletedAt, freshRun.completed_at);

  const staleRun = {
    ...freshRun,
    run_id: "par-2",
    completed_at: new Date(nowMs - 8 * 60_000).toISOString(),
  };
  const stale = await getPriceAlertWorkerStatusFromDb(createMockSupabase([staleRun]), {
    expectedCycleMs: 30_000,
    nowMs: nowMs + 8 * 60_000,
  });
  assert.equal(stale.workerStatus, PRICE_ALERT_WORKER_STATUS.STALE);

  const failedThenSuccess = [
    { ...freshRun, run_id: "par-3", status: "failed", error_code_safe: "MARKET_DATA" },
    { ...freshRun, run_id: "par-4", status: "success" },
  ];
  const consecutive = await getPriceAlertWorkerStatusFromDb(createMockSupabase(failedThenSuccess));
  assert.equal(consecutive.consecutiveFailures, 1);

  const missing = await getPriceAlertWorkerStatusFromDb(
    createMockSupabase([], { message: 'relation "price_alert_worker_runs" does not exist' })
  );
  assert.equal(missing.workerStatus, PRICE_ALERT_WORKER_STATUS.UNKNOWN);
  assert.equal(missing.reason, "telemetry_table_missing");

  console.log("price alert worker status read-model PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
