#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { persistWorkerRun } = require("../worker/lib/instant-analysis-job-store");

test("telemetry insert failure does not throw", async () => {
  const supabase = {
    from() {
      return {
        insert() {
          return Promise.resolve({ error: { message: "insert failed" } });
        },
      };
    },
  };
  const result = await persistWorkerRun(supabase, {
    run_id: "00000000-0000-4000-8000-000000000001",
    job_id: "job_telemetry_1",
    status: "completed",
    ai_calls: 1,
  });
  assert.equal(result.ok, false);
});

test("telemetry row excludes sensitive fields", () => {
  const row = {
    job_id: "job_telemetry_2",
    worker_instance: "worker-1",
    status: "failed",
    error_code_safe: "OPENAI_TIMEOUT",
    ai_calls: 1,
  };
  assert.equal(row.user_email, undefined);
  assert.equal(row.prompt, undefined);
  assert.equal(row.analysis_result, undefined);
});

console.log("test-ai-worker-telemetry: all tests registered");
