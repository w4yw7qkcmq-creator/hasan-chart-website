#!/usr/bin/env node
/**
 * IAM Phase 2A — session touch throttle + unified resolver parity tests.
 * Run: node scripts/test-iam-phase2a.js
 */
import assert from "node:assert/strict";
import { clearPermissionCache } from "../lib/iam/cache.js";
import { IAM_PERMISSIONS, IAM_DEFAULT_ORGANIZATION_ID } from "../lib/iam/constants.js";
import {
  computeEffectivePermissions,
  buildIamContextFromResolution,
  collectPermissionEffects,
} from "../lib/iam/resolve-permissions-internals.js";
import {
  buildIamContextFromUnifiedPayload,
  fetchUnifiedIamPayload,
} from "../lib/iam/resolve-unified.js";
import { touchAdminSessionActivity } from "../lib/iam/session-log.js";
import { isIamUnifiedResolverEnabled } from "../lib/iam/feature-flags.js";

const ENV_BACKUP = { ...process.env };

function test(name, fn) {
  return (async () => {
    try {
      await fn();
      console.log(`PASS ${name}`);
    } catch (error) {
      console.error(`FAIL ${name}:`, error.message);
      process.exitCode = 1;
    }
  })();
}

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ENV_BACKUP)) delete process.env[key];
  }
  Object.assign(process.env, ENV_BACKUP);
}

function mockTouchSupabase(scenario) {
  let rpcCalls = 0;
  let legacyUpdates = 0;
  return {
    rpcCalls: () => rpcCalls,
    legacyUpdates: () => legacyUpdates,
    rpc(name, args) {
      rpcCalls += 1;
      if (scenario.rpcError) {
        return Promise.resolve({ data: null, error: { message: scenario.rpcError } });
      }
      if (scenario.rpcMissing) {
        return Promise.resolve({ data: null, error: { message: "function touch_admin_session_activity_if_stale does not exist" } });
      }
      return Promise.resolve({ data: scenario.rpcResult || { touched: true, throttled: false, found: true }, error: null });
    },
    from(table) {
      return {
        update() {
          legacyUpdates += 1;
          return {
            eq() {
              return {
                eq() {
                  return { is: async () => ({ error: null }) };
                },
              };
            },
          };
        },
      };
    },
  };
}

function setsEqual(a, b) {
  return a.size === b.size && [...a].every((v) => b.has(v));
}

function compareIamContexts(label, a, b) {
  assert.equal(a.isAdmin, b.isAdmin, `${label}: isAdmin`);
  assert.equal(a.isSuperAdmin, b.isSuperAdmin, `${label}: isSuperAdmin`);
  assert.equal(a.hasActiveAssignment, b.hasActiveAssignment, `${label}: hasActiveAssignment`);
  assert.equal(a.source, b.source, `${label}: source`);
  assert.deepEqual(a.roleIds.sort(), b.roleIds.sort(), `${label}: roleIds`);
  assert.ok(setsEqual(a.permissions, b.permissions), `${label}: permissions mismatch`);
  assert.ok(setsEqual(a.allowPermissions, b.allowPermissions), `${label}: allowPermissions`);
  assert.ok(setsEqual(a.denyPermissions, b.denyPermissions), `${label}: denyPermissions`);
}

const user = { id: "11111111-1111-1111-1111-111111111111", email: "admin@test.com" };

