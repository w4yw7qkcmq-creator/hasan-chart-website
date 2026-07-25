import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  ADMIN_HUB_QUICK_NAV_ITEMS,
} from "../app/(app)/admin/components/admin-hub-config.js";
import { getAdminStatusKey } from "../app/(app)/admin/admin-dashboard-helpers.js";
import {
  ADMIN_STATS_SOURCES,
  PENDING_ANALYSIS_DB_STATUSES,
  PENDING_PARTNER_WITHDRAWAL_DB_STATUSES,
  countPendingAnalysisRequests,
  isPendingAnalysisStatus,
  isReviewedAdminStatus,
} from "../lib/admin-status-constants.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dashboardSectionsSource = readFileSync(
  join(__dirname, "../lib/admin-dashboard-sections.js"),
  "utf8"
);

function testHubQuickNavLinks() {
  const expected = {
    users: { href: "/admin/users", title: "المستخدمون" },
    financial: { href: "/admin/financial-center", title: "المركز المالي" },
    partners: { href: "/admin/partners", title: "الشركاء" },
    email: { href: "/admin/email-analytics", title: "مراقبة الإيميلات" },
    "notification-test": { href: "/admin/notification-test", title: "اختبار الإشعارات" },
    analysis: { tab: "analysis", title: "التحليلات" },
    accounts: { tab: "accounts", title: "الحسابات" },
    alerts: { href: "/alerts", title: "التنبيهات" },
    subscriptions: { tab: "subscriptions", title: "الاشتراكات" },
  };

  assert.equal(ADMIN_HUB_QUICK_NAV_ITEMS.length, 9);

  for (const item of ADMIN_HUB_QUICK_NAV_ITEMS) {
    const spec = expected[item.id];
    assert.ok(spec, `missing expected spec for ${item.id}`);
    if (spec.href) assert.equal(item.href, spec.href);
    if (spec.tab) assert.equal(item.tab, spec.tab);
    if (spec.title) assert.equal(item.title, spec.title);
    assert.ok(item.description && item.icon);
  }
}

function testAnalysisHubMatchesTabPendingSemantics() {
  const pendingRows = [
    { status: "بانتظار المعالجة" },
    { status: "بانتظار المراجعة" },
  ];
  const reviewedRows = [
    { status: "تم الرد" },
    { status: "مرفوض" },
    { status: "مكتمل" },
    { status: "completed" },
  ];

  assert.equal(countPendingAnalysisRequests(pendingRows), 2);
  assert.equal(
    pendingRows.filter((row) => getAdminStatusKey(row.status) === "pending").length,
    2
  );

  for (const row of reviewedRows) {
    assert.equal(isPendingAnalysisStatus(row.status), false);
    assert.equal(getAdminStatusKey(row.status), "reviewed");
  }

  assert.ok(PENDING_ANALYSIS_DB_STATUSES.includes("بانتظار المعالجة"));
  assert.ok(PENDING_ANALYSIS_DB_STATUSES.includes("pending"));
  assert.ok(PENDING_ANALYSIS_DB_STATUSES.includes("waiting"));
}

function testStatsSourcesAreDocumented() {
  assert.equal(ADMIN_STATS_SOURCES.pendingAnalysis.table, "analysis_requests");
  assert.equal(ADMIN_STATS_SOURCES.pendingAnalysis.responseField, "analysisPending");
  assert.equal(ADMIN_STATS_SOURCES.pendingAnalysis.uiField, "pendingAnalysis");
  assert.equal(ADMIN_STATS_SOURCES.withdrawalsPending.table, "partner_withdrawals");
  assert.equal(ADMIN_STATS_SOURCES.withdrawalsPending.responseField, "withdrawalsPending");

  const statsBlock = dashboardSectionsSource.match(
    /if \(section === "stats"\) \{[\s\S]*?payload\.returnedRows = 0;\s*\} else if \(section === "analysis"\)/
  )?.[0];
  assert.ok(statsBlock, "stats section block missing");
  assert.match(statsBlock, /statusIn: PENDING_ANALYSIS_DB_STATUSES/);
  assert.match(statsBlock, /statusIn: REVIEWED_ADMIN_DB_STATUSES/);
  assert.match(statsBlock, /statusIn: PENDING_PARTNER_WITHDRAWAL_DB_STATUSES/);
  assert.doesNotMatch(statsBlock, /REVIEWED_DB_STATUSES/);
}

function testPartnerWithdrawalCounterSemantics() {
  const partnersCard = ADMIN_HUB_QUICK_NAV_ITEMS.find((item) => item.id === "partners");
  assert.ok(partnersCard);
  assert.equal(partnersCard.statKey, "withdrawalsPending");
  assert.equal(partnersCard.statLabel, "طلبات سحب معلقة");
  assert.deepEqual(PENDING_PARTNER_WITHDRAWAL_DB_STATUSES, ["pending"]);
}

function testReviewedStatusesDoNotCountAsPending() {
  assert.equal(isReviewedAdminStatus("تم الرد"), true);
  assert.equal(isReviewedAdminStatus("مرفوض"), true);
  assert.equal(isPendingAnalysisStatus("تم الرد"), false);
  assert.equal(isPendingAnalysisStatus("مرفوض"), false);
}

function testSubscriptionFiltersExcludeUploadStatuses() {
  assert.doesNotMatch(dashboardSectionsSource, /upload_pending|upload_failed/);
}

function testAdminDashboardSectionsCoverHubPage() {
  const sectionsMatch = dashboardSectionsSource.match(
    /export const ADMIN_DASHBOARD_SECTIONS = new Set\(\[([\s\S]*?)\]\);/
  );
  assert.ok(sectionsMatch, "ADMIN_DASHBOARD_SECTIONS export missing");
  const sectionsBlock = sectionsMatch[1];

  const required = [
    "stats",
    "overview",
    "activity-feed",
    "analysis",
    "accounts",
    "subscriptions",
    "users",
    "withdrawals",
    "notifications",
  ];
  for (const section of required) {
    assert.match(sectionsBlock, new RegExp(`"${section}"`));
  }
}

function testStatsQueriesUseCentralConstants() {
  assert.match(dashboardSectionsSource, /from "\.\/admin-status-constants\.js"/);
  assert.match(
    dashboardSectionsSource,
    /if \(pendingOnly\) \{\s*query = query\.in\("status", PENDING_ADMIN_DB_STATUSES\);/
  );
}

const tests = [
  ["admin hub quick navigation links", testHubQuickNavLinks],
  ["analysis hub matches tab pending semantics", testAnalysisHubMatchesTabPendingSemantics],
  ["stats sources are documented", testStatsSourcesAreDocumented],
  ["partner withdrawal counter semantics", testPartnerWithdrawalCounterSemantics],
  ["reviewed statuses do not count as pending", testReviewedStatusesDoNotCountAsPending],
  ["subscription filters exclude upload statuses", testSubscriptionFiltersExcludeUploadStatuses],
  ["admin dashboard sections cover hub page", testAdminDashboardSectionsCoverHubPage],
  ["stats queries use central constants", testStatsQueriesUseCentralConstants],
];

for (const [name, runner] of tests) {
  runner();
  console.log(`✅ ${name}`);
}

console.log(`\n${tests.length}/${tests.length} admin hub link tests passed`);
