#!/usr/bin/env node
/**
 * Apply effective classification read-model migration on STAGING ONLY.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { execSync, spawnSync } from "node:child_process";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
} from "../lib/staging-env-guard.js";

const ROOT = resolve(process.cwd());
const MIGRATION = "20260812103000_profiles_effective_user_classification_read_model.sql";
const ARTIFACT = join(ROOT, "scripts/.artifacts/effective-classification-staging-migration.json");

function getLinkedRef() {
  const configPath = join(ROOT, "supabase/.temp/project-ref");
  if (!existsSync(configPath)) return null;
  return readFileSync(configPath, "utf8").trim();
}

function runSql(sql) {
  const tmp = join(ROOT, ".tmp-effective-classification-staging.sql");
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

  const migrationPath = join(ROOT, "supabase/migrations", MIGRATION);
  execSync(`npx supabase db query --linked -f "${migrationPath}"`, { cwd: ROOT, stdio: "inherit" });

  const effectiveCounts = runSql(`
SELECT effective_user_classification AS classification, count(*)::int AS count
FROM public.profiles
GROUP BY effective_user_classification
ORDER BY effective_user_classification;
`);

  const paritySample = runSql(`
SELECT count(*)::int AS mismatches
FROM public.profiles p
CROSS JOIN LATERAL public.resolve_profile_effective_classification(
  p.email, p.username, p.role, p.created_at, p.last_sign_in_at,
  p.user_classification, p.user_classification_source
) eff
WHERE p.effective_user_classification IS DISTINCT FROM eff.effective_classification;
`)[0];

  const report = {
    generatedAt: new Date().toISOString(),
    environment: "staging",
    projectRef: STAGING_SUPABASE_PROJECT_REF,
    migration: MIGRATION,
    effectiveCounts,
    dbParityMismatches: paritySample?.mismatches ?? null,
    pass: Number(paritySample?.mismatches || 0) === 0,
  };

  mkdirSync(join(ROOT, "scripts/.artifacts"), { recursive: true });
  writeFileSync(ARTIFACT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exit(1);
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
