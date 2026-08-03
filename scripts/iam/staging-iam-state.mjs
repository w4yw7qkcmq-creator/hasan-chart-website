#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { loadStagingEnvFile } from "../../lib/load-staging-env.js";
import { maskProjectRef, PRODUCTION_SUPABASE_PROJECT_REF } from "../../lib/staging-env-guard.js";
import { readFileSync } from "node:fs";

async function main() {
  loadStagingEnvFile();
  const linked = JSON.parse(readFileSync("supabase/.temp/linked-project.json", "utf8"));
  if (linked.ref === PRODUCTION_SUPABASE_PROJECT_REF) throw new Error("Production linked");

  const supabase = createClient(
    process.env.STAGING_SUPABASE_URL,
    process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  const { count: rolesCount, error: rolesErr } = await supabase.from("iam_roles").select("*", { count: "exact", head: true });
  const { count: permsCount, error: permsErr } = await supabase.from("iam_permissions").select("*", { count: "exact", head: true });
  const { count: assignmentsCount, error: assignErr } = await supabase
    .from("iam_user_assignments")
    .select("*", { count: "exact", head: true })
    .is("revoked_at", null);
  const { data: bootstrap, error: bootstrapErr } = await supabase
    .from("iam_bootstrap_state")
    .select("*")
    .eq("id", true)
    .maybeSingle();
  const { data: serviceAccounts, error: saErr } = await supabase
    .from("iam_service_accounts")
    .select("id, enabled, secret_hash, revoked_at");
  const { count: superAdminCount } = await supabase
    .from("iam_user_assignments")
    .select("*", { count: "exact", head: true })
    .eq("role_id", "super_admin")
    .is("revoked_at", null);

  console.log(
    JSON.stringify(
      {
        linkedRefMasked: maskProjectRef(linked.ref),
        rolesCount,
        permsCount,
        activeAssignmentsCount: assignmentsCount,
        superAdminCount,
        bootstrap,
        serviceAccounts: (serviceAccounts || []).map((a) => ({
          id: a.id,
          enabled: a.enabled,
          hasSecret: Boolean(a.secret_hash),
          revoked: Boolean(a.revoked_at),
        })),
        errors: {
          roles: rolesErr?.message || null,
          permissions: permsErr?.message || null,
          assignments: assignErr?.message || null,
          bootstrap: bootstrapErr?.message || null,
          serviceAccounts: saErr?.message || null,
        },
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
