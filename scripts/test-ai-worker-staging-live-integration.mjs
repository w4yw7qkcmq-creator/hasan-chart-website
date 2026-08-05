#!/usr/bin/env node
/**
 * Staging live integration matrix for AI Worker persistence.
 * Requires STAGING_SUPABASE_URL + STAGING_SUPABASE_SERVICE_ROLE_KEY.
 */
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");

const url = process.env.STAGING_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.log("SKIP staging live integration: missing Supabase credentials");
  process.exit(0);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
const prefix = `job_${Date.now()}_stg`;
let passed = 0;

function ok(name) {
  passed += 1;
  console.log(`✓ ${name}`);
}

async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data;
}

async function cleanup(jobId) {
  await supabase.from("instant_analysis_worker_runs").delete().eq("job_id", jobId);
  await supabase.from("instant_analysis_jobs").delete().eq("job_id", jobId);
}

async function run() {
  const jobId = `${prefix}_live`;
  await cleanup(jobId);

  const created = await rpc("create_instant_analysis_job", {
    p_job_id: jobId,
    p_symbol: "BTCUSDT",
    p_execution_timeframe: "15m",
  });
  if (!created.ok) throw new Error("create failed");
  ok("1 valid job queued in DB");

  const claimA = await rpc("claim_instant_analysis_job", {
    p_job_id: jobId,
    p_owner_id: "worker-a",
    p_claim_ttl_seconds: 120,
  });
  const claimB = await rpc("claim_instant_analysis_job", {
    p_job_id: jobId,
    p_owner_id: "worker-b",
    p_claim_ttl_seconds: 120,
  });
  if (!claimA.claimed || claimB.claimed) throw new Error("dual claim matrix failed");
  ok("5 two workers same job -> one winner");

  await rpc("extend_instant_analysis_job_claim", {
    p_job_id: jobId,
    p_owner_id: "worker-a",
    p_claim_ttl_seconds: 120,
  });
  ok("claim extend / heartbeat");

  const safeResult = { version: "2.0", symbol: "BTCUSDT", summary: "staging fixture", sections: [] };
  const complete = await rpc("complete_instant_analysis_job", {
    p_job_id: jobId,
    p_owner_id: "worker-a",
    p_result: safeResult,
    p_result_version: "2.0",
  });
  if (!complete.ok) throw new Error("complete failed");
  ok("1 valid job completes with persisted result");

  const fetched = await rpc("get_instant_analysis_job", { p_job_id: jobId });
  if (fetched.status !== "completed" || !fetched.analysis_result) {
    throw new Error("completed result not readable after persistence");
  }
  ok("14 completed result survives restart semantics (DB read)");

  const wrongOwner = await rpc("complete_instant_analysis_job", {
    p_job_id: jobId,
    p_owner_id: "worker-evil",
    p_result: safeResult,
  });
  if (wrongOwner.ok) throw new Error("wrong owner should fail");
  ok("7 wrong-owner completion rejected");

  await supabase.from("instant_analysis_worker_runs").insert({
    job_id: jobId,
    status: "completed",
    ai_calls: 1,
    auth_mode: "machine",
  });
  const { count } = await supabase
    .from("instant_analysis_worker_runs")
    .select("*", { count: "exact", head: true })
    .eq("job_id", jobId);
  if (!count) throw new Error("telemetry missing");
  ok("16 telemetry persists");

  const recovery = await rpc("recover_stale_instant_analysis_jobs", { p_claim_ttl_seconds: 1 });
  if (typeof recovery.requeued !== "number") throw new Error("recovery rpc failed");
  ok("6 stale claim recovery rpc");

  await cleanup(jobId);
  ok("fixture cleanup");

  console.log(`STAGING MATRIX PASS (${passed} core cases)`);
}

run().catch((error) => {
  console.error("STAGING MATRIX FAIL", error.message);
  process.exit(1);
});
