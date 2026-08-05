#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const telemetry = require("../worker/lib/price-alert-worker-cycle-telemetry.js");

function createMockSupabase({ fail = false } = {}) {
  return () => ({
    from(table) {
      assert.equal(table, "price_alert_worker_runs");
      return {
        insert: async () => ({ error: fail ? { message: "relation missing" } : null }),
      };
    },
  });
}

(async () => {
  const row = telemetry.buildCycleTelemetryRow({
    runId: "par-test",
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    durationMs: 10,
    status: "success",
    stats: { alertsFetched: 1 },
    lock: { acquired: true },
  });
  assert.equal(row.run_id, "par-test");

  const ok = await telemetry.persistCycleTelemetry(createMockSupabase(), row);
  assert.equal(ok.ok, true);

  const fail = await telemetry.persistCycleTelemetry(createMockSupabase({ fail: true }), row);
  assert.equal(fail.ok, false);

  console.log("price alert telemetry PASS");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
