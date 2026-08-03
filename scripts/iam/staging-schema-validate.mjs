#!/usr/bin/env node
/**
 * Run staging schema validation SQL against linked Staging project.
 * Requires: SUPABASE_DB_PASSWORD, staging linked ref != production.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { loadStagingEnvFile } from "../../lib/load-staging-env.js";
import {
  maskProjectRef,
  PRODUCTION_SUPABASE_PROJECT_REF,
} from "../../lib/staging-env-guard.js";

const ROOT = process.cwd();

function getLinkedRef() {
  return JSON.parse(
    readFileSync(join(ROOT, "supabase/.temp/linked-project.json"), "utf8")
  ).ref;
}

function runValidation(label) {
  const sqlPath = join(ROOT, "scripts/iam/staging-schema-validate.sql");
  const result = spawnSync(
    "supabase",
    ["db", "query", "--linked", "-f", sqlPath, "-o", "json"],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: process.env,
    }
  );
  const out = {
    label,
    exitCode: result.status,
    stdout: result.stdout?.slice(0, 12000) || "",
    stderr: result.stderr?.slice(0, 2000) || null,
  };
  return out;
}

function main() {
  if (!process.env.SUPABASE_DB_PASSWORD) {
    throw new Error("SUPABASE_DB_PASSWORD not set in environment");
  }
  const staging = loadStagingEnvFile();
  const linkedRef = getLinkedRef();
  if (linkedRef === PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error("Linked to Production — aborting");
  }
  if (linkedRef !== staging.projectRef) {
    throw new Error("Linked ref mismatch with STAGING_SUPABASE_PROJECT_REF");
  }

  const label = process.argv[2] || "post-migration";
  const report = {
    linkedRefMasked: maskProjectRef(linkedRef),
    productionRefMasked: maskProjectRef(PRODUCTION_SUPABASE_PROJECT_REF),
    validation: runValidation(label),
  };

  const dir = join(ROOT, "scripts/iam/.artifacts");
  const path = join(dir, `staging-schema-validate-${Date.now()}.json`);
  writeFileSync(path, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ok: report.validation.exitCode === 0, path, report }, null, 2));
  process.exit(report.validation.exitCode === 0 ? 0 : 1);
}

try {
  main();
} catch (e) {
  console.error(JSON.stringify({ ok: false, error: e.message }));
  process.exit(1);
}
