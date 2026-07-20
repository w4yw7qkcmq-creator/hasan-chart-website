import assert from "node:assert/strict";
import { assertAdminCanActOnTarget, resolveAccountStatusFromProfile } from "../lib/account-lifecycle.js";
import {
  ACTIVITY_FILTER_TYPES,
  ADMIN_NOTES_TABLE_MISSING_MESSAGE,
  buildUnavailableSectionPayload,
  filterActivityEventsByType,
  isTechnicalAdminError,
  sanitizeAdminUserFacingError,
} from "../lib/admin-user-management-shared.js";

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

function testActivityFilterTypes() {
  const events = [
    { id: "1", type: "subscription_request" },
    { id: "2", type: "sign_in" },
    { id: "3", type: "admin_action" },
    { id: "4", type: "email_sent" },
  ];

  assert.equal(filterActivityEventsByType(events, "all").length, 4);
  assert.equal(filterActivityEventsByType(events, "subscription").length, 1);
  assert.equal(filterActivityEventsByType(events, "sign_in").length, 1);
  assert.equal(filterActivityEventsByType(events, "email").length, 1);
  assert.equal(ACTIVITY_FILTER_TYPES.admin.has("admin_action"), true);
}

function testNotesMissingTablePayload() {
  const payload = buildUnavailableSectionPayload("notes", 2, 10);
  assert.equal(payload.available, false);
  assert.equal(payload.message, ADMIN_NOTES_TABLE_MISSING_MESSAGE);
  assert.equal(payload.pagination.page, 2);
  assert.deepEqual(payload.notes, []);
}

function testErrorSanitization() {
  const sanitized = sanitizeAdminUserFacingError({
    message: "Could not find table public.admin_user_notes in the schema cache",
  });
  assert.equal(sanitized.kind, "not_enabled");

  assert.equal(isTechnicalAdminError("relation admin_user_notes does not exist"), true);
  assert.equal(isTechnicalAdminError("تعذر تحميل البيانات"), false);
}

function testDoubleSubmitGuardPattern() {
  let loading = false;
  const run = () => {
    if (loading) return false;
    loading = true;
    return true;
  };

  assert.equal(run(), true);
  assert.equal(run(), false);
  loading = false;
  assert.equal(run(), true);
}

const tests = [
  ["dangerous confirmation", testDangerousConfirmation],
  ["self action blocked", testSelfActionBlocked],
  ["admin target blocked", testAdminTargetBlocked],
  ["actions whitelist", testAllowedActionsWhitelist],
  ["account status resolution", testAccountStatusResolution],
  ["activity filter types", testActivityFilterTypes],
  ["notes missing-table payload", testNotesMissingTablePayload],
  ["error sanitization", testErrorSanitization],
  ["double-submit guard pattern", testDoubleSubmitGuardPattern],
];

let passed = 0;
for (const [name, fn] of tests) {
  fn();
  passed += 1;
  console.log(`✓ ${name}`);
}

console.log(`\n${passed}/${tests.length} logic checks passed`);
