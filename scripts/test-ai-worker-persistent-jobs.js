#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  createJob,
  claimJob,
  completeJob,
  failJob,
  getJob,
  jobRowToStatusPayload,
  resetRecoveryMetricsForTests,
} = require("../worker/lib/instant-analysis-job-store");

function createMockSupabase(state) {
  return {
    rpc(name, args) {
      state.calls.push({ name, args });
      if (name === "create_instant_analysis_job") {
        if (!state.jobs.has(args.p_job_id)) {
          state.jobs.set(args.p_job_id, {
            job_id: args.p_job_id,
            status: "queued",
            symbol: args.p_symbol,
          });
          return Promise.resolve({ data: { ok: true, job_id: args.p_job_id, existing: false }, error: null });
        }
        return Promise.resolve({ data: { ok: true, job_id: args.p_job_id, existing: true }, error: null });
      }
      if (name === "get_instant_analysis_job") {
        const row = state.jobs.get(args.p_job_id);
        if (!row) return Promise.resolve({ data: { found: false }, error: null });
        return Promise.resolve({ data: { found: true, ...row }, error: null });
      }
      if (name === "claim_instant_analysis_job") {
        return Promise.resolve({
          data: state.claimHandler ? state.claimHandler(args) : { claimed: true },
          error: null,
        });
      }
      if (name === "complete_instant_analysis_job") {
        const row = state.jobs.get(args.p_job_id);
        if (!row || row.claimed_by !== args.p_owner_id) {
          return Promise.resolve({ data: { ok: false, code: "WRONG_OWNER_OR_TERMINAL" }, error: null });
        }
        state.jobs.set(args.p_job_id, {
          ...row,
          status: "completed",
          analysis_result: args.p_result,
          result_version: args.p_result_version,
        });
        return Promise.resolve({ data: { ok: true }, error: null });
      }
      if (name === "fail_instant_analysis_job") {
        return Promise.resolve({ data: { ok: true }, error: null });
      }
      return Promise.resolve({ data: null, error: { message: `unknown rpc ${name}` } });
    },
    from() {
      return {
        insert() {
          return Promise.resolve({ error: null });
        },
      };
    },
  };
}

test("createJob persists queued job idempotently", async () => {
  const state = { jobs: new Map(), calls: [] };
  const supabase = createMockSupabase(state);
  const first = await createJob(supabase, { jobId: "job_1_test_ab", symbol: "BTCUSDT" });
  const second = await createJob(supabase, { jobId: "job_1_test_ab", symbol: "BTCUSDT" });
  assert.equal(first.ok, true);
  assert.equal(first.existing, false);
  assert.equal(second.existing, true);
});

test("jobRowToStatusPayload maps completed result", () => {
  const payload = jobRowToStatusPayload({
    found: true,
    job_id: "job_1",
    status: "completed",
    symbol: "BTCUSDT",
    analysis_result: { version: "2.0", summary: "ok" },
    completed_at: "2026-08-05T00:00:00.000Z",
  });
  assert.equal(payload.status, "completed");
  assert.ok(payload.result);
});

test("getJob reads DB not memory", async () => {
  resetRecoveryMetricsForTests();
  const state = {
    jobs: new Map([["job_2_test_cd", { job_id: "job_2_test_cd", status: "queued", symbol: "ETHUSDT" }]]),
    calls: [],
  };
  const supabase = createMockSupabase(state);
  const job = await getJob(supabase, "job_2_test_cd");
  assert.equal(job.found, true);
  assert.equal(job.status, "queued");
});

test("completeJob rejects wrong owner", async () => {
  const state = {
    jobs: new Map([
      ["job_3_test_ef", { job_id: "job_3_test_ef", status: "processing", claimed_by: "owner-a", symbol: "BTCUSDT" }],
    ]),
    calls: [],
  };
  const supabase = createMockSupabase(state);
  const result = await completeJob(supabase, "job_3_test_ef", "owner-b", { ok: true });
  assert.equal(result.ok, false);
});

console.log("test-ai-worker-persistent-jobs: all tests registered");
