#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const lock = require("../worker/lib/news-worker-distributed-lock.js");

function createMockSupabase(sequence) {
  let call = 0;
  return {
    rpc(name, args) {
      const step = sequence[call++];
      if (step?.throw) {
        return Promise.reject(new Error(step.throw));
      }
      assert.equal(name, step.name);
      if (step.args) {
        assert.deepEqual(args, step.args);
      }
      return Promise.resolve({ data: step.data, error: step.error || null });
    },
  };
}

(async () => {
  lock.resetDistributedLockMetricsForTests();

  const firstClient = createMockSupabase([
    {
      name: "try_acquire_news_worker_cycle_lock",
      data: { acquired: true, owner: "worker-a", expiresAt: "2099-01-01T00:00:00.000Z" },
    },
    {
      name: "release_news_worker_cycle_lock",
      args: { p_owner_id: "worker-a", p_lock_name: "news_worker_cycle" },
      data: { released: true },
    },
  ]);

  const acquired = await lock.acquireDistributedCycleLock(() => firstClient, { ownerId: "worker-a" });
  assert.equal(acquired.acquired, true);
  assert.equal(acquired.distributed, true);

  const released = await lock.releaseDistributedCycleLock(() => firstClient, "worker-a");
  assert.equal(released.released, true);

  lock.resetDistributedLockMetricsForTests();
  const contendedClient = createMockSupabase([
    {
      name: "try_acquire_news_worker_cycle_lock",
      data: { acquired: false, reason: "contended", owner: "worker-b" },
    },
    {
      name: "try_acquire_news_worker_cycle_lock",
      data: { acquired: true, owner: "worker-a", recovered: true },
    },
  ]);

  const blocked = await lock.acquireDistributedCycleLock(() => contendedClient, { ownerId: "worker-a" });
  assert.equal(blocked.acquired, false);
  assert.equal(blocked.reason, "contended");

  const recovered = await lock.acquireDistributedCycleLock(() => contendedClient, { ownerId: "worker-a" });
  assert.equal(recovered.acquired, true);
  assert.equal(recovered.recovered, true);

  const metrics = lock.getDistributedLockMetrics();
  assert.equal(metrics.distributedLockAcquired, 1);
  assert.equal(metrics.distributedLockContended, 1);
  assert.equal(metrics.distributedLockExpiredRecovered, 1);

  const wrongReleaseClient = createMockSupabase([
    {
      name: "release_news_worker_cycle_lock",
      args: { p_owner_id: "worker-wrong", p_lock_name: "news_worker_cycle" },
      data: { released: false },
    },
  ]);
  const wrongRelease = await lock.releaseDistributedCycleLock(() => wrongReleaseClient, "worker-wrong", "news_worker_cycle");
  assert.equal(wrongRelease.released, false);

  console.log("news worker distributed lock PASS");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
