#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  buildCycleTelemetryRow,
  persistCycleTelemetry,
  resetTelemetryForTests,
} = require("../worker/lib/news-worker-cycle-telemetry.js");

resetTelemetryForTests();

const row = buildCycleTelemetryRow({
  runId: "nwr-test-1",
  startedAt: new Date().toISOString(),
  completedAt: new Date().toISOString(),
  stats: { fetched: 10, eligible: 1, dbInserted: 0, telegramPublished: 0, cycleDurationMs: 1000 },
  status: "success",
  lock: { acquired: true, contended: false },
  buildCommit: "abc1234",
});

assert.equal(row.run_id, "nwr-test-1");
assert.equal(row.fetched_count, 10);
assert.equal(row.lock_acquired, true);
assert.equal(row.error_code_safe, null);

(async () => {
  const isolated = await persistCycleTelemetry(() => ({
    from() {
      return {
        insert() {
          return Promise.resolve({ error: { message: "table_missing" } });
        },
      };
    },
  }), row);

  assert.equal(isolated.persisted, false);
  console.log("news worker telemetry persistence isolation PASS");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
