/**
 * IAM / RBAC unit tests — run: node --test scripts/test-iam-rbac.js
 */
import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  computeEffectivePermissions,
  iamContextCan,
  iamContextCanAny,
} from "../lib/iam/resolve-permissions.js";
import { getIamFeatureFlags, isIamApiEnabled } from "../lib/iam/feature-flags.js";
import {
  clearPermissionCache,
  setCachedPermissions,
  getCachedPermissions,
} from "../lib/iam/cache.js";
import { permissionForLifecycleAction } from "../lib/iam/action-permissions.js";
import { getAllRoutePermissions, permissionForRoute } from "../lib/iam/route-permissions.js";
import { IAM_PERMISSIONS, PERMISSION_EFFECT } from "../lib/iam/constants.js";
import { getLegacyPermissionMap } from "../lib/iam/legacy-auth.js";
import { hasAdminPermission } from "../lib/admin-permissions.js";

describe("IAM permission resolver", () => {
  it("deny wins over allow", () => {
    const effective = computeEffectivePermissions(
      new Set(["users.read", "users.ban"]),
      new Set(["users.ban"])
    );
    assert.equal(effective.has("users.read"), true);
    assert.equal(effective.has("users.ban"), false);
  });

  it("iamContextCan checks effective set", () => {
    const ctx = {
      permissions: new Set(["finance.read"]),
    };
    assert.equal(iamContextCan(ctx, "finance.read"), true);
    assert.equal(iamContextCan(ctx, "users.ban"), false);
  });

  it("iamContextCanAny", () => {
    const ctx = { permissions: new Set(["users.read"]) };
    assert.equal(iamContextCanAny(ctx, ["users.ban", "users.read"]), true);
  });
});

describe("IAM cache", () => {
  beforeEach(() => clearPermissionCache());

  it("stores and retrieves cached context", () => {
    const value = { userId: "u1", permissions: new Set(["iam.read"]) };
    setCachedPermissions("u1", "org1", value, 60_000);
    const cached = getCachedPermissions("u1", "org1");
    assert.equal(cached.userId, "u1");
  });
});

describe("IAM route permissions matrix", () => {
  it("maps admin dashboard GET", () => {
    assert.equal(
      permissionForRoute("GET", "/api/admin/dashboard"),
      IAM_PERMISSIONS.DASHBOARD_READ
    );
  });

  it("maps user management actions POST", () => {
    assert.equal(
      permissionForRoute("POST", "/api/admin/user-management/550e8400-e29b-41d4-a716-446655440000/actions"),
      IAM_PERMISSIONS.USERS_MANAGE
    );
  });

  it("has entries for all major admin routes", () => {
    const routes = getAllRoutePermissions();
    assert.ok(routes["GET /api/admin/dashboard"]);
    assert.ok(routes["GET /api/iam/roles"]);
    assert.ok(Object.keys(routes).length >= 40);
  });
});

describe("IAM lifecycle action permissions", () => {
  it("maps ban_user to users.ban", () => {
    assert.equal(permissionForLifecycleAction("ban_user"), "users.ban");
  });

  it("maps suspend_user to users.manage", () => {
    assert.equal(permissionForLifecycleAction("suspend_user"), "users.manage");
  });
});

describe("Legacy compatibility map", () => {
  it("legacy support role cannot ban", () => {
    assert.equal(hasAdminPermission("support", "users.ban"), false);
    assert.equal(hasAdminPermission("support", "users.manage"), true);
  });

  it("legacy permission map exports", () => {
    const map = getLegacyPermissionMap();
    assert.ok(map.ADMIN_PERMISSIONS);
  });
});

describe("IAM feature flags", () => {
  it("returns flag object", () => {
    const flags = getIamFeatureFlags();
    assert.equal(typeof flags.IAM_API, "boolean");
    assert.equal(typeof flags.dualRead, "boolean");
  });

  it("IAM_API defaults off in test env", () => {
    assert.equal(isIamApiEnabled(), false);
  });
});

describe("Permission effect constants", () => {
  it("allow and deny values", () => {
    assert.equal(PERMISSION_EFFECT.ALLOW, "allow");
    assert.equal(PERMISSION_EFFECT.DENY, "deny");
  });
});

console.log("IAM RBAC tests loaded");
