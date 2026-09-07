#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const telemetry = require("../worker/lib/news-worker-cycle-telemetry.js");

const {
  buildCycleTelemetryRow,
  shouldPersistCycleTelemetry,
  persistCycleTelemetry,
  resetTelemetryForTests,
  setHealthyTelemetryPersistClockForTests,
  HEALTHY_TELEMETRY_PERSIST_INTERVAL_MS,
} = telemetry;

function isoNow() {
  return new Date().toISOString();
}

function healthyRow(overrides = {}) {
  return buildCycleTelemetryRow({
    runId: overrides.runId || `nwr-test-${Date.now()}`,
    startedAt: isoNow(),
    completedAt: isoNow(),
    stats: {
      fetched: 10,
      eligible: 0,
      cycleDurationMs: 1000,
      ...(overrides.stats || {}),
    },
    status: overrides.status || "success",
    lock: overrides.lock || { acquired: true, contended: false },
    buildCommit: "abc1234",
  });
}

function createMockSupabase({ fail = false } = {}) {
  let insertCount = 0;
  const client = () => ({
    from(table) {
      assert.equal(table, "news_worker_cycle_runs");
      return {
        insert() {
          insertCount += 1;
          return Promise.resolve({ error: fail ? { message: "table_missing" } : null });
        },
      };
    },
  });
  client.insertCount = () => insertCount;
  return client;
}

resetTelemetryForTests();

const baseRow = healthyRow();
assert.equal(baseRow.fetched_count, 10);
assert.equal(baseRow.lock_acquired, true);
assert.equal(baseRow.error_code_safe, null);

assert.equal(shouldPersistCycleTelemetry(healthyRow(), {}), true, "first healthy success persists");
assert.equal(shouldPersistCycleTelemetry(healthyRow(), {}), false, "second healthy success throttled");
assert.equal(shouldPersistCycleTelemetry({ ...healthyRow(), status: "failed" }, {}), true, "failed always persists");
assert.equal(shouldPersistCycleTelemetry({ ...healthyRow(), status: "overlap" }, {}), true, "overlap always persists");
assert.equal(shouldPersistCycleTelemetry({ ...healthyRow(), status: "skipped" }, {}), true, "skipped always persists");
assert.equal(
  shouldPersistCycleTelemetry({ ...healthyRow(), error_code_safe: "cycle_failed" }, {}),
  true,
  "error_code_safe always persists"
);
assert.equal(
  shouldPersistCycleTelemetry({ ...healthyRow(), lock_contended: true }, {}),
  true,
  "lock_contended always persists"
);
assert.equal(
  shouldPersistCycleTelemetry({ ...healthyRow(), site_published_count: 1 }, {}),
  true,
  "site publish always persists"
);
assert.equal(
  shouldPersistCycleTelemetry({ ...healthyRow(), telegram_published_count: 1 }, {}),
  true,
  "telegram publish always persists"
);
assert.equal(
  shouldPersistCycleTelemetry({ ...healthyRow(), ai_calls: 1 }, {}),
  true,
  "ai_calls always persists"
);
assert.equal(
  shouldPersistCycleTelemetry({ ...healthyRow(), image_failures: 1 }, {}),
  true,
  "image_failures always persists"
);
assert.equal(shouldPersistCycleTelemetry(healthyRow(), { aiFailed: 1 }), true, "aiFailed always persists");
assert.equal(shouldPersistCycleTelemetry(healthyRow(), { dbFailed: 1 }), true, "dbFailed always persists");
assert.equal(
  shouldPersistCycleTelemetry(healthyRow(), { telegramFailed: 1 }),
  true,
  "telegramFailed always persists"
);
assert.equal(
  shouldPersistCycleTelemetry(healthyRow(), { economicEventsPublished: 1 }),
  true,
  "economicEventsPublished always persists"
);
assert.equal(
  shouldPersistCycleTelemetry(healthyRow(), { economicEventsDroppedIncomplete: 1 }),
  true,
  "economicEventsDroppedIncomplete always persists"
);

resetTelemetryForTests();
assert.equal(shouldPersistCycleTelemetry({ ...healthyRow(), fetched_count: 99 }, {}), true, "boot healthy persists");
assert.equal(shouldPersistCycleTelemetry({ ...healthyRow(), fetched_count: 99 }, {}), false, "fetched alone throttled");

resetTelemetryForTests();
assert.equal(shouldPersistCycleTelemetry(healthyRow(), {}), true);
setHealthyTelemetryPersistClockForTests(Date.now() - HEALTHY_TELEMETRY_PERSIST_INTERVAL_MS - 1);
assert.equal(shouldPersistCycleTelemetry(healthyRow(), {}), true, "healthy after 5min persists");

(async () => {
  resetTelemetryForTests();
  const mock = createMockSupabase();
  const row = healthyRow({ runId: "nwr-persist-1" });

  const first = await persistCycleTelemetry(mock, row, { stats: {} });
  assert.equal(first.persisted, true);
  assert.equal(first.skipped, undefined);

  const second = await persistCycleTelemetry(mock, healthyRow({ runId: "nwr-persist-2" }), { stats: {} });
  assert.equal(second.persisted, false);
  assert.equal(second.skipped, true);
  assert.equal(second.reason, "healthy_throttled");

  const publish = await persistCycleTelemetry(
    mock,
    healthyRow({ runId: "nwr-persist-3", stats: { dbInserted: 1 } }),
    { stats: { dbInserted: 1 } }
  );
  assert.equal(publish.persisted, true);

  assert.equal(mock.insertCount(), 2);

  const isolated = await persistCycleTelemetry(createMockSupabase({ fail: true }), healthyRow({ runId: "nwr-fail" }), {
    stats: {},
  });
  assert.equal(isolated.persisted, false);

  console.log("news worker telemetry throttle PASS");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
