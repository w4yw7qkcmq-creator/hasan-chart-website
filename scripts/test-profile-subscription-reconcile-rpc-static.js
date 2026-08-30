#!/usr/bin/env node
/**
 * Static security tests for profile subscription reconcile RPC migration.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MIGRATION = "20260830120000_profile_subscription_reconcile_rpc.sql";
const FN_SIG = "public.reconcile_profile_subscription_from_requests(text)";
const sql = readFileSync(join(ROOT, "supabase/migrations", MIGRATION), "utf8");

describe("profile subscription reconcile RPC migration", () => {
  it("wraps in transaction", () => {
    assert.match(sql, /BEGIN;/);
    assert.match(sql, /COMMIT;/);
  });

  it("extends trigger with reconcile flag bypass for subscription cache only", () => {
    assert.match(sql, /app\.profile_subscription_reconcile/);
    assert.match(sql, /NEW\.role := OLD\.role;/);
    assert.match(sql, /NEW\.subscription_plan := OLD\.subscription_plan;/);
    assert.match(sql, /NEW\.subscription_status := OLD\.subscription_status;/);
  });

  it("RPC is SECURITY DEFINER with hardened search_path", () => {
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.reconcile_profile_subscription_from_requests/);
    assert.match(sql, /SECURITY DEFINER/);
    assert.match(sql, /SET search_path = public, pg_temp/);
  });

  it("RPC derives state from subscription_requests only", () => {
    assert.match(sql, /FROM public\.subscription_requests sr/);
    assert.match(sql, /sr\.status IN \('مفعل', 'نشط', 'active'\)/);
    assert.match(sql, /coalesce\(sr\.admin_disabled, false\) = false/);
    assert.match(sql, /sr\.expires_at IS NULL OR sr\.expires_at > now\(\)/);
    assert.doesNotMatch(sql, /p_subscription_status/i);
    assert.doesNotMatch(sql, /p_subscription_plan/i);
  });

  it("RPC sets reconcile flag locally before profile update", () => {
    assert.match(sql, /set_config\('app\.profile_subscription_reconcile', '1', true\)/);
  });

  it("RPC returns profile_matched verification payload", () => {
    assert.match(sql, /'profile_matched'/);
    assert.match(sql, /'expected_status'/);
    assert.match(sql, /'actual_status'/);
  });

  it("revokes PUBLIC execute", () => {
    assert.match(
      sql,
      new RegExp(`REVOKE ALL ON FUNCTION ${FN_SIG.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} FROM PUBLIC`, "i")
    );
  });

  it("grants execute to service_role only", () => {
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.reconcile_profile_subscription_from_requests\(text\)\s+TO service_role;/);
    assert.match(sql, /REVOKE EXECUTE ON FUNCTION public\.reconcile_profile_subscription_from_requests\(text\) FROM anon;/);
    assert.match(sql, /REVOKE EXECUTE ON FUNCTION public\.reconcile_profile_subscription_from_requests\(text\) FROM authenticated;/);
    assert.doesNotMatch(sql, /TO authenticated/);
    assert.doesNotMatch(sql, /TO anon/);
  });
});

describe("profile subscription reconcile helper security contract", () => {
  it("uses RPC instead of direct profiles.update", () => {
    const helper = readFileSync(join(ROOT, "lib/admin-subscription-profile-reconcile.js"), "utf8");
    assert.match(helper, /reconcile_profile_subscription_from_requests/);
    assert.doesNotMatch(helper, /\.from\("profiles"\)\s*\n\s*\.update\(/);
    assert.match(helper, /PROFILE_SUBSCRIPTION_RECONCILE_MISMATCH/);
  });

  it("worker reconcile uses RPC instead of direct profiles.update", () => {
    const worker = readFileSync(join(ROOT, "worker/subscription-expiry-shared.js"), "utf8");
    assert.match(worker, /reconcile_profile_subscription_from_requests/);
    assert.doesNotMatch(worker, /\.from\("profiles"\)\s*\n\s*\.update\(/);
  });
});

console.log("test-profile-subscription-reconcile-rpc-static: loaded");
