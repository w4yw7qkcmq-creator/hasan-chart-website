#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { claimJob, resetRecoveryMetricsForTests, getRecoveryMetrics } = require("../worker/lib/instant-analysis-job-store");

function createClaimMock(initial) {
  let row = { ...initial };
  return {
    rpc(name, args) {
      if (name !== "claim_instant_analysis_job") {
        return Promise.resolve({ data: null, error: { message: "unexpected" } });
      }
      if (row.claimed_by && row.claim_expires_at > Date.now() && row.claimed_by !== args.p_owner_id) {
        return Promise.resolve({ data: { claimed: false, reason: "contended" }, error: null });
      }
      row = {
        ...row,
        claimed_by: args.p_owner_id,
        claim_expires_at: Date.now() + 120_000,
        status: "claimed",
      };
      return Promise.resolve({ data: { claimed: true, job_id: args.p_job_id }, error: null });
    },
  };
}

test("only one worker wins concurrent claim", async () => {
  resetRecoveryMetricsForTests();
  const supabase = createClaimMock({ job_id: "job_claim_1", status: "queued" });
  const [a, b] = await Promise.all([
    claimJob(supabase, "job_claim_1", "worker-a"),
    claimJob(supabase, "job_claim_1", "worker-b"),
  ]);
  const winners = [a, b].filter((x) => x.claimed);
  assert.equal(winners.length, 1);
});

test("contended claim increments duplicateClaimsRejected metric", async () => {
  resetRecoveryMetricsForTests();
  const supabase = {
    rpc(name, args) {
      if (name === "claim_instant_analysis_job" && args.p_owner_id === "worker-b") {
        return Promise.resolve({ data: { claimed: false, reason: "contended" }, error: null });
      }
      return Promise.resolve({ data: { claimed: true }, error: null });
    },
  };
  await claimJob(supabase, "job_x", "worker-a");
  await claimJob(supabase, "job_x", "worker-b");
  assert.equal(getRecoveryMetrics().duplicateClaimsRejected, 1);
});

console.log("test-ai-worker-atomic-claim: all tests registered");
