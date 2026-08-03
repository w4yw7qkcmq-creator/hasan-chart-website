#!/usr/bin/env node
/**
 * RLS policy coverage validator — static analysis only (no DB connection).
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  RLS_TABLE_INVENTORY,
  ENFORCE_POLICY_EXPECTATIONS,
  countExpectedEnforcePolicies,
  countExpectedOwnPolicies,
  tablesRequiringRlsEnable,
} from "../../lib/iam/rls-permission-map.js";

const ROOT = process.cwd();
const MIGRATIONS = [
  "20260804_iam_rls_user_ownership_policies.sql",
  "20260804_iam_rls_enforce_policies.sql",
  "20260804_iam_rls_enable_business_tables.sql",
  "20260804_iam_rls_rollback.sql",
  "20260804_iam_rls_functions.sql",
];

function readMigration(name) {
  const path = join(ROOT, "supabase/migrations", name);
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8");
}

function extractPolicyNames(sql, prefix) {
  const re = new RegExp(`(?:CREATE POLICY|DROP POLICY IF EXISTS)\\s+([\"']?${prefix}[\"'?\\w]+)`, "gi");
  const names = new Set();
  let m;
  while ((m = re.exec(sql)) !== null) {
    names.add(m[1].replace(/['"]/g, ""));
  }
  return names;
}

function main() {
  const issues = [];
  const critical = [];

  const ownSql = readMigration("20260804_iam_rls_user_ownership_policies.sql");
  const enforceSql = readMigration("20260804_iam_rls_enforce_policies.sql");
  const enableSql = readMigration("20260804_iam_rls_enable_business_tables.sql");
  const rollbackSql = readMigration("20260804_iam_rls_rollback.sql");
  const functionsSql = readMigration("20260804_iam_rls_functions.sql");

  if (!ownSql.includes("BEGIN;") || !ownSql.includes("COMMIT;")) {
    critical.push({ type: "transaction", file: "user_ownership", msg: "missing BEGIN/COMMIT" });
  }
  if (!enforceSql.includes("BEGIN;") || !enforceSql.includes("COMMIT;")) {
    critical.push({ type: "transaction", file: "enforce", msg: "missing BEGIN/COMMIT" });
  }

  if (/iam_is_admin\(\)/.test(enforceSql)) {
    critical.push({ type: "generic_admin", msg: "enforce migration uses iam_is_admin() catch-all" });
  }
  const enforcePolicyLines = enforceSql
    .split("\n")
    .filter((l) => /CREATE POLICY/i.test(l) && /is_admin_dual/i.test(l));
  if (enforcePolicyLines.length > 0) {
    critical.push({ type: "dual_in_enforce", msg: "enforce CREATE POLICY uses is_admin_dual()" });
  }
  if (/FOR ALL TO authenticated\s+USING \(true\)/i.test(enforceSql)) {
    critical.push({ type: "open_policy", msg: "unrestricted authenticated policy in enforce" });
  }

  const enforceApplyCount = (enforceSql.match(/_iam_enforce_apply_policy\(/g) || []).length;
  const expectedEnforce = countExpectedEnforcePolicies();
  if (enforceApplyCount < expectedEnforce) {
    critical.push({
      type: "enforce_count",
      msg: `expected >=${expectedEnforce} enforce apply calls, found ${enforceApplyCount}`,
    });
  }

  for (const [table, spec] of Object.entries(RLS_TABLE_INVENTORY)) {
    if (!spec.browserAccess) continue;
    if (spec.serviceRoleOnly) continue;
    const ownPrefix = `iam_own_${table.replace(/_/g, "_")}`;
    const hasOwn =
      ownSql.includes(`'${table}'`) &&
      (ownSql.includes("iam_own_") || ownSql.includes("iam_public_"));
    if (spec.migrationAction === "own_exists") continue;
    if (spec.category === "user_owned" || spec.category === "mixed") {
      if (!hasOwn && spec.migrationAction?.includes("own")) {
        issues.push({ type: "missing_own", table, severity: "critical" });
      }
    }
  }

  for (const table of tablesRequiringRlsEnable()) {
    if (!enableSql.includes(`'${table}'`)) {
      issues.push({ type: "enable_missing", table, severity: "critical" });
    }
  }

  if (!rollbackSql.includes("iam_dual_")) {
    critical.push({ type: "rollback", msg: "rollback does not restore dual policies" });
  }
  if (!rollbackSql.includes("iam_own_") && !rollbackSql.includes("own-user")) {
    issues.push({ type: "rollback_own_preserve", severity: "warning", msg: "rollback should preserve own policies" });
  }

  if (!functionsSql.includes("SET search_path = public, pg_temp")) {
    critical.push({ type: "search_path", msg: "iam functions missing hardened search_path" });
  }
  if (!functionsSql.includes("REVOKE ALL ON FUNCTION public.iam_has_permission")) {
    critical.push({ type: "grants", msg: "iam_has_permission grants not hardened" });
  }

  for (const [table, exp] of Object.entries(ENFORCE_POLICY_EXPECTATIONS)) {
    if ((exp.admin || 0) > 0 && !enforceSql.includes(`'public.${table}'`) && !enforceSql.includes(`public.${table}`)) {
      issues.push({ type: "enforce_table_missing", table, severity: "warning" });
    }
  }

  const criticalFromIssues = issues.filter((i) => i.severity === "critical");
  const allCritical = [...critical, ...criticalFromIssues];
  const ok = allCritical.length === 0;

  const report = {
    ok,
    criticalCount: allCritical.length,
    warningCount: issues.filter((i) => i.severity !== "critical").length,
    expectedEnforcePolicies: expectedEnforce,
    foundEnforcePolicyRefs: enforceApplyCount,
    expectedOwnPolicies: countExpectedOwnPolicies(),
    inventoryTables: Object.keys(RLS_TABLE_INVENTORY).length,
    issues: [...allCritical, ...issues],
    migrationsChecked: MIGRATIONS.filter((m) => existsSync(join(ROOT, "supabase/migrations", m))),
  };

  const outPath = join(ROOT, "scripts/iam/.artifacts/rls-coverage-validation.json");
  mkdirSync(join(ROOT, "scripts/iam/.artifacts"), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log(JSON.stringify(report, null, 2));
  process.exit(ok ? 0 : 1);
}

main();
