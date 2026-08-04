#!/usr/bin/env node
/**
 * Read-only Staging RLS drift validation (PostgREST probes only).
 *
 * Usage:
 *   node scripts/staging-rls-public-fix-validate.mjs --project-ref=tvkhuijufhnpqpchkyss
 *
 * Requires .env.staging.local (never .env.production*).
 * Rejects Production project ref explicitly.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  extractSupabaseProjectRef,
  maskProjectRef,
} from "../lib/production-env-guard.js";
import { assertStagingSupabaseConfig } from "../lib/staging-env-guard.js";

const ROOT = process.cwd();
const STAGING_ENV = resolve(ROOT, ".env.staging.local");
const TABLES = Object.freeze({
  admin_logs: "id",
  account_management_status_backfill_20260722: "request_id",
});

function parseArgs(argv) {
  let projectRef = "";
  for (const arg of argv.slice(2)) {
    if (arg.startsWith("--project-ref=")) {
      projectRef = arg.slice("--project-ref=".length).trim();
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: node scripts/staging-rls-public-fix-validate.mjs --project-ref=<staging-ref>"
      );
      process.exit(0);
    }
  }
  if (!projectRef) {
    throw new Error("Missing required --project-ref=<staging-ref>");
  }
  return { projectRef };
}

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

function loadStagingEnv(requiredRef) {
  if (requiredRef === PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error("Production project ref rejected in Staging validation mode");
  }

  const env = parseEnvFile(STAGING_ENV);
  const url = env.STAGING_SUPABASE_URL || "";
  const urlRef = extractSupabaseProjectRef(url);

  assertStagingSupabaseConfig({
    projectRef: requiredRef,
    url,
  });

  if (urlRef !== requiredRef) {
    throw new Error("Explicit --project-ref does not match STAGING_SUPABASE_URL");
  }

  return {
    url,
    anonKey: env.STAGING_SUPABASE_ANON_KEY,
    serviceKey: env.STAGING_SUPABASE_SERVICE_ROLE_KEY,
    projectRefMasked: maskProjectRef(requiredRef),
  };
}

/** Read-only HEAD count probe — no row payloads. */
async function probeCount(client, table, column) {
  const { count, error } = await client.from(table).select(column, { count: "exact", head: true });
  const rowCount = typeof count === "number" ? count : null;
  const missing =
    error?.code === "PGRST205" ||
    /could not find the table/i.test(error?.message || "") ||
    error?.code === "42P01";

  return {
    exists: !missing,
    ok: !error,
    count: rowCount,
    effectiveDeny: Boolean(error) || rowCount === 0,
    serviceReadable: !error && !missing,
  };
}

export async function validateStagingPublicRls(options = {}) {
  const requiredRef = options.projectRef;
  if (!requiredRef) throw new Error("projectRef required");

  const staging = loadStagingEnv(requiredRef);
  const anon = createClient(staging.url, staging.anonKey, { auth: { persistSession: false } });
  const service = createClient(staging.url, staging.serviceKey, { auth: { persistSession: false } });

  const tables = {};
  for (const [table, column] of Object.entries(TABLES)) {
    const anonProbe = await probeCount(anon, table, column);
    const serviceProbe = await probeCount(service, table, column);
    tables[table] = {
      exists: anonProbe.exists || serviceProbe.exists,
      anonEffectiveDeny: anonProbe.effectiveDeny,
      serviceReadable: serviceProbe.serviceReadable,
      serviceRowCount: serviceProbe.count,
      rlsServiceOnlyPattern:
        anonProbe.effectiveDeny && serviceProbe.serviceReadable && anonProbe.exists !== false,
    };
  }

  const admin = tables.admin_logs;
  const backfill = tables.account_management_status_backfill_20260722;

  const checks = {
    adminLogsExists: admin.exists,
    adminLogsAnonDenied: admin.anonEffectiveDeny,
    adminLogsServiceReadable: admin.serviceReadable && (admin.serviceRowCount ?? 0) > 0,
    backfillExists: backfill.exists,
    backfillAnonDenied: backfill.anonEffectiveDeny,
    backfillServiceReadable: backfill.serviceReadable,
    productionRefRejected: requiredRef !== PRODUCTION_SUPABASE_PROJECT_REF,
  };

  const pass =
    checks.adminLogsExists &&
    checks.adminLogsAnonDenied &&
    checks.adminLogsServiceReadable &&
    checks.backfillExists &&
    checks.backfillAnonDenied &&
    checks.backfillServiceReadable &&
    checks.productionRefRejected;

  return {
    phase: "staging-rls-public-fix-validate",
    projectRefMasked: staging.projectRefMasked,
    mode: "staging-read-only",
    tables,
    checks,
    verdict: pass ? "STAGING_RLS_VALIDATE_PASS" : "STAGING_RLS_VALIDATE_FAIL",
    note:
      "Policy count metadata requires SQL advisor; this script verifies service-only access pattern only.",
  };
}

async function main() {
  const { projectRef } = parseArgs(process.argv);
  const report = await validateStagingPublicRls({ projectRef });
  console.log(
    JSON.stringify(
      {
        verdict: report.verdict,
        projectRefMasked: report.projectRefMasked,
        checks: report.checks,
        tables: Object.fromEntries(
          Object.entries(report.tables).map(([name, t]) => [
            name,
            {
              exists: t.exists,
              anonEffectiveDeny: t.anonEffectiveDeny,
              serviceReadable: t.serviceReadable,
              serviceRowCount: t.serviceRowCount,
            },
          ])
        ),
      },
      null,
      2
    )
  );
  process.exit(report.verdict.includes("PASS") ? 0 : 1);
}

main().catch((e) => {
  console.error(JSON.stringify({ error: e.message }));
  process.exit(1);
});
