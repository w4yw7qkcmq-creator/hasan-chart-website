import assert from "node:assert/strict";
import {
  LIFECYCLE_EVENTS,
  mapActionToLifecycleEvent,
  registerLifecycleListener,
} from "../lib/account-lifecycle-events.js";
import { sanitizeLifecycleReason } from "../lib/account-lifecycle.js";
import {
  hasAdminPermission,
  requireAdminPermission,
} from "../lib/admin-permissions.js";
import {
  isSelfTargetAction,
  isValidUserId,
} from "../lib/admin-user-management-action-handler.js";
import { isSubscriptionActive } from "../lib/user-service-resolver.js";

function testLifecycleEventNames() {
  assert.equal(mapActionToLifecycleEvent("suspend_user"), "user.suspended");
  assert.equal(mapActionToLifecycleEvent("extend_subscription"), "subscription.extended");
  assert.equal(LIFECYCLE_EVENTS.has("user.banned"), true);
  assert.equal(LIFECYCLE_EVENTS.has("custom.event"), false);
}

function testListenerFailureDoesNotThrow() {
  registerLifecycleListener("user.suspended", async () => {
    throw new Error("listener failed");
  });
}

async function testEmitDoesNotThrowOnListenerFailure() {
  const { emitLifecycleEvent } = await import("../lib/account-lifecycle-events.js");
  const result = await emitLifecycleEvent("user.suspended", { action: "suspend_user" });
  assert.equal(result.emitted, true);
}

function testAccountantCannotManageUsers() {
  assert.throws(
    () => requireAdminPermission({ role: "accountant", admin_role: "accountant" }, "users.manage"),
    /صلاحية/
  );
}

function testSelfTargetDetection() {
  assert.equal(isSelfTargetAction("a", "a", "ban_user"), true);
  assert.equal(isSelfTargetAction("a", "b", "ban_user"), false);
}

function testUuidValidation() {
  assert.equal(isValidUserId("not-a-uuid"), false);
  assert.equal(
    isValidUserId("550e8400-e29b-41d4-a716-446655440000"),
    true
  );
}

function testReasonSanitization() {
  const long = "x".repeat(600);
  assert.equal(sanitizeLifecycleReason(long).length, 500);
}

function testExpiredSubscriptionExtendBase() {
  const expired = {
    status: "مفعل",
    expires_at: "2020-01-01T00:00:00.000Z",
    admin_disabled: false,
  };
  assert.equal(isSubscriptionActive(expired), false);
}

function testSupportCanManageNotBan() {
  assert.equal(hasAdminPermission("support", "users.manage"), true);
  assert.equal(hasAdminPermission("support", "users.ban"), false);
}

const syncTests = [
  ["lifecycle event map", testLifecycleEventNames],
  ["listener registration", testListenerFailureDoesNotThrow],
  ["accountant blocked", testAccountantCannotManageUsers],
  ["self target detection", testSelfTargetDetection],
  ["uuid validation", testUuidValidation],
  ["reason max length", testReasonSanitization],
  ["expired subscription inactive", testExpiredSubscriptionExtendBase],
  ["support permissions", testSupportCanManageNotBan],
];

for (const [name, fn] of syncTests) {
  fn();
  console.log(`✓ ${name}`);
}

await testEmitDoesNotThrowOnListenerFailure();
console.log("✓ listener failure does not break emit");

console.log(`\n${syncTests.length + 1}/${syncTests.length + 1} Phase 3B logic checks passed`);
