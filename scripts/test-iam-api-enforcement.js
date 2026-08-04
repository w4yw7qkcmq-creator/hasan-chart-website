/**
 * IAM_API assignment enforcement + machine identity tests.
 * Run: node --test scripts/test-iam-api-enforcement.js
 */
import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { clearPermissionCache } from "../lib/iam/cache.js";
import { IAM_PERMISSIONS } from "../lib/iam/constants.js";
import {
  hashServiceSecret,
  verifyServiceSecret,
  generateServiceSecret,
  isServiceAccountConfigured,
} from "../lib/iam/service-accounts.js";
import { SERVICE_ACCOUNT_PERMISSION_MATRIX } from "../lib/iam/service-account-permissions.js";
import {
  hasActiveIamAssignment,
  humanAdminAllowed,
} from "../lib/iam/assignment-enforcement.js";

const ENV_BACKUP = { ...process.env };

function setFlags({ db = "true", api = "false", ui = "false", rls = "false" } = {}) {
  process.env.IAM_DB = db;
  process.env.IAM_API = api;
  process.env.IAM_UI = ui;
  process.env.IAM_RLS = rls;
}

function mockSupabase(scenario) {
  const {
    assignments = [],
    rolePermissions = [],
    overrides = [],
    profile = null,
    tableMissing = false,
    resolverThrow = false,
    serviceAccount = null,
    servicePerms = [],
  } = scenario;

  return {
    from(table) {
      if (resolverThrow && table === "iam_user_assignments") {
        return {
          select: () => ({
            eq: () => ({
              is: () => ({
                or: async () => {
                  throw new Error("db_down");
                },
              }),
            }),
          }),
        };
      }

      if (table === "iam_user_assignments") {
        return {
          select: () => ({
            eq: () => ({
              is: () => ({
                or: async () => {
                  if (tableMissing) {
                    return { data: null, error: { message: 'relation "iam_user_assignments" does not exist' } };
                  }
                  return { data: assignments, error: null };
                },
              }),
            }),
          }),
        };
      }

      if (table === "iam_roles") {
        return {
          select: () => ({
            in: async () => ({
              data: assignments.map((a) => ({ id: a.role_id, label: a.role_id })),
            }),
          }),
        };
      }

      if (table === "iam_role_permissions") {
        return {
          select: () => ({
            in: async () => ({ data: rolePermissions, error: null }),
          }),
        };
      }

      if (table === "iam_user_permission_overrides") {
        return {
          select: () => ({
            eq: () => ({
              is: () => ({
                or: async () => ({ data: overrides, error: null }),
              }),
            }),
          }),
        };
      }

      if (table === "profiles") {
        return {
          select: () => ({
            or: () => ({
              maybeSingle: async () => ({ data: profile, error: null }),
            }),
          }),
        };
      }

      if (table === "iam_service_accounts") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: serviceAccount, error: null }),
            }),
          }),
        };
      }

      if (table === "iam_service_account_permissions") {
        return {
          select: () => ({
            eq: async () => ({ data: servicePerms, error: null }),
          }),
        };
      }

      if (table === "iam_security_events") {
        return { insert: async () => ({ error: null }) };
      }

      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        }),
      };
    },
  };
}

