#!/usr/bin/env node
/**
 * IAM Staging preflight via Supabase REST (service role) — no DDL.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadStagingEnvFile } from "../../lib/load-staging-env.js";
import {
  maskProjectRef,
  PRODUCTION_SUPABASE_PROJECT_REF,
} from "../../lib/staging-env-guard.js";
import { readFileSync } from "node:fs";

async function countTable(supabase, table) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  return { table, count: count ?? null, error: error?.message || null, exists: !error || !/does not exist/i.test(error.message || "") };
}

async function main() {
  loadStagingEnvFile();
  const linked = JSON.parse(readFileSync("supabase/.temp/linked-project.json", "utf8"));
  if (linked.ref === PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error("Linked to Production");
  }

  const url = process.env.STAGING_SUPABASE_URL;
  const key = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const tables = ["profiles", "admin_logs", "admin_audit_logs", "subscription_requests"];
  const counts = {};
  for (const t of tables) {
    counts[t] = await countTable(supabase, t);
  }

  const { data: legacyAdmins } = await supabase
    .from("profiles")
    .select("id, email, role, admin_role")
    .eq("role", "admin");

  const iamTables = [
    "iam_organizations",
    "iam_roles",
    "iam_permissions",
    "iam_user_assignments",
    "iam_bootstrap_state",
    "iam_service_accounts",
  ];
  const iamExists = {};
  for (const t of iamTables) {
    const r = await countTable(supabase, t);
    iamExists[t] = r.exists;
  }

  const artifact = {
    timestamp: new Date().toISOString(),
    stagingProjectRefMasked: maskProjectRef(process.env.STAGING_SUPABASE_PROJECT_REF),
    productionProjectRefMasked: maskProjectRef(PRODUCTION_SUPABASE_PROJECT_REF),
    linkedRefMasked: maskProjectRef(linked.ref),
    refsAreDifferent: linked.ref !== PRODUCTION_SUPABASE_PROJECT_REF,
    counts,
    legacyAdminCount: (legacyAdmins || []).length,
    legacyAdmins: (legacyAdmins || []).map((p) => ({
      id: p.id,
      email: p.email,
      admin_role: p.admin_role || null,
    })),
    iamTablesExist: iamExists,
    migrationsToApply: [
      "20260804_iam_rbac_foundation.sql",
      "20260804_iam_rls_functions.sql",
      "20260804_iam_rls_dual_policies.sql",
    ],
  };

  const dir = join(process.cwd(), "scripts/iam/.artifacts");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `staging-preflight-${Date.now()}.json`);
  writeFileSync(path, JSON.stringify(artifact, null, 2));
  console.log(JSON.stringify({ ok: true, path, artifact }, null, 2));
}

main().catch((e) => {
  console.error(JSON.stringify({ ok: false, error: e.message }));
  process.exit(1);
});
