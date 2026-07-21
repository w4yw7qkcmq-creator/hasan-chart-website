import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  ADMIN_SERVICE_TYPES,
  buildActiveServiceFlagsFromRows,
  isActiveAccountManagementRequest,
  isActiveSubscriptionRequest,
  isVipServiceType,
  normalizeAdminUserServiceType,
} from "../lib/admin-user-service-classifier.js";

function testNormalizeServiceTypes() {
  assert.equal(
    normalizeAdminUserServiceType({ plan_name: "VIP Spot", category: "spot" }),
    ADMIN_SERVICE_TYPES.VIP_SPOT
  );
  assert.equal(
    normalizeAdminUserServiceType({ plan_name: "VIP Futures", category: "futures" }),
    ADMIN_SERVICE_TYPES.VIP_FUTURES
  );
  assert.equal(
    normalizeAdminUserServiceType({ plan_name: "VIP Signals", category: "signals" }),
    ADMIN_SERVICE_TYPES.VIP_SIGNALS
  );
  assert.equal(normalizeAdminUserServiceType({ plan_name: "سبوت VIP" }), ADMIN_SERVICE_TYPES.VIP_SPOT);
  assert.equal(normalizeAdminUserServiceType({ plan_name: "فيوتشر VIP" }), ADMIN_SERVICE_TYPES.VIP_FUTURES);
  assert.equal(normalizeAdminUserServiceType({ plan_name: "Private Channel VIP" }), ADMIN_SERVICE_TYPES.VIP_SIGNALS);
  assert.equal(
    normalizeAdminUserServiceType({ status: "نشط" }, { sourceTable: "account_management_requests" }),
    ADMIN_SERVICE_TYPES.ACCOUNT_MANAGEMENT
  );
  assert.equal(
    normalizeAdminUserServiceType({ plan_name: "Account Management" }),
    ADMIN_SERVICE_TYPES.ACCOUNT_MANAGEMENT
  );
  assert.equal(normalizeAdminUserServiceType({ plan_name: "إدارة الحسابات" }), ADMIN_SERVICE_TYPES.ACCOUNT_MANAGEMENT);
}

function testActiveStatuses() {
  assert.equal(
    isActiveSubscriptionRequest({
      status: "مفعل",
      admin_disabled: false,
      expires_at: "2099-01-01T00:00:00.000Z",
    }),
    true
  );
  assert.equal(isActiveSubscriptionRequest({ status: "نشط" }), true);
  assert.equal(isActiveSubscriptionRequest({ status: "active" }), true);
  assert.equal(isActiveSubscriptionRequest({ status: "pending" }), false);
  assert.equal(isActiveSubscriptionRequest({ status: "rejected" }), false);
  assert.equal(isActiveSubscriptionRequest({ status: "مفعل", admin_disabled: true }), false);
  assert.equal(
    isActiveSubscriptionRequest({ status: "مفعل", expires_at: "2020-01-01T00:00:00.000Z" }),
    false
  );

  assert.equal(isActiveAccountManagementRequest({ status: "نشط" }), true);
  assert.equal(isActiveAccountManagementRequest({ status: "approved" }), false);
  assert.equal(isActiveAccountManagementRequest({ status: "completed" }), false);
  assert.equal(isActiveAccountManagementRequest({ status: "تمت المراجعة" }), false);
  assert.equal(isActiveAccountManagementRequest({ status: "pending" }), false);
}

function testDistinctAndEdgeCases() {
  const dualVip = [
    { user_email: "vip@test.com", plan_name: "VIP Spot", status: "مفعل", admin_disabled: false },
    { user_email: "vip@test.com", plan_name: "VIP Futures", status: "نشط", admin_disabled: false },
  ];
  assert.equal(collectDistinctVipActiveEmails(dualVip).size, 1);

  const mixedExpiry = [
    { user_email: "mix@test.com", plan_name: "VIP Spot", status: "منتهي", expires_at: "2020-01-01T00:00:00.000Z" },
    { user_email: "mix@test.com", plan_name: "VIP Spot", status: "مفعل", admin_disabled: false, expires_at: "2099-01-01T00:00:00.000Z" },
  ];
  assert.equal(collectDistinctVipActiveEmails(mixedExpiry).size, 1);

  assert.equal(
    isActiveSubscriptionRequest({ plan_name: "VIP Spot", status: "مفعل", admin_disabled: true }),
    false
  );

  const bothServices = buildActiveServiceFlagsFromRows({
    subscriptions: [{ plan_name: "VIP Spot", status: "مفعل", admin_disabled: false }],
    accountRows: [{ status: "نشط" }],
    alerts: [],
  });
  assert.equal(bothServices.vip, true);
  assert.equal(bothServices.accountManagement, true);

  const pendingAm = buildActiveServiceFlagsFromRows({
    subscriptions: [],
    accountRows: [{ status: "pending" }, { status: "بانتظار المراجعة" }],
    alerts: [],
  });
  assert.equal(pendingAm.accountManagement, false);
}

function collectDistinctVipActiveEmails(rows) {
  const emails = new Set();
  for (const row of rows) {
    if (!isActiveSubscriptionRequest(row)) continue;
    const serviceType = normalizeAdminUserServiceType(row, { sourceTable: "subscription_requests" });
    if (!isVipServiceType(serviceType)) continue;
    const email = String(row.user_email || "").trim().toLowerCase();
    if (email) emails.add(email);
  }
  return emails;
}

function testDistinctUserFlags() {
  const subscriptions = [
    { plan_name: "VIP Spot", status: "مفعل", admin_disabled: false },
    { plan_name: "VIP Futures", status: "مفعل", admin_disabled: false },
  ];
  const flags = buildActiveServiceFlagsFromRows({
    subscriptions,
    accountRows: [{ status: "نشط" }],
    alerts: [],
  });

  assert.equal(flags.vip, true);
  assert.equal(flags.accountManagement, true);
  assert.equal(isVipServiceType(normalizeAdminUserServiceType(subscriptions[0])), true);

  const pendingOnly = buildActiveServiceFlagsFromRows({
    subscriptions: [],
    accountRows: [{ status: "pending" }],
    alerts: [],
  });
  assert.equal(pendingOnly.accountManagement, false);
}

function testFinanceUiClasses() {
  const panelSource = fs.readFileSync(
    path.join(process.cwd(), "app/(app)/admin/components/FinancialCenterPanel.js"),
    "utf8"
  );
  const modalSource = fs.readFileSync(
    path.join(process.cwd(), "app/(app)/admin/components/AdminPaymentProofModal.js"),
    "utf8"
  );
  const themeSource = fs.readFileSync(path.join(process.cwd(), "app/(app)/admin/admin-theme.css"), "utf8");

  assert.match(panelSource, /admin-financial-tabs__btn[\s\S]*is-active/);
  assert.match(panelSource, /admin-financial-action-button--primary/);
  assert.match(modalSource, /admin-financial-proof-modal__close/);
  assert.match(modalSource, /event\.key === "Escape"/);
  assert.match(themeSource, /--admin-finance-primary/);
}

const tests = [
  ["normalize service types", testNormalizeServiceTypes],
  ["active statuses", testActiveStatuses],
  ["distinct user flags", testDistinctUserFlags],
  ["distinct and edge cases", testDistinctAndEdgeCases],
  ["finance ui classes", testFinanceUiClasses],
];

let passed = 0;
for (const [name, fn] of tests) {
  fn();
  passed += 1;
  console.log(`✓ ${name}`);
}

console.log(`\n${passed}/${tests.length} admin user service classifier checks passed`);
