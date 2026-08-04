#!/usr/bin/env node
/**
 * Static guards for Staging RLS closeout hygiene (no network, no DB).
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const VALIDATE_SCRIPT = join(ROOT, "scripts/staging-rls-public-fix-validate.mjs");
const MIGRATIONS_DIR = join(ROOT, "supabase/migrations");

const FORBIDDEN_MIGRATION_FRAGMENTS = [
  "staging_enable_rls_on_unprotected_public_tables",
  "20260805_staging_enable_rls",
];

const FORBIDDEN_SQL_IN_VALIDATE = [
  /\bINSERT\b/i,
  /\bUPDATE\b/i,
  /\bDELETE\b/i,
  /\bTRUNCATE\b/i,
  /\bDROP\b/i,
  /\bALTER\s+TABLE\b/i,
  /\bCREATE\s+POLICY\b/i,
  /\bENABLE\s+ROW\s+LEVEL\b/i,
  /\bDISABLE\s+ROW\s+LEVEL\b/i,
];

function testNoStagingOnlyMigrationInRepo() {
  if (!existsSync(MIGRATIONS_DIR)) return;
  const files = readdirSync(MIGRATIONS_DIR);
  for (const file of files) {
    for (const fragment of FORBIDDEN_MIGRATION_FRAGMENTS) {
      assert.ok(
        !file.includes(fragment),
        `staging-only migration must not be in supabase/migrations: ${file}`
      );
    }
  }
}

function testValidateScriptIsReadOnly() {
  const source = readFileSync(VALIDATE_SCRIPT, "utf8");
  for (const pattern of FORBIDDEN_SQL_IN_VALIDATE) {
    assert.ok(
      !pattern.test(source),
      `validation script must not contain mutating SQL pattern: ${pattern}`
    );
  }
  assert.ok(
    !source.includes("writeFileSync"),
    "validation script must not write artifact files"
  );
  assert.match(source, /--project-ref=/, "validation script must require explicit --project-ref");
  assert.match(
    source,
    /Production project ref rejected/,
    "validation script must reject Production ref"
  );
}

function testValidateScriptDoesNotTargetProductionAsDefault() {
  const source = readFileSync(VALIDATE_SCRIPT, "utf8");
  assert.ok(
    !source.includes('projectRef = PRODUCTION_SUPABASE_PROJECT_REF'),
    "validation script must not default to Production ref"
  );
  assert.match(
    source,
    /assertStagingSupabaseConfig/,
    "validation script must use staging env guard"
  );
}

const tests = [
  ["no staging-only RLS migration in supabase/migrations", testNoStagingOnlyMigrationInRepo],
  ["validate script is read-only", testValidateScriptIsReadOnly],
  ["validate script rejects Production as target", testValidateScriptDoesNotTargetProductionAsDefault],
];

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`  ✔ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✖ ${name}: ${err.message}`);
  }
}

if (failed > 0) process.exit(1);
console.log(`\n${tests.length}/${tests.length} staging RLS closeout static tests passed`);
