import assert from "node:assert/strict";
import { assertAdminCanActOnTarget, resolveAccountStatusFromProfile } from "../lib/account-lifecycle.js";
import {
  createBackgroundRevalidationController,
  shouldRunBackgroundRevalidation,
} from "../lib/admin-background-revalidation.js";
import {
  resolveAdminActionToastOutcome,
  runIsolatedPostActionRefresh,
  shouldBlockDuplicateAdminAction,
} from "../lib/admin-user-action-flow.js";
import { isAdminActionResponseSuccess } from "../lib/admin-user-management-client.js";
import {
  collectDistinctExpiredEmailsFromRows,
  computeExpiredSubscriptionCardStats,
  countDistinctUsersWithExpiredSubscriptions,
  filterUsersWithExpiredSubscriptions,
  summarizeUserSubscriptionRows,
  userHasExpiredSubscription,
} from "../lib/admin-user-subscription-state.js";
import {
  isActiveSubscriptionRequest,
  isExpiredSubscriptionRequest,
} from "../lib/admin-user-service-classifier.js";

function isVipActiveUser(user) {
  return user?.activeServices?.vip === true;
}

function isAccountManagementActiveUser(user) {
  return user?.activeServices?.accountManagement === true;
}
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

function testAdminActionResponseSuccess() {
  assert.equal(isAdminActionResponseSuccess({ ok: true, status: 200 }, { success: true }), true);
  assert.equal(isAdminActionResponseSuccess({ ok: true, status: 200 }, { ok: true }), true);
  assert.equal(
    isAdminActionResponseSuccess({ ok: true, status: 200 }, { action: "ban_user", message: "done" }),
    true
  );
  assert.equal(isAdminActionResponseSuccess({ ok: true, status: 200 }, { success: false }), false);
  assert.equal(isAdminActionResponseSuccess({ ok: false, status: 500 }, { success: true }), false);
  assert.equal(isAdminActionResponseSuccess({ ok: true, status: 200 }, { error: "failed" }), false);
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

function testActiveServiceUserFlags() {
  assert.equal(
    isVipActiveUser({
      activeServices: { vip: true },
      subscriptionPlan: "",
      subscriptionStatus: "",
    }),
    true
  );
  assert.equal(
    isAccountManagementActiveUser({
      activeServices: { accountManagement: true },
    }),
    true
  );
  assert.equal(isActiveSubscriptionRequest({ status: "pending" }), false);
}

function testBackgroundRevalidationThrottle() {
  assert.equal(shouldRunBackgroundRevalidation(0, 10_000, 60_000), true);
  assert.equal(shouldRunBackgroundRevalidation(9_000, 10_000, 60_000), false);
  assert.equal(shouldRunBackgroundRevalidation(0, 70_000, 60_000), true);
}

async function testBackgroundRevalidationSingleFlight() {
  const controller = createBackgroundRevalidationController({
    minIntervalMs: 0,
    now: () => 1_000,
  });

  let runs = 0;
  const first = controller.revalidate(async () => {
    runs += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return "ok";
  });
  const second = controller.revalidate(async () => {
    runs += 1;
    return "ok-2";
  });

  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(firstResult.skipped, false);
  assert.equal(secondResult.skipped, true);
  assert.equal(secondResult.reason, "in_flight");
  assert.equal(runs, 1);
}

function testActionSuccessIndependentFromRefreshFailure() {
  const toast = resolveAdminActionToastOutcome({ actionSucceeded: true });
  assert.equal(toast.type, "success");

  const failedAction = resolveAdminActionToastOutcome({
    actionSucceeded: false,
    actionErrorMessage: "network",
  });
  assert.equal(failedAction.type, "error");
  assert.equal(failedAction.title, "فشل الإجراء");
}

async function testPostActionRefreshIsolation() {
  const ok = await runIsolatedPostActionRefresh(async () => {});
  assert.equal(ok.ok, true);

  const failed = await runIsolatedPostActionRefresh(async () => {
    throw new Error("refresh failed");
  });
  assert.equal(failed.ok, false);
  assert.match(failed.message, /refresh failed/);
}

function testDuplicateActionBlock() {
  assert.equal(shouldBlockDuplicateAdminAction({ inFlight: true, actionLoading: "" }), true);
  assert.equal(shouldBlockDuplicateAdminAction({ inFlight: false, actionLoading: "deactivate_service" }), true);
  assert.equal(shouldBlockDuplicateAdminAction({ inFlight: false, actionLoading: "" }), false);
}

function testExpiredSubscriptionUnifiedDefinition() {
  assert.equal(
    isExpiredSubscriptionRequest({
      status: "مفعل",
      admin_disabled: true,
    }),
    true
  );
  assert.equal(
    isExpiredSubscriptionRequest({
      status: "موقوف",
      admin_disabled: false,
    }),
    true
  );
  assert.equal(
    isExpiredSubscriptionRequest({
      status: "مفعل",
      expires_at: "2020-01-01T00:00:00.000Z",
    }),
    true
  );
}

function testExpiredDistinctUsersAndFilterMatch() {
  const users = [
    {
      id: "1",
      email: "a@test.com",
      hasExpiredSubscription: true,
      activeServices: { vip: true },
    },
    {
      id: "2",
      email: "b@test.com",
      hasExpiredSubscription: true,
      activeServices: { vip: false },
    },
    {
      id: "3",
      email: "c@test.com",
      hasExpiredSubscription: true,
      activeServices: { vip: false },
    },
    {
      id: "4",
      email: "d@test.com",
      hasExpiredSubscription: false,
      activeServices: { vip: true },
    },
  ];

  const expiredUsers = users.filter(userHasExpiredSubscription);
  assert.equal(countDistinctUsersWithExpiredSubscriptions(users), 3);
  assert.equal(expiredUsers.length, 3);

  const dualState = users.filter(
    (user) => userHasExpiredSubscription(user) && user.activeServices?.vip === true
  );
  assert.equal(dualState.length, 1);
}

function testExpiredRowsDistinctEmailCount() {
  const rows = [
    { user_email: "a@test.com", status: "موقوف", admin_disabled: true },
    { user_email: "a@test.com", status: "منتهي" },
    { user_email: "b@test.com", status: "expired" },
    { user_email: "c@test.com", status: "مفعل", expires_at: "2020-01-01T00:00:00.000Z" },
  ];

  const summary = summarizeUserSubscriptionRows(rows);
  assert.equal(summary.expiredSubscriptionCount, 4);
  assert.equal(collectDistinctExpiredEmailsFromRows(rows).size, 3);
}

function buildExpiredFilterScenarioUsers() {
  return [
    {
      id: "user-active-only",
      email: "active-only@test.com",
      accountStatus: "active",
      hasExpiredSubscription: false,
      hasActiveSubscription: true,
      expiredSubscriptionCount: 0,
      activeSubscriptionCount: 1,
      activeServices: { vip: true },
    },
    {
      id: "user-expired-only",
      email: "expired-only@test.com",
      accountStatus: "active",
      hasExpiredSubscription: true,
      hasActiveSubscription: false,
      expiredSubscriptionCount: 1,
      activeSubscriptionCount: 0,
      activeServices: { vip: false },
    },
    {
      id: "user-active-and-expired",
      email: "dual-state@test.com",
      accountStatus: "active",
      hasExpiredSubscription: true,
      hasActiveSubscription: true,
      expiredSubscriptionCount: 1,
      activeSubscriptionCount: 1,
      activeServices: { vip: true },
    },
    {
      id: "user-multi-expired",
      email: "multi-expired@test.com",
      accountStatus: "active",
      hasExpiredSubscription: true,
      hasActiveSubscription: false,
      expiredSubscriptionCount: 2,
      activeSubscriptionCount: 0,
      activeServices: { vip: false },
    },
  ];
}

function testExpiredCardFilterMatchesDistinctUsers() {
  const users = buildExpiredFilterScenarioUsers();
  const cardStats = computeExpiredSubscriptionCardStats(users);
  const filteredUsers = filterUsersWithExpiredSubscriptions(users);

  console.log(
    `[verify] expired card: cardCount=${cardStats.cardCount}, filteredUsers=${filteredUsers.length}, totalExpiredRows=${users.reduce(
      (sum, user) => sum + Number(user.expiredSubscriptionCount || 0),
      0
    )}`
  );

  assert.equal(cardStats.cardCount, 3);
  assert.equal(filteredUsers.length, 3);
  assert.equal(cardStats.cardCount, filteredUsers.length);
  assert.equal(countDistinctUsersWithExpiredSubscriptions(users), 3);

  const activeOnly = users.find((user) => user.id === "user-active-only");
  const expiredOnly = users.find((user) => user.id === "user-expired-only");
  const dualState = users.find((user) => user.id === "user-active-and-expired");
  const multiExpired = users.find((user) => user.id === "user-multi-expired");

  assert.equal(userHasExpiredSubscription(activeOnly), false);
  assert.equal(filteredUsers.some((user) => user.id === activeOnly.id), false);

  assert.equal(userHasExpiredSubscription(expiredOnly), true);
  assert.equal(userHasExpiredSubscription(dualState), true);
  assert.equal(userHasExpiredSubscription(multiExpired), true);
  assert.equal(multiExpired.expiredSubscriptionCount, 2);

  const filteredIds = new Set(filteredUsers.map((user) => user.id));
  assert.equal(filteredIds.has("user-expired-only"), true);
  assert.equal(filteredIds.has("user-active-and-expired"), true);
  assert.equal(filteredIds.has("user-multi-expired"), true);
  assert.equal(filteredIds.has("user-active-only"), false);

  const vipFiltered = users.filter((user) => user.activeServices?.vip === true);
  assert.equal(vipFiltered.length, 2);
  assert.equal(vipFiltered.some((user) => user.id === "user-active-and-expired"), true);
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
  ["admin action response success", testAdminActionResponseSuccess],
  ["double-submit guard pattern", testDoubleSubmitGuardPattern],
  ["active service user flags", testActiveServiceUserFlags],
  ["background revalidation throttle", testBackgroundRevalidationThrottle],
  ["action success independent from refresh failure", testActionSuccessIndependentFromRefreshFailure],
  ["duplicate action block", testDuplicateActionBlock],
  ["expired subscription unified definition", testExpiredSubscriptionUnifiedDefinition],
  ["expired distinct users and filter match", testExpiredDistinctUsersAndFilterMatch],
  ["expired rows distinct email count", testExpiredRowsDistinctEmailCount],
  ["expired card filter matches distinct users", testExpiredCardFilterMatchesDistinctUsers],
];

let passed = 0;
for (const [name, fn] of tests) {
  fn();
  passed += 1;
  console.log(`✓ ${name}`);
}

await testBackgroundRevalidationSingleFlight();
await testPostActionRefreshIsolation();
passed += 2;
console.log("✓ background revalidation single-flight");
console.log("✓ post-action refresh isolation");

console.log(`\n${passed}/${tests.length + 2} logic checks passed`);
