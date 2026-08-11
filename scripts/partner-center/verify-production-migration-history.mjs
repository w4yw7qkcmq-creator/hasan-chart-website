#!/usr/bin/env node
/**
 * Partner Center — Production migration history guard (READ-ONLY)
 * Compares local Partner Center migration versions against linked remote history.
 * Never mutates the database.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
  maskProjectRef,
} from "../../lib/staging-env-guard.js";

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, "supabase/migrations");
const LINKED_META = join(ROOT, "supabase/.temp/linked-project.json");

/** Partner Center production chain (unique version ids). */
export const PARTNER_CENTER_MIGRATION_VERSIONS = [
  "20260810",
  "20260811",
  "20260812",
  "20260813",
  "20260814",
  "20260815",
  "20260816",
  "20260817",
  "20260818",
  "20260819",
  "20260820",
  "20260821",
  "20260823",
];

/** Staging-only fixture version — must never appear in Production history/catalog. */
export const STAGING_ONLY_VERSION = "20260822";

/** Catalog patterns that must never exist in Production. */
export const STAGING_ARTIFACT_SQL = `
SELECT kind, name FROM (
  SELECT 'table'::text AS kind, tablename AS name
  FROM pg_tables
  WHERE schemaname = 'public'
    AND (
      tablename ILIKE '%partner_center_staging%'
      OR tablename ILIKE '%staging_test%'
      OR tablename ILIKE '%test_fail%'
      OR tablename ILIKE '%fail_after%'
      OR tablename ILIKE '%purge_run%'
      OR tablename ILIKE '%failure_injection%'
    )
  UNION ALL
  SELECT 'function', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND (
      p.proname ILIKE '%partner_center_staging%'
      OR p.proname ILIKE '%staging_test%'
      OR p.proname ILIKE '%test_fail%'
      OR p.proname ILIKE '%fail_after%'
      OR p.proname ILIKE '%purge_run%'
      OR p.proname ILIKE '%failure_injection%'
    )
  UNION ALL
  SELECT 'view', viewname
  FROM pg_views
  WHERE schemaname = 'public'
    AND (
      viewname ILIKE '%partner_center_staging%'
      OR viewname ILIKE '%staging_test%'
      OR viewname ILIKE '%test_fail%'
      OR viewname ILIKE '%fail_after%'
      OR viewname ILIKE '%purge_run%'
    )
) artifacts
ORDER BY kind, name;
`;

const PARTNER_FILE_PATTERNS = [
  /^2026081[0-9]_partner_/,
  /^20260820_partner_/,
  /^20260821_partner_/,
  /^20260823_partner_/,
  /^20260810_news_source_ingestion_checkpoints\.sql$/,
];

