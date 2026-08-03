#!/usr/bin/env node
/**
 * IAM Staging preflight — read-only counts and legacy admin candidates.
 * Writes: scripts/iam/.artifacts/staging-preflight-<timestamp>.json
 */

import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { loadStagingEnvFile } from "../../lib/load-staging-env.js";
import {
  maskProjectRef,
  PRODUCTION_SUPABASE_PROJECT_REF,
} from "../../lib/staging-env-guard.js";
import { FALLBACK_ADMIN_EMAILS } from "../../lib/admin-emails.js";

const ROOT = process.cwd();

function getLinkedRef() {
  const linked = JSON.parse(
    readFileSync(join(ROOT, "supabase/.temp/linked-project.json"), "utf8")
  );
  return linked.ref;
}

function runStagingQuery(sql) {
  const tmp = join(ROOT, ".tmp-iam-preflight.sql");
  writeFileSync(tmp, sql);
  const result = spawnSync(
    "supabase",
    ["db", "query", "--linked", "-f", tmp, "-o", "json"],
    { cwd: ROOT, encoding: "utf8" }
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "query failed");
  }
  try {
    const parsed = JSON.parse(result.stdout);
    return parsed?.data ?? parsed;
  } catch {
    return { raw: result.stdout?.slice(0, 2000) };
  }
}

function main() {
  const staging = loadStagingEnvFile();
  const linkedRef = getLinkedRef();

  if (linkedRef === PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error("Linked to Production. Aborting preflight.");
  }
  if (linkedRef !== staging.projectRef) {
    throw new Error("Linked ref does not match STAGING_SUPABASE_PROJECT_REF");
  }

  const sql = `
SELECT 'profiles' AS table_name, count(*)::int AS row_count FROM public.profiles
UNION ALL SELECT 'admin_logs', count(*)::int FROM public.admin_logs
UNION ALL SELECT 'admin_audit_logs', count(*)::int FROM public.admin_audit_logs
UNION ALL SELECT 'subscription_requests', count(*)::int FROM public.subscription_requests;

SELECT count(*)::int AS auth_users FROM auth.users;

SELECT id, email, role, admin_role
FROM public.profiles
WHERE role = 'admin'
ORDER BY email;

SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'iam_user_assignments'
) AS iam_assignments_exists;

SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'iam_bootstrap_state'
) AS iam_bootstrap_exists;
`;

  const queryResult = runStagingQuery(sql);

  const artifact = {
    timestamp: new Date().toISOString(),
    environment: "staging",
    stagingProjectRefMasked: maskProjectRef(staging.projectRef),
    productionProjectRefMasked: maskProjectRef(PRODUCTION_SUPABASE_PROJECT_REF),
    linkedRefMasked: maskProjectRef(linkedRef),
    refsAreDifferent: linkedRef !== PRODUCTION_SUPABASE_PROJECT_REF,
    queryResult,
    fallbackAdminEmailsConfigured: FALLBACK_ADMIN_EMAILS.length,
    migrationsToApply: [
      "20260804_iam_rbac_foundation.sql",
      "20260804_iam_rls_functions.sql",
      "20260804_iam_rls_dual_policies.sql",
    ],
    enforceMigrationPlanned: false,
  };

  const dir = join(ROOT, "scripts/iam/.artifacts");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `staging-preflight-${Date.now()}.json`);
  writeFileSync(file, JSON.stringify(artifact, null, 2));
  console.log(JSON.stringify({ ok: true, artifactPath: file, summary: artifact }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
}
