/**
 * Static tests for IAM RLS migration files and permission map.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  RLS_TABLE_INVENTORY,
  countExpectedEnforcePolicies,
  countExpectedOwnPolicies,
  tablesRequiringRlsEnable,
} from "../lib/iam/rls-permission-map.js";
import { IAM_PERMISSIONS } from "../lib/iam/constants.js";

const ROOT = process.cwd();
const M = (name) => join(ROOT, "supabase/migrations", name);

function read(name) {
  return readFileSync(M(name), "utf8");
}

const catalogIds = new Set(Object.values(IAM_PERMISSIONS));

describe("IAM RLS static package", () => {
  it("ownership migration exists with transaction wrapper", () => {
    const sql = read("20260804_iam_rls_user_ownership_policies.sql");
    assert.match(sql, /BEGIN;/);
    assert.match(sql, /COMMIT;/);
    assert.match(sql, /iam_own_profiles_select/);
  });

  it("enforce migration is complete with post-checks", () => {
    const sql = read("20260804_iam_rls_enforce_policies.sql");
    assert.match(sql, /BEGIN;/);
    assert.match(sql, /RAISE EXCEPTION/);
    assert.doesNotMatch(sql, /iam_is_admin\(\)/);
    assert.match(sql, /iam_enforce_profiles_admin_select/);
    assert.match(sql, /iam_enforce_partner_withdrawals_admin_select/);
    assert.match(sql, /iam_enforce_admin_user_notes_admin_select/);
  });

  it("enable migration requires policies before RLS", () => {
    const sql = read("20260804_iam_rls_enable_business_tables.sql");
    assert.match(sql, /_iam_require_policies_before_rls/);
    assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  });

  it("rollback restores dual and preserves own", () => {
    const sql = read("20260804_iam_rls_rollback.sql");
    assert.match(sql, /iam_dual_profiles_admin_select/);
    assert.match(sql, /iam_own_profiles_select/);
  });

  it("functions migration hardens search_path and grants", () => {
    const sql = read("20260804_iam_rls_functions.sql");
    assert.match(sql, /SET search_path = public, pg_temp/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.iam_has_permission/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.iam_has_permission/);
  });

  it("permission map uses catalog permissions only", () => {
    for (const [table, spec] of Object.entries(RLS_TABLE_INVENTORY)) {
      const p = spec.policies || {};
      for (const val of Object.values(p)) {
        if (typeof val !== "string") continue;
        const m = val.match(/^[\w.]+$/);
        if (m && val.includes(".")) {
          assert.ok(catalogIds.has(val), `${table}: permission ${val} not in catalog`);
        }
      }
    }
  });

  it("expected policy counts are non-zero", () => {
    assert.ok(countExpectedEnforcePolicies() >= 40);
    assert.ok(countExpectedOwnPolicies() >= 10);
    assert.ok(tablesRequiringRlsEnable().length >= 10);
  });

  it("test-iam-rls.sql is not a stub", () => {
    const sql = readFileSync(join(ROOT, "scripts/test-iam-rls.sql"), "utf8");
    assert.ok(sql.length > 2000, "test-iam-rls.sql too short");
    assert.match(sql, /ROLLBACK/);
    assert.match(sql, /iam_has_permission/);
  });

  it("coverage validator script exists", () => {
    assert.ok(existsSync(join(ROOT, "scripts/iam/validate-rls-coverage.mjs")));
  });
});
