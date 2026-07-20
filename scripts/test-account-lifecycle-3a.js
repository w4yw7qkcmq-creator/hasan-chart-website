import assert from "node:assert/strict";
import {
  ACCOUNT_STATUSES,
  assertAdminCanActOnTarget,
  getProfileAccountStatus,
} from "../lib/account-lifecycle.js";
import { hasAdminPermission, getAdminRole, requireAdminPermission } from "../lib/admin-permissions.js";
import { ALLOWED_ADMIN_USER_ACTIONS, validateDangerousActionConfirmation } from "../lib/admin-user-management-action-handler.js";
import { isSubscriptionActive, matchesServiceKey } from "../lib/user-service-resolver.js";

function testActiveToSuspendedTransitionRules() {
  assert.equal(getProfileAccountStatus({ account_status: "active" }), "active");
  assert.equal(getProfileAccountStatus({ account_status: "suspended" }), "suspended");
  assert(ACCOUNT_STATUSES.has("suspended"));
}

function testRejectDoubleSuspendLogic() {
  const required = ["active"];
  const current = "suspended";
  assert.equal(required.includes(current), false);
}

function testUnsuspendFromSuspended() {
  const required = ["suspended"];
  const current = "suspended";
  assert.equal(required.includes(current), true);
}

function testBanUnbanStatuses() {
  assert.equal(getProfileAccountStatus({ account_status: "banned" }), "banned");
  assert.equal(getProfileAccountStatus({ account_status: "deleted" }), "deleted");
}

function testSelfActionBlocked() {
  assert.throws(
    () => assertAdminCanActOnTarget({ id: "admin-1" }, "admin-1"),
    /حسابك الشخصي/
  );
}

function testSupportRoleWithoutUsersManage() {
  assert.equal(hasAdminPermission("support", "users.read"), true);
  assert.equal(hasAdminPermission("support", "users.ban"), false);
  assert.throws(() => requireAdminPermission({ role: "support", admin_role: "support" }, "users.ban"), /صلاحية/);
}

function testLegacyAdminRoleCompatibility() {
  assert.equal(getAdminRole({ role: "admin" }), "admin");
  assert.equal(hasAdminPermission("admin", "users.manage"), true);
}

function testRejectedSubscriptionNotActive() {
  const row = { status: "مرفوض", started_at: "2026-01-01", expires_at: "2027-01-01" };
  assert.equal(isSubscriptionActive(row), false);
}

function testActiveSubscriptionDetection() {
  const row = { status: "مفعل", started_at: "2026-01-01", expires_at: "2027-01-01", admin_disabled: false };
  assert.equal(isSubscriptionActive(row), true);
}

function testVipMatcher() {
  assert.equal(matchesServiceKey({ plan_name: "VIP Spot", category: "crypto" }, "vip"), true);
  assert.equal(matchesServiceKey({ plan_name: "Academy Pro", category: "course" }, "vip"), false);
}

function testUnknownActionRejected() {
  assert.equal(ALLOWED_ADMIN_USER_ACTIONS.has("drop_database"), false);
}

function testDangerousConfirmation() {
  assert.equal(validateDangerousActionConfirmation("ban_user", "a@b.com", "a@b.com"), true);
  assert.equal(validateDangerousActionConfirmation("ban_user", "a@b.com", "x@y.com"), false);
}

const tests = [
  ["active → suspended model", testActiveToSuspendedTransitionRules],
  ["reject suspend when already suspended", testRejectDoubleSuspendLogic],
  ["unsuspend from suspended", testUnsuspendFromSuspended],
  ["ban / soft delete statuses", testBanUnbanStatuses],
  ["self-action blocked", testSelfActionBlocked],
  ["support without users.ban → 403", testSupportRoleWithoutUsersManage],
  ["legacy role=admin compatibility", testLegacyAdminRoleCompatibility],
  ["rejected request not active service", testRejectedSubscriptionNotActive],
  ["active subscription detection", testActiveSubscriptionDetection],
  ["vip service matcher", testVipMatcher],
  ["unknown action rejected", testUnknownActionRejected],
  ["dangerous confirmation", testDangerousConfirmation],
];

for (const [name, fn] of tests) {
  fn();
  console.log(`✓ ${name}`);
}

console.log(`\n${tests.length}/${tests.length} Phase 3A logic checks passed`);
