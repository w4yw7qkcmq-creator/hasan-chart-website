#!/usr/bin/env node
/**
 * Apply profiles.user_classification migration on STAGING ONLY.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { execSync, spawnSync } from "node:child_process";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
} from "../lib/staging-env-guard.js";

const ROOT = resolve(process.cwd());
const MIGRATIONS = [
  "20260811120000_profiles_user_classification.sql",
  "20260811153000_profiles_user_classification_backfill_v2.sql",
  "20260811160000_profiles_user_classification_e2e_promote.sql",
];
const ARTIFACT = join(ROOT, "scripts/.artifacts/admin-users-classification-staging-migration.json");

function getLinkedRef() {
  const configPath = join(ROOT, "supabase/.temp/project-ref");
  if (!existsSync(configPath)) return null;
  return readFileSync(configPath, "utf8").trim();
}

function runSql(sql) {
  const tmp = join(ROOT, ".tmp-staging-classification.sql");
  writeFileSync(tmp, sql);
  const result = spawnSync("supabase", ["db", "query", "--linked", "-f", tmp, "-o", "json"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "SQL failed");
  }
  return JSON.parse(result.stdout).rows || [];
}

function main() {
  let linked = getLinkedRef();
  if (linked === PRODUCTION_SUPABASE_PROJECT_REF || linked !== STAGING_SUPABASE_PROJECT_REF) {
    console.log(`Relinking from ${linked || "none"} to staging ${STAGING_SUPABASE_PROJECT_REF}...`);
    execSync(`npx supabase link --project-ref ${STAGING_SUPABASE_PROJECT_REF} --yes`, {
      cwd: ROOT,
      stdio: "inherit",
    });
    linked = getLinkedRef();
  }
  if (linked === PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error("ABORT: still linked to production after relink attempt");
  }
  if (linked !== STAGING_SUPABASE_PROJECT_REF) {
    throw new Error(`Expected staging ref ${STAGING_SUPABASE_PROJECT_REF}, got ${linked}`);
  }

  let beforeCounts = { total: null };
  try {
    beforeCounts = runSql(`
SELECT count(*)::int AS total FROM public.profiles;
`)[0];
  } catch {
    // column may not exist yet
  }

  for (const file of MIGRATIONS) {
    const migrationPath = join(ROOT, "supabase/migrations", file);
    execSync(`npx supabase db query --linked -f "${migrationPath}"`, { cwd: ROOT, stdio: "inherit" });
  }

  const afterUnknown = runSql(`
SELECT user_classification, count(*)::int AS count
FROM public.profiles
GROUP BY user_classification
ORDER BY user_classification;
`);

  const backfill = runSql(`SELECT * FROM public.backfill_profiles_user_classification_high_confidence();`)[0];

  const afterBackfill = runSql(`
SELECT user_classification, count(*)::int AS count
FROM public.profiles
GROUP BY user_classification
ORDER BY user_classification;
`);

  const report = {
    generatedAt: new Date().toISOString(),
    environment: "staging",
    projectRef: STAGING_SUPABASE_PROJECT_REF,
    migration: MIGRATIONS,
    beforeProfilesTotal: beforeCounts?.total ?? null,
    afterBackfillCounts: afterBackfill,
    backfillResult: backfill,
    beforeMigrationCounts: afterUnknown,
  };

  mkdirSync(join(ROOT, "scripts/.artifacts"), { recursive: true });
  writeFileSync(ARTIFACT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
