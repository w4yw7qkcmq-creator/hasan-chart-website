import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  ADMIN_SERVICE_TYPES,
  buildActiveServiceFlagsFromRows,
  classifySubscriptionRow,
  isActiveAccountManagementRequest,
  isActiveSubscriptionForDashboardStats,
  isActiveSubscriptionRequest,
  isVipServiceType,
  normalizeAdminUserServiceType,
} from "../lib/admin-user-service-classifier.js";
import {
  analyzeVipSubscriptionRows,
  loadAdminUserDashboardStats,
} from "../lib/admin-user-dashboard-stats.js";

const VIP_FIXTURE_ROWS = [
  { id: 1, user_email: "spot@test.com", plan_name: "VIP Spot", category: "Spot", status: "مفعل" },
  { id: 2, user_email: "spot@test.com", plan_name: "VIP Spot Monthly", category: "spot", status: "مفعل" },
  { id: 3, user_email: "futures@test.com", plan_name: "VIP Futures", category: "Futures", status: "مفعل" },
  { id: 4, user_email: "futures@test.com", plan_name: "VIP Futures Monthly", category: "futures", status: "مفعل" },
  { id: 5, user_email: "signals@test.com", plan_name: "VIP Signals", category: "Signals", status: "مفعل" },
  { id: 6, user_email: "arabic@test.com", plan_name: "سبوت - شهر", category: "باقات السبوت", status: "مفعل" },
  { id: 7, user_email: "arabic@test.com", plan_name: "فيوتشر - شهر", category: "باقات الفيوتشر", status: "مفعل" },
  { id: 8, user_email: "signals-ar@test.com", plan_name: "VIP Signals", category: "الإشارات", status: "مفعل" },
  { id: 9, user_email: "channel@test.com", plan_name: "VIP Signals", category: "القناة الخاصة", status: "مفعل" },
  { id: 10, user_email: "academy@test.com", plan_name: "Academy Pro", category: "academy", status: "مفعل" },
];

function printSubscriptionClassifications(label, rows) {
  console.log(`\n=== ${label} ===`);
  for (const row of rows) {
    const result = classifySubscriptionRow(row);
    console.log(
      JSON.stringify({
        id: row.id ?? null,
        user_email: row.user_email ?? null,
        status: result.status,
        plan_name: result.plan_name,
        category: result.category,
        normalizedServiceType: result.normalizedServiceType,
        isActive: result.isActive,
        countsAsVipActive: result.countsAsVipActive,
        exclusionReason: result.exclusionReason,
      })
    );
  }
}

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
    normalizeAdminUserServiceType({ plan_name: "سبوت - شهر", category: "باقات السبوت" }),
    ADMIN_SERVICE_TYPES.VIP_SPOT
  );
  assert.equal(
    normalizeAdminUserServiceType({ plan_name: "فيوتشر - شهر", category: "باقات الفيوتشر" }),
    ADMIN_SERVICE_TYPES.VIP_FUTURES
  );
  assert.equal(
    normalizeAdminUserServiceType({ plan_name: "VIP Spot Monthly", category: "spot" }),
    ADMIN_SERVICE_TYPES.VIP_SPOT
  );
  assert.equal(
    normalizeAdminUserServiceType({ plan_name: "VIP Futures Monthly", category: "futures" }),
    ADMIN_SERVICE_TYPES.VIP_FUTURES
  );
  assert.equal(
    normalizeAdminUserServiceType({ plan_name: "VIP Signals", category: "الإشارات" }),
    ADMIN_SERVICE_TYPES.VIP_SIGNALS
  );
  assert.equal(
    normalizeAdminUserServiceType({ plan_name: "VIP Signals", category: "القناة الخاصة" }),
    ADMIN_SERVICE_TYPES.VIP_SIGNALS
  );
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

  assert.equal(
    isActiveSubscriptionForDashboardStats({
      status: "مفعل",
      expires_at: "2020-01-01T00:00:00.000Z",
    }),
    true
  );

  assert.equal(isActiveAccountManagementRequest({ status: "نشط" }), true);
  assert.equal(isActiveAccountManagementRequest({ status: "approved" }), false);
  assert.equal(isActiveAccountManagementRequest({ status: "completed" }), false);
  assert.equal(isActiveAccountManagementRequest({ status: "تمت المراجعة" }), false);
  assert.equal(isActiveAccountManagementRequest({ status: "pending" }), false);
  assert.equal(isActiveAccountManagementRequest({ status: "جديد" }), false);
  assert.equal(isActiveAccountManagementRequest({ status: "موقوف" }), false);
}

