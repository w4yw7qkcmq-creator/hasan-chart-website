#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  recoverStaleJobs,
  resetRecoveryMetricsForTests,
  getRecoveryMetrics,
} = require("../worker/lib/instant-analysis-job-store");

test("recoverStaleJobs records recovery metrics", async () => {
  resetRecoveryMetricsForTests();
  const supabase = {
    rpc(name) {
      assert.equal(name, "recover_stale_instant_analysis_jobs");
      return Promise.resolve({ data: { requeued: 2, timed_out: 1 }, error: null });
    },
  };
  const result = await recoverStaleJobs(supabase);
  assert.equal(result.ok, true);
  assert.equal(result.requeued, 2);
  const metrics = getRecoveryMetrics();
  assert.equal(metrics.staleClaimsRecovered, 3);
  assert.equal(metrics.jobsRecoveredAfterRestart, 2);
});

console.log("test-ai-worker-restart-recovery: all tests registered");