const MATRIX = [
  {
    name: "normal admin",
    payload: {
      assignments: [{ id: "a1", role_id: "admin" }],
      roles: [{ id: "admin", label: "مدير" }],
      role_permissions: [
        { role_id: "admin", permission_id: IAM_PERMISSIONS.USERS_READ, effect: "allow" },
        { role_id: "admin", permission_id: IAM_PERMISSIONS.EMAIL_ANALYTICS_READ, effect: "allow" },
      ],
      overrides: [],
    },
    legacyParts: {
      assignmentIds: ["a1"],
      roleIds: ["admin"],
      roleLabels: ["مدير"],
      allow: new Set([IAM_PERMISSIONS.USERS_READ, IAM_PERMISSIONS.EMAIL_ANALYTICS_READ]),
      deny: new Set(),
      hasOverrides: false,
    },
    apiEnforcement: true,
    skipLegacyMerge: true,
  },
  {
    name: "super admin via iam.manage",
    payload: {
      assignments: [{ id: "a1", role_id: "super_admin" }],
      roles: [{ id: "super_admin", label: "مدير عام" }],
      role_permissions: [{ role_id: "super_admin", permission_id: IAM_PERMISSIONS.IAM_MANAGE, effect: "allow" }],
      overrides: [],
    },
    legacyParts: {
      assignmentIds: ["a1"],
      roleIds: ["super_admin"],
      roleLabels: ["مدير عام"],
      allow: new Set([IAM_PERMISSIONS.IAM_MANAGE]),
      deny: new Set(),
      hasOverrides: false,
    },
    apiEnforcement: true,
    skipLegacyMerge: true,
  },
  {
    name: "deny override wins",
    payload: {
      assignments: [{ id: "a1", role_id: "admin" }],
      roles: [{ id: "admin", label: "مدير" }],
      role_permissions: [
        { role_id: "admin", permission_id: IAM_PERMISSIONS.USERS_READ, effect: "allow" },
        { role_id: "admin", permission_id: IAM_PERMISSIONS.USERS_BAN, effect: "allow" },
      ],
      overrides: [{ permission_id: IAM_PERMISSIONS.USERS_BAN, effect: "deny" }],
    },
    legacyParts: {
      assignmentIds: ["a1"],
      roleIds: ["admin"],
      roleLabels: ["مدير"],
      allow: new Set([IAM_PERMISSIONS.USERS_READ, IAM_PERMISSIONS.USERS_BAN]),
      deny: new Set([IAM_PERMISSIONS.USERS_BAN]),
      hasOverrides: true,
    },
    apiEnforcement: true,
    skipLegacyMerge: true,
  },
  {
    name: "user allow override",
    payload: {
      assignments: [{ id: "a1", role_id: "analyst" }],
      roles: [{ id: "analyst", label: "محلل" }],
      role_permissions: [{ role_id: "analyst", permission_id: IAM_PERMISSIONS.USERS_READ, effect: "allow" }],
      overrides: [{ permission_id: IAM_PERMISSIONS.EMAIL_ANALYTICS_READ, effect: "allow" }],
    },
    legacyParts: {
      assignmentIds: ["a1"],
      roleIds: ["analyst"],
      roleLabels: ["محلل"],
      allow: new Set([IAM_PERMISSIONS.USERS_READ, IAM_PERMISSIONS.EMAIL_ANALYTICS_READ]),
      deny: new Set(),
      hasOverrides: true,
    },
    apiEnforcement: true,
    skipLegacyMerge: true,
  },
  {
    name: "no assignment",
    payload: { assignments: [], roles: [], role_permissions: [], overrides: [] },
    legacyParts: {
      assignmentIds: [],
      roleIds: [],
      roleLabels: [],
      allow: new Set(),
      deny: new Set(),
      hasOverrides: false,
    },
    apiEnforcement: true,
    skipLegacyMerge: false,
    legacy: { isAdmin: true, roleId: "admin", roleLabel: "admin", profileRole: "admin", permissions: new Set([IAM_PERMISSIONS.USERS_READ]), isFallback: false },
    expectedSource: "legacy_blocked",
  },
  {
    name: "multiple roles",
    payload: {
      assignments: [
        { id: "a1", role_id: "analyst" },
        { id: "a2", role_id: "support" },
      ],
      roles: [
        { id: "analyst", label: "محلل" },
        { id: "support", label: "دعم" },
      ],
      role_permissions: [
        { role_id: "analyst", permission_id: IAM_PERMISSIONS.ANALYSIS_READ, effect: "allow" },
        { role_id: "support", permission_id: IAM_PERMISSIONS.SUPPORT_MANAGE, effect: "allow" },
      ],
      overrides: [],
    },
    legacyParts: {
      assignmentIds: ["a1", "a2"],
      roleIds: ["analyst", "support"],
      roleLabels: ["محلل", "دعم"],
      allow: new Set([IAM_PERMISSIONS.ANALYSIS_READ, IAM_PERMISSIONS.SUPPORT_MANAGE]),
      deny: new Set(),
      hasOverrides: false,
    },
    apiEnforcement: true,
    skipLegacyMerge: true,
  },
];

