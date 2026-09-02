#!/usr/bin/env node
/**
 * Railway Cron — daily balanced DB retention (7d market/snapshots, 14d worker telemetry).
 * One-shot: calls run_balanced_retention_cleanup via service role. Logs counts only.
 */
const path = require("path");

const SERVICE_NAME = "hasan-chart-database-retention-cron";
const DEFAULT_MARKET_DAYS = 7;
const DEFAULT_SNAPSHOT_DAYS = 7;
const DEFAULT_WORKER_DAYS = 14;

function log(event, extra = {}) {
  console.log(JSON.stringify({ event, service: SERVICE_NAME, timestamp: new Date().toISOString(), ...extra }));
}

function loadEnv() {
  try {
    require("dotenv").config({ path: path.join(__dirname, "../.env.local") });
    require("dotenv").config();
  } catch (error) {
    log("DOTENV_SKIPPED", { error: error?.message || String(error) });
  }
}

function getSupabaseUrl() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    ""
  );
}

function createSupabaseClient() {
  const { createClient } = require("@supabase/supabase-js");
  const supabaseUrl = getSupabaseUrl();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase configuration for database retention cron.");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function parseRetentionDays(name, fallback) {
  const raw = String(process.env[name] ?? "").trim();
  const parsed = Number(raw);
  if (!raw) return fallback;
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`Invalid ${name}: ${raw}`);
  }
  return Math.floor(parsed);
}

function validateEnvironment() {
  const missing = [];
  if (!getSupabaseUrl()) missing.push("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length) {
    return { ok: false, reason: "missing_env", missing };
  }
  return { ok: true };
}

function summarizeResults(payload) {
  const results = Array.isArray(payload?.results) ? payload.results : [];
  const deletedByTable = {};
  let totalDeleted = 0;
  for (const item of results) {
    const table = item?.table || "worker_runs";
    const deleted = Number(item?.deleted) || 0;
    deletedByTable[table] = (deletedByTable[table] || 0) + deleted;
    totalDeleted += deleted;
  }
  return {
    policy: payload?.policy || "balanced",
    marketRetentionDays: payload?.marketRetentionDays ?? null,
    snapshotRetentionDays: payload?.snapshotRetentionDays ?? null,
    workerRetentionDays: payload?.workerRetentionDays ?? null,
    totalDeleted,
    deletedByTable,
    completedAt: payload?.completedAt ?? null,
  };
}

async function runRetentionCleanup() {
  const envCheck = validateEnvironment();
  if (!envCheck.ok) {
    log("RETENTION_CRON_ENV_INVALID", { reason: envCheck.reason, missing: envCheck.missing });
    process.exit(1);
  }

  const marketDays = parseRetentionDays("RETENTION_MARKET_DAYS", DEFAULT_MARKET_DAYS);
  const snapshotDays = parseRetentionDays("RETENTION_SNAPSHOT_DAYS", DEFAULT_SNAPSHOT_DAYS);
  const workerDays = parseRetentionDays("RETENTION_WORKER_DAYS", DEFAULT_WORKER_DAYS);

  const startedAt = Date.now();
  log("RETENTION_CRON_START", { marketDays, snapshotDays, workerDays });

  const client = createSupabaseClient();
  const { data, error } = await client.rpc("run_balanced_retention_cleanup", {
    p_market_retention_days: marketDays,
    p_snapshot_retention_days: snapshotDays,
    p_worker_retention_days: workerDays,
  });

  if (error) {
    log("RETENTION_CRON_FAILED", {
      reason: "rpc_error",
      message: String(error.message || error).slice(0, 200),
      durationMs: Date.now() - startedAt,
    });
    process.exit(1);
  }

  const summary = summarizeResults(data);
  log("RETENTION_CRON_SUCCESS", { ...summary, durationMs: Date.now() - startedAt });
}

loadEnv();

runRetentionCleanup().catch((error) => {
  log("RETENTION_CRON_UNHANDLED", { message: error?.message || String(error) });
  process.exit(1);
});
