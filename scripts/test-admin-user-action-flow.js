import assert from "node:assert/strict";
import {
  buildAdminActionKey,
  createAdminActionInFlightRegistry,
  resolveAdminActionMessages,
  resolveAdminActionToastOutcome,
  runAdminUserActionFlow,
  runIsolatedPostActionRefresh,
  shouldBlockDuplicateAdminAction,
} from "../lib/admin-user-action-flow.js";

async function testActionFlowApiSuccessRefreshSuccess() {
  let refreshRuns = 0;
  const registry = createAdminActionInFlightRegistry();

  const result = await runAdminUserActionFlow({
    actionKey: buildAdminActionKey({
      action: "deactivate_service",
      userId: "user-1",
      serviceKey: "vip_spot",
    }),
    inFlightRegistry: registry,
    execute: async () => ({ message: "تم إيقاف VIP Spot بنجاح" }),
    refresh: async () => {
      refreshRuns += 1;
    },
    successMessage: "تم إيقاف VIP Spot بنجاح",
    errorMessage: "تعذر إيقاف VIP Spot",
  });

  assert.equal(result.success, true);
  assert.equal(result.refreshFailed, false);
  assert.equal(refreshRuns, 1);
}

async function testActionFlowApiSuccessRefreshFailure() {
  const registry = createAdminActionInFlightRegistry();

  const result = await runAdminUserActionFlow({
    actionKey: buildAdminActionKey({
      action: "activate_service",
      userId: "user-2",
      serviceKey: "account_management",
    }),
    inFlightRegistry: registry,
    execute: async () => ({ message: "تم تفعيل إدارة الحسابات بنجاح" }),
    refresh: async () => {
      throw new Error("refresh failed");
    },
    successMessage: "تم تفعيل إدارة الحسابات بنجاح",
    errorMessage: "تعذر تفعيل إدارة الحسابات",
  });

  assert.equal(result.success, true);
  assert.equal(result.refreshFailed, true);
}

async function testActionFlowApiFailure() {
  const registry = createAdminActionInFlightRegistry();

  const result = await runAdminUserActionFlow({
    actionKey: buildAdminActionKey({
      action: "deactivate_service",
      userId: "user-3",
      serviceKey: "academy",
    }),
    inFlightRegistry: registry,
    execute: async () => {
      throw new Error("API failed");
    },
    refresh: async () => {
      throw new Error("should not run");
    },
    errorMessage: "تعذر إيقاف الأكاديمية",
  });

  assert.equal(result.success, false);
  assert.match(result.errorMessage, /تعذر إيقاف الأكاديمية/);
}

async function testActionFlowDuplicateBlocked() {
  const registry = createAdminActionInFlightRegistry();
  const actionKey = buildAdminActionKey({
    action: "extend_subscription",
    userId: "user-4",
    subscriptionId: "sub-1",
  });

  registry.add(actionKey);
  const result = await runAdminUserActionFlow({
    actionKey,
    inFlightRegistry: registry,
    execute: async () => ({ message: "ok" }),
  });
  registry.delete(actionKey);

  assert.equal(result.blocked, true);
  assert.equal(result.success, false);
}

function testActionMessagesForServices() {
  const vipSpot = resolveAdminActionMessages({ action: "deactivate_service", serviceKey: "vip_spot" });
  assert.match(vipSpot.success, /VIP Spot/);
  assert.match(vipSpot.error, /VIP Spot/);

  const academy = resolveAdminActionMessages({ action: "activate_service", serviceKey: "academy" });
  assert.match(academy.success, /الأكاديمية/);

  const account = resolveAdminActionMessages({ action: "activate_service", serviceKey: "account_management" });
  assert.match(account.success, /إدارة الحسابات/);

  const alerts = resolveAdminActionMessages({ action: "deactivate_service", serviceKey: "alerts" });
  assert.match(alerts.error, /التنبيهات/);
}

function testToastOutcomePreservesSuccessOnRefreshFailureScenario() {
  const success = resolveAdminActionToastOutcome({
    actionSucceeded: true,
    successMessage: "تم إيقاف VIP Spot بنجاح",
  });
  assert.equal(success.type, "success");

  const failure = resolveAdminActionToastOutcome({
    actionSucceeded: false,
    actionErrorMessage: "تعذر إيقاف VIP Futures",
  });
  assert.equal(failure.type, "error");
  assert.match(failure.body, /VIP Futures/);
}

function testDuplicateSubmitGuard() {
  assert.equal(shouldBlockDuplicateAdminAction({ inFlight: true }), true);
  assert.equal(shouldBlockDuplicateAdminAction({ actionLoading: "ban_user" }), true);
}

async function testPostActionRefreshIsolation() {
  const ok = await runIsolatedPostActionRefresh(async () => {});
  assert.equal(ok.ok, true);

  const failed = await runIsolatedPostActionRefresh(async () => {
    throw new Error("refresh failed");
  });
  assert.equal(failed.ok, false);
}

const tests = [
  ["action messages for services", testActionMessagesForServices],
  ["toast outcome success/failure", testToastOutcomePreservesSuccessOnRefreshFailureScenario],
  ["duplicate submit guard", testDuplicateSubmitGuard],
];

for (const [name, fn] of tests) {
  fn();
  console.log(`✓ ${name}`);
}

await testActionFlowApiSuccessRefreshSuccess();
console.log("✓ API success + refresh success => success");

await testActionFlowApiSuccessRefreshFailure();
console.log("✓ API success + refresh failure => success without failure toast");

await testActionFlowApiFailure();
console.log("✓ API failure => failure result");

await testActionFlowDuplicateBlocked();
console.log("✓ duplicate action blocked");

await testPostActionRefreshIsolation();
console.log("✓ post-action refresh isolation");

console.log(`\n${tests.length + 5}/${tests.length + 5} admin action flow checks passed`);