await test("deny-wins computeEffectivePermissions", () => {
  const allow = new Set(["users.read", "users.ban"]);
  const deny = new Set(["users.ban"]);
  const effective = computeEffectivePermissions(allow, deny);
  assert.equal(effective.has("users.read"), true);
  assert.equal(effective.has("users.ban"), false);
});

await test("session touch RPC first request touched", async () => {
  const supabase = mockTouchSupabase({ rpcResult: { touched: true, throttled: false, found: true } });
  const result = await touchAdminSessionActivity(supabase, { token: "tok", userId: user.id });
  assert.equal(result.touched, true);
  assert.equal(result.throttled, false);
  assert.equal(supabase.rpcCalls(), 1);
});

await test("session touch RPC throttled within threshold", async () => {
  const supabase = mockTouchSupabase({ rpcResult: { touched: false, throttled: true, found: true } });
  const result = await touchAdminSessionActivity(supabase, { token: "tok", userId: user.id });
  assert.equal(result.touched, false);
  assert.equal(result.throttled, true);
});

await test("session touch falls back to legacy UPDATE when RPC missing", async () => {
  const supabase = mockTouchSupabase({ rpcMissing: true });
  const result = await touchAdminSessionActivity(supabase, { token: "tok", userId: user.id });
  assert.equal(result.touched, true);
  assert.equal(result.path, "legacy_update");
  assert.equal(supabase.legacyUpdates(), 1);
});

await test("session touch DB error is non-blocking", async () => {
  const supabase = mockTouchSupabase({ rpcError: "db_down" });
  const result = await touchAdminSessionActivity(supabase, { token: "tok", userId: user.id });
  assert.equal(result.touched, false);
  assert.ok(result.error);
});

await test("fetchUnifiedIamPayload handles rpc missing", async () => {
  const supabase = {
    rpc: async () => ({ data: null, error: { message: "function resolve_iam_context_v2 does not exist" } }),
  };
  const result = await fetchUnifiedIamPayload(supabase, user.id, IAM_DEFAULT_ORGANIZATION_ID);
  assert.equal(result.ok, false);
  assert.equal(result.error, "rpc_missing");
});

await test("IAM unified resolver enabled by default when IAM_API on", () => {
  process.env.IAM_API = "true";
  process.env.IAM_UNIFIED_RESOLVER = "";
  assert.equal(isIamUnifiedResolverEnabled(), true);
  process.env.IAM_UNIFIED_RESOLVER = "false";
  assert.equal(isIamUnifiedResolverEnabled(), false);
  restoreEnv();
});

for (const scenario of MATRIX) {
  await test(`IAM parity matrix: ${scenario.name}`, () => {
    clearPermissionCache();
    const unified = buildIamContextFromUnifiedPayload(scenario.payload, user, {
      organizationId: IAM_DEFAULT_ORGANIZATION_ID,
      apiEnforcement: scenario.apiEnforcement,
      legacy: scenario.legacy || null,
      skipLegacyMerge: scenario.skipLegacyMerge,
    });

    const legacy = buildIamContextFromResolution({
      user,
      organizationId: IAM_DEFAULT_ORGANIZATION_ID,
      ...scenario.legacyParts,
      tableMissing: false,
      legacy: scenario.legacy || null,
      apiEnforcement: scenario.apiEnforcement,
      skipLegacyMerge: scenario.skipLegacyMerge,
      resolverPath: "legacy",
    });

    compareIamContexts(scenario.name, unified, legacy);

    if (scenario.expectedSource) {
      assert.equal(unified.source, scenario.expectedSource);
    }

    if (scenario.name === "deny override wins") {
      assert.equal(unified.permissions.has(IAM_PERMISSIONS.USERS_BAN), false);
      assert.equal(unified.permissions.has(IAM_PERMISSIONS.USERS_READ), true);
    }
  });
}

await test("collectPermissionEffects respects deny", () => {
  const { allow, deny } = collectPermissionEffects([
    { permission_id: "a", effect: "allow" },
    { permission_id: "b", effect: "deny" },
  ]);
  assert.deepEqual([...allow], ["a"]);
  assert.deepEqual([...deny], ["b"]);
});

console.log("\nPhase 2A IAM tests complete.");
