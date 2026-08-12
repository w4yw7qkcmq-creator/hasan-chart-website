#!/usr/bin/env node
/**
 * Performance contract for effective classification read model (staging profiles).
 */
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createStagingServiceClient, loadStagingBrowserEnv } from "./iam/staging-admin-auth-resolver.mjs";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
} from "../lib/staging-env-guard.js";

const ROOT = resolve(process.cwd());
const ARTIFACT = join(ROOT, "scripts/.artifacts/effective-classification-performance-contract.json");

async function timedCount(service, applyFilters) {
  const started = performance.now();
  let query = service.from("profiles").select("id", { count: "exact", head: true });
  query = applyFilters(query);
  const { count, error } = await query;
  if (error) throw error;
  return { durationMs: performance.now() - started, total: Number(count || 0) };
}

async function timedPage(service, applyFilters, page = 1, pageSize = 25) {
  const started = performance.now();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  let query = service.from("profiles").select("id,email,effective_user_classification").range(from, to);
  query = applyFilters(query);
  query = query.order("created_at", { ascending: false });
  const { data, error } = await query;
  if (error) throw error;
  return { durationMs: performance.now() - started, rows: (data || []).length };
}

async function main() {
  const env = loadStagingBrowserEnv(ROOT);
  assert.equal(env.STAGING_SUPABASE_PROJECT_REF, STAGING_SUPABASE_PROJECT_REF);
  assert.notEqual(env.STAGING_SUPABASE_PROJECT_REF, PRODUCTION_SUPABASE_PROJECT_REF);
  const service = createStagingServiceClient(env);

  const benchmarks = {};
  benchmarks.realCount = await timedCount(service, (q) => q.eq("effective_user_classification", "real"));
  benchmarks.testCount = await timedCount(service, (q) => q.eq("effective_user_classification", "test"));
  benchmarks.realPage1 = await timedPage(service, (q) => q.eq("effective_user_classification", "real"), 1, 25);
  benchmarks.realPageDeep = await timedPage(service, (q) => q.eq("effective_user_classification", "real"), 15, 25);
  benchmarks.realSearch = await timedCount(service, (q) =>
    q.eq("effective_user_classification", "real").ilike("email", "%staging-hcw.test%")
  );
  benchmarks.realCohortMonth = await timedCount(service, (q) =>
    q
      .eq("effective_user_classification", "real")
      .gte("created_at", "2026-07-31T21:00:00.000Z")
      .lte("created_at", "2026-08-31T20:59:59.999Z")
  );
  benchmarks.realLastLogin = await timedCount(service, (q) =>
    q
      .eq("effective_user_classification", "real")
      .gte("last_sign_in_at", "2020-01-01T00:00:00.000Z")
      .lte("last_sign_in_at", "2030-12-31T23:59:59.999Z")
  );

  const { data: grouped, error: groupError } = await service.rpc("admin_profiles_effective_classification_counts");
  if (groupError) throw groupError;
  benchmarks.kpiAggregationMs = null;
  {
    const started = performance.now();
    await service.rpc("admin_profiles_effective_classification_counts");
    benchmarks.kpiAggregationMs = performance.now() - started;
  }

  const pass = Object.entries(benchmarks)
    .filter(([key]) => key !== "kpiAggregationMs")
    .every(([, row]) => row.durationMs < 3000);

  const report = {
    generatedAt: new Date().toISOString(),
    environment: "staging",
    profilesNote: "Measured against live staging profiles table with read-model indexes",
    benchmarks,
    kpiGroups: grouped,
    pass: pass && benchmarks.kpiAggregationMs < 3000,
  };

  mkdirSync(join(ROOT, "scripts/.artifacts"), { recursive: true });
  writeFileSync(ARTIFACT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exit(1);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