function collectDistinctVipActiveEmails(rows) {
  const emails = new Set();
  for (const row of rows) {
    if (!isActiveSubscriptionForDashboardStats(row)) continue;
    const serviceType = normalizeAdminUserServiceType(row, { sourceTable: "subscription_requests" });
    if (!isVipServiceType(serviceType)) continue;
    const email = String(row.user_email || "").trim().toLowerCase();
    if (email) emails.add(email);
  }
  return emails;
}

function testDistinctAndEdgeCases() {
  const dualVip = [
    { user_email: "vip@test.com", plan_name: "VIP Spot", status: "مفعل", admin_disabled: false },
    { user_email: "vip@test.com", plan_name: "VIP Futures", status: "نشط", admin_disabled: false },
  ];
  assert.equal(collectDistinctVipActiveEmails(dualVip).size, 1);

  const mixedExpiry = [
    { user_email: "mix@test.com", plan_name: "VIP Spot", status: "منتهي", expires_at: "2020-01-01T00:00:00.000Z" },
    {
      user_email: "mix@test.com",
      plan_name: "VIP Spot",
      status: "مفعل",
      admin_disabled: false,
      expires_at: "2020-01-01T00:00:00.000Z",
    },
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

function testVipFixtureDiagnostics() {
  printSubscriptionClassifications("VIP fixture rows", VIP_FIXTURE_ROWS);

  const analysis = analyzeVipSubscriptionRows(VIP_FIXTURE_ROWS);
  assert.equal(analysis.totalRows, VIP_FIXTURE_ROWS.length);
  assert.equal(analysis.dbDistinctEmailCount, 7);
  assert.equal(analysis.vipActiveCount, 6);
  assert.equal(analysis.matchesDbDistinctEmails, false);
  assert.equal(analysis.excluded.length, 1);
  assert.equal(analysis.excluded[0].exclusionReason, "not_vip_service:academy");

  console.log("\n=== VIP fixture comparison ===");
  console.log(`dbDistinctEmailCount=${analysis.dbDistinctEmailCount}`);
  console.log(`vipActiveCount=${analysis.vipActiveCount}`);
  for (const record of analysis.excluded) {
    console.log(
      `EXCLUDED id=${record.id} email=${record.user_email} reason=${record.exclusionReason} status=${record.status} plan_name=${record.plan_name} category=${record.category}`
    );
  }
}

async function testLiveSupabaseComparison() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    console.log("\n(live Supabase comparison skipped: .env.local not found)");
    return;
  }

  const env = Object.fromEntries(
    fs
      .readFileSync(envPath, "utf8")
      .split("\n")
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1).replace(/^"|"$/g, "")];
      })
  );

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from("subscription_requests")
    .select("id,user_email,plan_name,category,status,expires_at,admin_disabled")
    .eq("status", "مفعل");

  if (error) {
    throw error;
  }

  printSubscriptionClassifications("Live Supabase rows (status=مفعل)", data);

  const analysis = analyzeVipSubscriptionRows(data);
  const stats = await loadAdminUserDashboardStats(supabase);

  console.log("\n=== Live Supabase comparison ===");
  console.log(`rows=${analysis.totalRows}`);
  console.log(`dbDistinctEmailCount=${analysis.dbDistinctEmailCount}`);
  console.log(`vipActiveCount=${analysis.vipActiveCount}`);
  console.log(`apiStats.vipActive=${stats.vipActive}`);
  console.log(`matchesDbDistinctEmails=${analysis.matchesDbDistinctEmails}`);

  if (analysis.excluded.length) {
    console.log("\nExcluded rows:");
    for (const record of analysis.excluded) {
      console.log(
        `EXCLUDED id=${record.id} email=${record.user_email} reason=${record.exclusionReason} status=${record.status} plan_name=${record.plan_name} category=${record.category}`
      );
    }
  } else {
    console.log("\nNo excluded rows.");
  }

  assert.equal(stats.vipActive, analysis.vipActiveCount);
  assert.equal(analysis.vipActiveCount, analysis.dbDistinctEmailCount);
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
  ["vip fixture diagnostics", testVipFixtureDiagnostics],
  ["finance ui classes", testFinanceUiClasses],
];

let passed = 0;
for (const [name, fn] of tests) {
  fn();
  passed += 1;
  console.log(`✓ ${name}`);
}

await testLiveSupabaseComparison();
passed += 1;
console.log("✓ live supabase comparison");

console.log(`\n${passed}/${tests.length + 1} admin user service classifier checks passed`);
