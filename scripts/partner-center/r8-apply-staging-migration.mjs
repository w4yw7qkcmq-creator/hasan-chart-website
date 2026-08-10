#!/usr/bin/env node
/**
 * Apply Round 8 migrations to STAGING ONLY (tvkhuijufhnpqpchkyss).
 * Uses Supabase Management API via temporary project link — never Production.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
} from "../../lib/staging-env-guard.js";

const MIGRATIONS = [
  "20260820_partner_service_commission_hardening.sql",
  "20260821_partner_service_commission_rpc_hardening.sql",
];

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  return execSync(cmd, { stdio: "inherit", ...opts });
}

function getLinkedRef() {
  const configPath = join(process.cwd(), "supabase/.temp/project-ref");
  if (!existsSync(configPath)) return null;
  return readFileSync(configPath, "utf8").trim();
}

function assertStagingGuard() {
  const linked = getLinkedRef();
  if (linked === PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error(
      `ABORT: linked project is Production (${PRODUCTION_SUPABASE_PROJECT_REF}). Link staging first.`
    );
  }
  console.log(`Staging guard OK. Linked ref: ${linked || "none"}`);
}

function linkStaging() {
  run(`npx supabase link --project-ref ${STAGING_SUPABASE_PROJECT_REF} --yes`, {
    env: { ...process.env },
  });
  const linked = getLinkedRef();
  if (linked !== STAGING_SUPABASE_PROJECT_REF) {
    throw new Error(`Expected staging ref ${STAGING_SUPABASE_PROJECT_REF}, got ${linked}`);
  }
}

function applyMigrationFile(filename) {
  const path = join(process.cwd(), "supabase/migrations", filename);
  if (!existsSync(path)) throw new Error(`Missing migration: ${path}`);
  run(`npx supabase db query --linked -f "${path}"`);
}

function catalogCheck() {
  const sql = `
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='partner_commission_rules' AND column_name='tier_policy') AS tier_policy,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='partner_service_commission_entitlements') AS entitlements,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname='reverse_partner_service_commission_atomic') AS reverse_rpc,
  (SELECT count(*) FROM partner_commission_rules WHERE service_type='vip_forex' AND coalesce(status,'active')='active') AS vip_forex_rules,
  (SELECT coalesce(is_enabled,false) FROM partner_commission_rules WHERE service_type='account_management' AND coalesce(status,'active')='active' LIMIT 1) AS account_mgmt_enabled;
`;
  run(`npx supabase db query --linked "${sql.replace(/\n/g, " ")}"`);
}

function main() {
  const linked = getLinkedRef();
  if (linked === PRODUCTION_SUPABASE_PROJECT_REF || linked !== STAGING_SUPABASE_PROJECT_REF) {
    console.log("Linking staging project...");
    linkStaging();
  }
  assertStagingGuard();
  for (const file of MIGRATIONS) {
    applyMigrationFile(file);
  }
  catalogCheck();
  console.log("Round 8 staging migrations applied.");
}

main();
