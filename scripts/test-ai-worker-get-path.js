#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = process.cwd();
const indexSource = readFileSync(join(root, "worker/index.js"), "utf8");
const {
  getJob,
  jobRowToStatusPayload,
} = require("../worker/lib/instant-analysis-job-store");

function createMockSupabase(state) {
  return {
    rpc(name, args) {
      state.calls.push({ name, args });
      if (name === "get_instant_analysis_job") {
        if (state.error) {
          return Promise.resolve({ data: null, error: { message: state.error } });
        }
        const row = state.jobs.get(args.p_job_id);
        if (!row) return Promise.resolve({ data: { found: false }, error: null });
        return Promise.resolve({ data: { found: true, ...row }, error: null });
      }
      return Promise.resolve({ data: null, error: { message: `unknown rpc ${name}` } });
    },
  };
}

async function runGetJobHandler(supabase, jobId) {
  const job = await getJob(supabase, jobId);
  const payload = jobRowToStatusPayload(job);

  if (!payload) {
    return {
      status: 404,
      body: { success: false, error: "JOB_NOT_FOUND" },
    };
  }

  return {
    status: 200,
    body: { success: true, ...payload },
  };
}

test("worker/index.js binds getJob at module scope for GET handler", () => {
  const moduleRequire = indexSource.match(
    /const\s*\{[^}]*getJob[^}]*jobRowToStatusPayload[^}]*\}\s*=\s*require\("\.\/lib\/instant-analysis-job-store"\);/
  );
  assert.ok(moduleRequire, "expected module-scope instant-analysis-job-store import with getJob");

  const postHandlerStart = indexSource.indexOf('app.post(\n  "/api/instant-analysis"');
  const getHandlerStart = indexSource.indexOf('app.get(\n  "/api/instant-analysis/:jobId"');
  assert.ok(postHandlerStart > 0 && getHandlerStart > postHandlerStart);

  const postBlock = indexSource.slice(postHandlerStart, getHandlerStart);
  assert.doesNotMatch(
    postBlock,
    /require\("\.\/lib\/instant-analysis-job-store"\)/,
    "POST handler must not be the sole require site for job-store helpers"
  );

  const getBlock = indexSource.slice(getHandlerStart, getHandlerStart + 600);
  assert.match(getBlock, /await getJob\(supabase, jobId\)/);
  assert.match(getBlock, /jobRowToStatusPayload\(job\)/);
});

test("GET path returns completed job with result", async () => {
  const state = {
    calls: [],
    jobs: new Map([
      [
        "job_get_path_test",
        {
          job_id: "job_get_path_test",
          status: "completed",
          symbol: "BTC-USDT",
          analysis_result: { version: "2.0", trend: "bullish", summary: "ok" },
          completed_at: "2026-08-06T17:28:35.000Z",
        },
      ],
    ]),
  };
  const supabase = createMockSupabase(state);

  const response = await runGetJobHandler(supabase, "job_get_path_test");

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.status, "completed");
  assert.ok(response.body.result);
  assert.equal(state.calls[0].name, "get_instant_analysis_job");
});

test("GET path returns 404 when job not found", async () => {
  const supabase = createMockSupabase({ calls: [], jobs: new Map() });
  const response = await runGetJobHandler(supabase, "job_missing_test");
  assert.equal(response.status, 404);
  assert.equal(response.body.error, "JOB_NOT_FOUND");
});

test("GET path surfaces DB errors without ReferenceError", async () => {
  const supabase = createMockSupabase({
    calls: [],
    jobs: new Map(),
    error: "db unavailable",
  });

  await assert.rejects(
    async () => {
      const job = await getJob(supabase, "job_db_error_test");
      if (job?.error) {
        throw new Error(job.error);
      }
    },
    /db unavailable/
  );
});

console.log("test-ai-worker-get-path: all tests registered");