function parseArgs(argv = process.argv.slice(2)) {
  const simulateMissing = [];
  let requireProduction = true;
  for (const arg of argv) {
    if (arg.startsWith("--simulate-missing=")) {
      simulateMissing.push(...arg.slice("--simulate-missing=".length).split(",").map((v) => v.trim()).filter(Boolean));
    } else if (arg === "--allow-staging") {
      requireProduction = false;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node scripts/partner-center/verify-production-migration-history.mjs [--simulate-missing=20260820] [--allow-staging]`);
      process.exit(0);
    }
  }
  return { simulateMissing, requireProduction };
}

function readLinkedProjectRef() {
  try {
    const meta = JSON.parse(readFileSync(LINKED_META, "utf8"));
    return String(meta.ref || "").trim();
  } catch {
    return "";
  }
}

function localPartnerMigrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => PARTNER_FILE_PATTERNS.some((re) => re.test(name)))
    .sort();
}

function localPartnerVersions() {
  const versions = new Set();
  for (const file of localPartnerMigrationFiles()) {
    const match = file.match(/^(\d+)_/);
    if (match) versions.add(match[1]);
  }
  return [...versions].sort();
}

function runSupabase(args) {
  const result = spawnSync("supabase", args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `supabase ${args.join(" ")} failed`).trim());
  }
  return result.stdout || "";
}

function runLinkedSql(sql) {
  const stdout = runSupabase(["db", "query", "--linked", "--output", "json", sql]);
  const jsonStart = stdout.indexOf("{");
  if (jsonStart < 0) throw new Error("Unexpected supabase db query output");
  return JSON.parse(stdout.slice(jsonStart));
}

function remoteHistoryVersionsFromMigrationList() {
  const stdout = runSupabase(["migration", "list", "--linked"]);
  const remote = new Set();
  for (const line of stdout.split("\n")) {
    const match = line.match(/^\s*(\S*)\s*\|\s*(\S*)\s*\|\s*(\S+)/);
    if (!match) continue;
    const [, localCol, remoteCol] = match;
    const version = String(remoteCol || "").trim();
    if (!version || !/^\d+$/.test(version)) continue;
    if (PARTNER_CENTER_MIGRATION_VERSIONS.includes(version) || version === STAGING_ONLY_VERSION) {
      remote.add(version);
    }
    if (localCol && /^\d+$/.test(localCol.trim()) && PARTNER_CENTER_MIGRATION_VERSIONS.includes(localCol.trim())) {
      remote.add(localCol.trim());
    }
  }
  return [...remote].sort();
}

function remoteHistoryVersions() {
  return remoteHistoryVersionsFromMigrationList();
}

function productionStagingArtifactCheck() {
  const payload = runLinkedSql(
    `SELECT jsonb_build_object(
      'history_20260822', EXISTS (
        SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '${STAGING_ONLY_VERSION}'
      ),
      'artifacts', coalesce((
        SELECT jsonb_agg(jsonb_build_object('kind', kind, 'name', name) ORDER BY kind, name)
        FROM (${STAGING_ARTIFACT_SQL.replace(/\n/g, " ")}) scan
      ), '[]'::jsonb)
    ) AS staging_probe;`
  );
  const probe = payload.rows?.[0]?.staging_probe || {};
  const artifacts = Array.isArray(probe.artifacts) ? probe.artifacts : [];
  return {
    history_20260822: Boolean(probe.history_20260822),
    artifacts,
    artifact_count: artifacts.length,
    staging_flags_table: artifacts.some((a) => a.name === "partner_center_staging_test_flags"),
    staging_purge_fn: artifacts.some((a) => String(a.name || "").startsWith("partner_center_staging_purge_run_commissions")),
  };
}

export function evaluateMigrationHistoryGuard(options = {}) {
  const {
    linkedRef = readLinkedProjectRef(),
    localVersions = localPartnerVersions(),
    remoteVersions = [],
    simulateMissing = [],
    requireProduction = true,
    stagingProbe = null,
  } = options;

  const errors = [];
  const warnings = [];

  if (requireProduction) {
    if (!linkedRef) errors.push("linked_project_missing");
    else if (linkedRef !== PRODUCTION_SUPABASE_PROJECT_REF) {
      errors.push(`wrong_linked_project:${maskProjectRef(linkedRef)} (expected ${maskProjectRef(PRODUCTION_SUPABASE_PROJECT_REF)})`);
    }
    if (linkedRef === STAGING_SUPABASE_PROJECT_REF) {
      errors.push(`staging_linked_while_expecting_production:${maskProjectRef(linkedRef)}`);
    }
  }

  const expected = [...PARTNER_CENTER_MIGRATION_VERSIONS];
  const remoteSet = new Set(remoteVersions);
  for (const version of simulateMissing) remoteSet.delete(version);

  const missingInRemote = expected.filter((v) => !remoteSet.has(v));
  const extraInRemote = [...remoteSet].filter((v) => !expected.includes(v) && v !== STAGING_ONLY_VERSION);

  if (remoteSet.has(STAGING_ONLY_VERSION)) {
    errors.push("staging_version_in_history:20260822");
  }

  if (missingInRemote.length) {
    errors.push(`missing_remote_history:${missingInRemote.join(",")}`);
  }
  if (extraInRemote.length) {
    warnings.push(`unexpected_remote_history:${extraInRemote.join(",")}`);
  }

  const localSet = new Set(localVersions);
  for (const version of expected) {
    if (!localSet.has(version)) warnings.push(`missing_local_file_for_version:${version}`);
  }

  if (stagingProbe) {
    if (stagingProbe.history_20260822) errors.push("staging_version_in_history:20260822");
    if (requireProduction && Number(stagingProbe.artifact_count || 0) > 0) {
      const names = (stagingProbe.artifacts || [])
        .slice(0, 8)
        .map((a) => `${a.kind}:${a.name}`)
        .join("; ");
      errors.push(`staging_artifacts_present_in_production:${stagingProbe.artifact_count}:${names}`);
    }
    if (requireProduction && stagingProbe.staging_flags_table) {
      errors.push("staging_test_flags_table_present_in_production");
    }
    if (requireProduction && stagingProbe.staging_purge_fn) {
      errors.push("staging_purge_function_present_in_production");
    }
  }

  return {
    linkedRef: maskProjectRef(linkedRef),
    expectedVersions: expected,
    localVersions,
    remoteVersions: [...remoteSet].sort(),
    missingInRemote,
    extraInRemote,
    stagingProbe,
    errors,
    warnings,
    ok: errors.length === 0,
  };
}

export function main(argv = process.argv.slice(2)) {
  const { simulateMissing, requireProduction } = parseArgs(argv);
  const linkedRef = readLinkedProjectRef();
  const localVersions = localPartnerVersions();
  let remoteVersions = [];
  let stagingProbe = null;
  let probeWarning = null;

  if (simulateMissing.length === 0) {
    remoteVersions = remoteHistoryVersions();
    if (requireProduction) {
      try {
        stagingProbe = productionStagingArtifactCheck();
      } catch (error) {
        probeWarning = `staging_probe_unavailable:${error.message.split("\n")[0]}`;
      }
    }
  } else {
    remoteVersions = [...PARTNER_CENTER_MIGRATION_VERSIONS];
  }

  const report = evaluateMigrationHistoryGuard({
    linkedRef,
    localVersions,
    remoteVersions,
    simulateMissing,
    requireProduction,
    stagingProbe,
  });
  if (probeWarning) report.warnings.push(probeWarning);

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
