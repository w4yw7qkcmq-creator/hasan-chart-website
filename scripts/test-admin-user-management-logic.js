import assert from "node:assert/strict";
import { assertAdminCanActOnTarget, resolveAccountStatusFromProfile } from "../lib/account-lifecycle.js";

const DANGEROUS_ACTIONS = new Set(["ban_user", "soft_delete_user"]);

function validateDangerousActionConfirmation(action, targetEmail, confirmEmail) {
  if (!DANGEROUS_ACTIONS.has(action)) return true;
  return String(confirmEmail || "").trim().toLowerCase() === String(targetEmail || "").trim().toLowerCase();
}

const ADMIN_USER_ACTIONS = new Set([
  "suspend_user",
  "unsuspend_user",
  "ban_user",
  "unban_user",
  "soft_delete_user",
  "restore_user",
  "force_logout",
  "password_reset_requested",
  "activate_service",
  "deactivate_service",
  "activate_subscription",
  "deactivate_subscription",
  "reactivate_subscription",
  "extend_subscription",
  "change_plan",
  "cancel_subscription",
  "send_user_notification",
]);

function testDangerousConfirmation() {
  assert.equal(validateDangerousActionConfirmation("ban_user", "user@test.com", "user@test.com"), true);
  assert.equal(validateDangerousActionConfirmation("ban_user", "user@test.com", "wrong@test.com"), false);
  assert.equal(validateDangerousActionConfirmation("suspend_user", "user@test.com", ""), true);
}

function testSelfActionBlocked() {
  assert.throws(
    () => assertAdminCanActOnTarget({ id: "admin-1" }, "admin-1"),
    /حسابك الشخصي/
  );
}

function testAdminTargetBlocked() {
  assert.throws(
    () => assertAdminCanActOnTarget({ id: "admin-1" }, "user-2", { role: "admin" }),
    /حساب مدير/
  );
}

function testAllowedActionsWhitelist() {
  assert.equal(ADMIN_USER_ACTIONS.has("suspend_user"), true);
  assert.equal(ADMIN_USER_ACTIONS.has("send_user_notification"), true);
  assert.equal(ADMIN_USER_ACTIONS.has("drop_database"), false);
}

function testAccountStatusResolution() {
  assert.equal(resolveAccountStatusFromProfile({ account_status: "suspended" }, null), "suspended");
  assert.equal(
    resolveAccountStatusFromProfile(null, { banned_until: new Date(Date.now() + 86400000).toISOString() }),
    "banned"
  );
  assert.equal(resolveAccountStatusFromProfile({ account_status: "active" }, null), "active");
}

const tests = [
  ["dangerous confirmation", testDangerousConfirmation],
  ["self action blocked", testSelfActionBlocked],
  ["admin target blocked", testAdminTargetBlocked],
  ["actions whitelist", testAllowedActionsWhitelist],
  ["account status resolution", testAccountStatusResolution],
];

let passed = 0;
for (const [name, fn] of tests) {
  fn();
  passed += 1;
  console.log(`✓ ${name}`);
}

console.log(`\n${passed}/${tests.length} logic checks passed`);