describe("IAM_API human assignment enforcement", () => {
  beforeEach(() => {
    clearPermissionCache();
    setFlags({ api: "true", db: "true" });
  });

  afterEach(() => {
    process.env = { ...ENV_BACKUP };
    clearPermissionCache();
  });

  it("1. active super_admin assignment → allow iam.manage", async () => {
    const { resolveIamContext } = await import("../lib/iam/resolve-permissions.js");
    const sb = mockSupabase({
      assignments: [{ id: "a1", role_id: "super_admin" }],
      rolePermissions: [{ role_id: "super_admin", permission_id: IAM_PERMISSIONS.IAM_MANAGE, effect: "allow" }],
    });
    const ctx = await resolveIamContext(sb, { id: "u1", email: "owner@test.com" });
    assert.equal(ctx.hasActiveAssignment, true);
    assert.equal(ctx.isSuperAdmin, true);
    assert.equal(ctx.permissions.has(IAM_PERMISSIONS.IAM_MANAGE), true);
    assert.equal(ctx.source, "iam");
  });

  it("2. active admin assignment → scoped permissions only", async () => {
    const { resolveIamContext } = await import("../lib/iam/resolve-permissions.js");
    const sb = mockSupabase({
      assignments: [{ id: "a2", role_id: "admin" }],
      rolePermissions: [
        { role_id: "admin", permission_id: IAM_PERMISSIONS.USERS_READ, effect: "allow" },
      ],
    });
    const ctx = await resolveIamContext(sb, { id: "u2", email: "admin@test.com" });
    assert.equal(ctx.hasActiveAssignment, true);
    assert.equal(ctx.permissions.has(IAM_PERMISSIONS.USERS_READ), true);
    assert.equal(ctx.permissions.has(IAM_PERMISSIONS.IAM_MANAGE), false);
  });

  it("3. profiles.role=admin without assignment → legacy_blocked, no permissions", async () => {
    const { resolveIamContext } = await import("../lib/iam/resolve-permissions.js");
    const sb = mockSupabase({
      assignments: [],
      profile: { id: "u3", email: "legacy@test.com", role: "admin", admin_role: null },
    });
    const ctx = await resolveIamContext(sb, { id: "u3", email: "legacy@test.com" });
    assert.equal(ctx.hasActiveAssignment, false);
    assert.equal(ctx.source, "legacy_blocked");
    assert.equal(ctx.legacyDetected, true);
    assert.equal(ctx.isAdmin, false);
    assert.equal(ctx.permissions.size, 0);
  });

  it("4. profiles.admin_role=admin without assignment → legacy_blocked", async () => {
    const { resolveIamContext } = await import("../lib/iam/resolve-permissions.js");
    const sb = mockSupabase({
      assignments: [],
      profile: { id: "u4", email: "arole@test.com", role: "user", admin_role: "admin" },
    });
    const ctx = await resolveIamContext(sb, { id: "u4", email: "arole@test.com" });
    assert.equal(ctx.source, "legacy_blocked");
    assert.equal(ctx.isAdmin, false);
  });

  it("5. FALLBACK email without assignment → legacy_blocked", async () => {
    const { resolveIamContext } = await import("../lib/iam/resolve-permissions.js");
    const sb = mockSupabase({
      assignments: [],
      profile: null,
    });
    const ctx = await resolveIamContext(sb, {
      id: "u5",
      email: "admin@hasanchartworld.com",
    });
    assert.equal(ctx.source, "legacy_blocked");
    assert.equal(ctx.legacyIsFallback, true);
    assert.equal(ctx.isAdmin, false);
  });

  it("6. user_metadata admin without assignment → legacy_blocked", async () => {
    const { resolveIamContext } = await import("../lib/iam/resolve-permissions.js");
    const sb = mockSupabase({
      assignments: [],
      profile: { id: "u6", email: "meta@test.com", role: "user", admin_role: null },
    });
    const ctx = await resolveIamContext(sb, {
      id: "u6",
      email: "meta@test.com",
      user_metadata: { role: "admin" },
    });
    assert.equal(ctx.isAdmin, false);
  });

  it("9. deny override removes permission", async () => {
    const { resolveIamContext } = await import("../lib/iam/resolve-permissions.js");
    const sb = mockSupabase({
      assignments: [{ id: "a9", role_id: "admin" }],
      rolePermissions: [
        { role_id: "admin", permission_id: IAM_PERMISSIONS.USERS_READ, effect: "allow" },
        { role_id: "admin", permission_id: IAM_PERMISSIONS.USERS_BAN, effect: "allow" },
      ],
      overrides: [{ permission_id: IAM_PERMISSIONS.USERS_BAN, effect: "deny" }],
    });
    const ctx = await resolveIamContext(sb, { id: "u9", email: "deny@test.com" });
    assert.equal(ctx.permissions.has(IAM_PERMISSIONS.USERS_READ), true);
    assert.equal(ctx.permissions.has(IAM_PERMISSIONS.USERS_BAN), false);
    assert.equal(ctx.source, "iam_with_overrides");
  });

  it("10. resolver error → fail-closed context", async () => {
    const { resolveIamContext } = await import("../lib/iam/resolve-permissions.js");
    const sb = mockSupabase({ resolverThrow: true });
    const ctx = await resolveIamContext(sb, { id: "u10", email: "err@test.com" });
    assert.equal(ctx.resolverError, "db_down");
    assert.equal(ctx.hasActiveAssignment, false);
    assert.equal(humanAdminAllowed(ctx), false);
  });

  it("11. missing IAM tables + IAM_API=true → fail-closed", async () => {
    const { resolveIamContext } = await import("../lib/iam/resolve-permissions.js");
    const sb = mockSupabase({ tableMissing: true });
    const ctx = await resolveIamContext(sb, { id: "u11", email: "missing@test.com" });
    assert.equal(ctx.resolverError, "iam_tables_missing");
  });

  it("12. IAM_API=false → legacy admin still allowed", async () => {
    setFlags({ api: "false", db: "true" });
    clearPermissionCache();
    const { resolveIamContext } = await import("../lib/iam/resolve-permissions.js");
    const sb = mockSupabase({
      assignments: [],
      profile: { id: "u12", email: "legacy@test.com", role: "admin", admin_role: null },
    });
    const ctx = await resolveIamContext(sb, { id: "u12", email: "legacy@test.com" });
    assert.equal(ctx.isAdmin, true);
    assert.equal(ctx.source, "legacy");
    assert.equal(ctx.permissions.size > 0, true);
  });

  it("13. normal user → not admin", async () => {
    const { resolveIamContext } = await import("../lib/iam/resolve-permissions.js");
    const sb = mockSupabase({
      assignments: [],
      profile: { id: "u13", email: "user@test.com", role: "user", admin_role: null },
    });
    const ctx = await resolveIamContext(sb, { id: "u13", email: "user@test.com" });
    assert.equal(ctx.isAdmin, false);
    assert.equal(ctx.source, "none");
  });

  it("15. active assignment wins over legacy profile conflict", async () => {
    const { resolveIamContext } = await import("../lib/iam/resolve-permissions.js");
    const sb = mockSupabase({
      assignments: [{ id: "a15", role_id: "support" }],
      rolePermissions: [
        { role_id: "support", permission_id: IAM_PERMISSIONS.USERS_READ, effect: "allow" },
      ],
      profile: { id: "u15", email: "mix@test.com", role: "admin", admin_role: "admin" },
    });
    const ctx = await resolveIamContext(sb, { id: "u15", email: "mix@test.com" });
    assert.equal(ctx.hasActiveAssignment, true);
    assert.equal(ctx.roleIds.includes("support"), true);
    assert.equal(ctx.permissions.has(IAM_PERMISSIONS.IAM_MANAGE), false);
  });
});

