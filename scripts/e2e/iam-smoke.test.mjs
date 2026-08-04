#!/usr/bin/env node
/**
 * IAM E2E smoke tests (unit-level, no live DB required for core logic).
 * Run: node --test scripts/e2e/iam-smoke.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeEffectivePermissions } from "../../lib/iam/resolve-permissions.js";
import { getBootstrapState } from "../../lib/iam/bootstrap.js";
import { getAllRoutePermissions, getAllActionRoutePermissions } from "../../lib/iam/route-permissions.js";
import { IAM_PERMISSIONS } from "../../lib/iam/constants.js";

describe("IAM E2E smoke — permission engine", () => {
  it("multi-role union with deny priority", () => {
    const allow = new Set(["users.read", "users.manage", "finance.read"]);
    const deny = new Set(["finance.read"]);
    const effective = computeEffectivePermissions(allow, deny);
    assert.equal(effective.has("users.manage"), true);
    assert.equal(effective.has("finance.read"), false);
  });

  it("permission matrix includes IAM management routes", () => {
    const routes = getAllRoutePermissions();
    const actions = getAllActionRoutePermissions();
    assert.equal(actions["POST /api/iam/assignments"].grant, IAM_PERMISSIONS.IAM_ASSIGNMENTS_GRANT);
    assert.equal(routes["POST /api/iam/bootstrap"], IAM_PERMISSIONS.IAM_MANAGE);
  });
});

describe("IAM E2E smoke — bootstrap state (no DB)", () => {
  it("getBootstrapState handles missing supabase gracefully", async () => {
    const state = await getBootstrapState(null);
    assert.equal(typeof state.completed, "boolean");
  });
});
