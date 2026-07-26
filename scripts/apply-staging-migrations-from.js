#!/usr/bin/env node
/**
 * Apply Supabase migration SQL files to Staging (linked project != production).
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { loadStagingEnvFile } from "../lib/load-staging-env.js";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  maskProjectRef,
} from "../lib/staging-env-guard.js";

const ROOT = resolve(process.cwd());
const MIGRATIONS_DIR = join(ROOT, "supabase/migrations");

function getLinkedRef() {
  const linked = JSON.parse(
    readFileSync(join(ROOT, "supabase/.temp/linked-project.json"), "utf8")
  );
  if (linked.ref === PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error("Linked project is Production. Aborting.");
  }
  return linked.ref;
}

function migrationVersion(filename) {
  return filename.split("_")[0];
}

function runQueryFile(filePath) {
  let queryPath = filePath;
  const raw = readFileSync(filePath, "utf8");
  if (/\bCONCURRENTLY\b/i.test(raw)) {
    queryPath = join(ROOT, ".tmp-staging-migration.sql");
    writeFileSync(queryPath, raw.replace(/\bCONCURRENTLY\b/gi, ""));
  }
  const result = spawnSync(
    "supabase",
    ["db", "query", "--linked", "-f", queryPath],
    { cwd: ROOT, encoding: "utf8" }
  );
  if (result.status !== 0) {
    const message = [result.stderr, result.stdout].filter(Boolean).join("\n");
    throw new Error(message || `Failed: ${filePath}`);
  }
}

function recordMigration(version) {
  const tmp = join(ROOT, ".tmp-record-migration.sql");
  writeFileSync(
    tmp,
    `INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('${version}') ON CONFLICT DO NOTHING;`
  );
  runQueryFile(tmp);
}

function resolveFiles(argv = []) {
  if (argv[0] === "--files") {
    return argv.slice(1).map((name) => {
      if (name.endsWith(".sql")) return name;
      const match = readdirSync(MIGRATIONS_DIR).find(
        (entry) => entry === name || entry === `${name}.sql` || entry.startsWith(`${name}_`)
      );
      if (!match) throw new Error(`Migration file not found for ${name}`);
      return match;
    });
  }
  const startVersion = argv[0] || "20260712";
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql") && migrationVersion(name) >= startVersion)
    .sort((a, b) => {
      const cmp = migrationVersion(a).localeCompare(migrationVersion(b));
      return cmp !== 0 ? cmp : a.localeCompare(b);
    });
}

function main() {
  const staging = loadStagingEnvFile();
  const linkedRef = getLinkedRef();
  if (linkedRef !== staging.projectRef) {
    throw new Error("Linked ref does not match STAGING_SUPABASE_PROJECT_REF");
  }

  const files = resolveFiles(process.argv.slice(2));
  const report = {
    linkedRefMasked: maskProjectRef(linkedRef),
    applied: [],
  };

  for (const file of files) {
    const version = migrationVersion(file);
    const fullPath = join(MIGRATIONS_DIR, file);
    console.log(`Applying ${file} ...`);
    runQueryFile(fullPath);
    recordMigration(version);
    report.applied.push({ file, version });
  }

  console.log(JSON.stringify(report, null, 2));
}

try {
  main();
} catch (error) {
  console.error("STAGING_MIGRATION_APPLY_FAILED", error.message);
  process.exit(1);
}