describe("assignment enforcement helpers", () => {
  beforeEach(() => setFlags({ api: "true", db: "true" }));
  afterEach(() => {
    process.env = { ...ENV_BACKUP };
  });

  it("hasActiveIamAssignment uses assignmentIds", () => {
    assert.equal(hasActiveIamAssignment({ assignmentIds: ["x"] }), true);
    assert.equal(hasActiveIamAssignment({ assignmentIds: [] }), false);
  });

  it("humanAdminAllowed false for legacy_blocked when IAM_API=true", () => {
    assert.equal(
      humanAdminAllowed({
        hasActiveAssignment: false,
        source: "legacy_blocked",
        legacyDetected: true,
        isAdmin: false,
      }),
      false
    );
  });

  it("humanAdminAllowed true for legacy when IAM_API=false", () => {
    setFlags({ api: "false", db: "true" });
    assert.equal(humanAdminAllowed({ isAdmin: true, hasActiveAssignment: false }), true);
  });
});

describe("Machine identity", () => {
  it("16-21 service account matrix defined", () => {
    assert.ok(SERVICE_ACCOUNT_PERMISSION_MATRIX.cron.includes(IAM_PERMISSIONS.SYSTEM_CRON_READ));
    assert.ok(SERVICE_ACCOUNT_PERMISSION_MATRIX["news-worker"].includes(IAM_PERMISSIONS.NEWS_PUBLISH));
    assert.equal(
      SERVICE_ACCOUNT_PERMISSION_MATRIX["news-worker"].includes(IAM_PERMISSIONS.IAM_MANAGE),
      false
    );
  });

  it("18. configured service account hash verifies", () => {
    const secret = generateServiceSecret();
    const hash = hashServiceSecret(secret, "cron");
    assert.equal(isServiceAccountConfigured({ enabled: true, secret_hash: hash, revoked_at: null }), true);
    assert.equal(verifyServiceSecret(secret, hash, "cron"), true);
  });

  it("19. wrong secret rejected", () => {
    const hash = hashServiceSecret("correct", "cron");
    assert.equal(verifyServiceSecret("wrong", hash, "cron"), false);
  });

  it("20. disabled service account not configured", () => {
    const hash = hashServiceSecret("x", "cron");
    assert.equal(isServiceAccountConfigured({ enabled: false, secret_hash: hash }), false);
  });

  it("21. null secret_hash not configured", () => {
    assert.equal(isServiceAccountConfigured({ enabled: true, secret_hash: null }), false);
  });

  it("25. hash does not equal plaintext secret", () => {
    const secret = generateServiceSecret();
    const hash = hashServiceSecret(secret, "cron");
    assert.notEqual(hash, secret);
  });
});

console.log("IAM API enforcement tests loaded");
