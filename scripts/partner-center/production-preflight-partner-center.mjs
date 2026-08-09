#!/usr/bin/env node
/**
 * Partner Center — Production Preflight (READ-ONLY)
 * Never writes to Production. Validates migration prerequisites.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadStagingEnvFile } from "../../lib/load-staging-env.js";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
} from "../../lib/staging-env-guard.js";

const ROOT = process.cwd();
const MIGRATIONS = join(ROOT, "supabase/migrations");

function runLinkedSql(sql) {
  const result = spawnSync("supabase", ["db", "query", "--linked", sql], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(result.stderr || "SQL failed");
  const jsonStart = (result.stdout || "").indexOf("{");
  if (jsonStart >= 0) {
    try {
      return JSON.parse(result.stdout.slice(jsonStart));
    } catch {
      return { raw: result.stdout };
    }
  }
  return { raw: result.stdout };
}

const staging = loadStagingEnvFile();
if (staging.projectRef === PRODUCTION_SUPABASE_PROJECT_REF) {
  console.error("ABORT: Production target");
  process.exit(2);
}

const partnerMigrations = readdirSync(MIGRATIONS)
  .filter((f) => f.includes("partner_center") || f.startsWith("202608"))
  .sort();

const report = {
  environment: staging.maskedProjectRef,
  isStaging: staging.projectRef === STAGING_SUPABASE_PROJECT_REF,
  migrations: partnerMigrations,
  checks: {},
  verdict: null,
};

try {
  for (const table of [
    "partner_events",
    "partner_financial_ledger_entries",
    "partner_mission_definitions",
    "partner_reward_entitlements",
    "partner_admin_audit_log",
  ]) {
    const r = runLinkedSql(
      `SELECT count(*)::int c FROM information_schema.tables WHERE table_schema='public' AND table_name='${table}'`
    );
    report.checks[`table_${table}`] = r.rows?.[0]?.c === 1;
  }

  const rpc = runLinkedSql(`
    SELECT count(*)::int c FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN (
      'create_partner_commission_atomic','create_partner_growth_reward_atomic'
    );
  `);
  report.checks.financial_rpcs = (rpc.rows?.[0]?.c || 0) >= 2;

  const orphans = runLinkedSql(`
    SELECT count(*)::int c FROM partner_commissions c
    LEFT JOIN partners p ON p.id = c.partner_id WHERE p.id IS NULL LIMIT 1
  `);
  report.checks.no_orphan_commissions = (orphans.rows?.[0]?.c || 0) === 0;

  report.checks.migration_files_present = partnerMigrations.length >= 4;

  const allPass = Object.values(report.checks).every(Boolean);
  report.verdict = allPass ? "PREFLIGHT PASS — READY FOR PRODUCTION MIGRATION PLAN REVIEW" : "PREFLIGHT BLOCKED";
} catch (e) {
  report.error = String(e.message || e);
  report.verdict = "PREFLIGHT BLOCKED";
}

console.log(JSON.stringify(report, null, 2));
process.exit(report.verdict.includes("PASS") ? 0 : 1);
