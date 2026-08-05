#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const lock = require("../worker/lib/price-alert-distributed-lock.js");

function createMockSupabase(sequence) {
  let call = 0;
  return {
    rpc(name, args) {
      const step = sequence[call++];
      assert.equal(name, step.name);
      if (step.args) assert.deepEqual(args, step.args);
      return Promise.resolve({ data: step.data, error: step.error || null });
    },
  };
}

(async () => {
  lock.resetDistributedLockMetricsForTests();

  const client = createMockSupabase([
    {
      name: "try_acquire_news_worker_cycle_lock",
      data: { acquired: true, owner: "pa-a", expiresAt: "2099-01-01T00:00:00.000Z" },
    },
    {
      name: "release_news_worker_cycle_lock",
      args: { p_owner_id: "pa-a", p_lock_name: "price_alert_worker_cycle" },
      data: { released: true },
    },
  ]);

  const acquired = await lock.acquireDistributedCycleLock(() => client, { ownerId: "pa-a" });
  assert.equal(acquired.acquired, true);
  const released = await lock.releaseDistributedCycleLock(() => client, "pa-a");
  assert.equal(released.released, true);

  lock.resetDistributedLockMetricsForTests();
  const contended = createMockSupabase([
    {
      name: "try_acquire_news_worker_cycle_lock",
      data: { acquired: false, reason: "contended", owner: "pa-b" },
    },
    {
      name: "release_news_worker_cycle_lock",
      args: { p_owner_id: "pa-wrong", p_lock_name: "price_alert_worker_cycle" },
      data: { released: false },
    },
  ]);

  const blocked = await lock.acquireDistributedCycleLock(() => contended, { ownerId: "pa-a" });
  assert.equal(blocked.acquired, false);
  const wrongRelease = await lock.releaseDistributedCycleLock(() => contended, "pa-wrong");
  assert.equal(wrongRelease.released, false);

  console.log("price alert distributed lock PASS");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
