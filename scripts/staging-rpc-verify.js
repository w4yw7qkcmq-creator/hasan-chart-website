#!/usr/bin/env node
/**
 * Verify settle_test_partner_financial RPC deployment on Staging (read-only SQL).
 */

import { writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { loadStagingEnvFile } from "../lib/load-staging-env.js";
import { maskProjectRef, PRODUCTION_SUPABASE_PROJECT_REF } from "../lib/staging-env-guard.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

loadStagingEnvFile();
const linked = JSON.parse(readFileSync("supabase/.temp/linked-project.json", "utf8"));
if (linked.ref === PRODUCTION_SUPABASE_PROJECT_REF) {
  console.error("Linked to Production. Aborting.");
  process.exit(1);
}

const sql = `
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.prosecdef AS security_definer,
  pg_get_functiondef(p.oid) LIKE '%search_path = public, pg_temp%' AS search_path_ok
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'settle_test_partner_financial';

SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname = 'partner_wallet_ledger_test_settlement_commission_uidx';

SELECT grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name = 'settle_test_partner_financial'
ORDER BY grantee, privilege_type;

SELECT count(*)::int AS settlement_adjustments
FROM public.partner_wallet_ledger
WHERE reference_type = 'test_financial_settlement';
`;

writeFileSync(".tmp-staging-rpc-verify.sql", sql);
const result = spawnSync("supabase", ["db", "query", "--linked", "-f", ".tmp-staging-rpc-verify.sql"], {
  encoding: "utf8",
});
console.log(
  JSON.stringify(
    {
      linkedRefMasked: maskProjectRef(linked.ref),
      stdout: result.stdout?.slice(0, 4000),
      stderr: result.stderr || null,
      exitCode: result.status,
    },
    null,
    2
  )
);
