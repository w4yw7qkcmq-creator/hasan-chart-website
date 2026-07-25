import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  ADMIN_HUB_QUICK_NAV_ITEMS,
} from "../app/(app)/admin/components/admin-hub-config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dashboardSectionsSource = readFileSync(
  join(__dirname, "../lib/admin-dashboard-sections.js"),
  "utf8"
);

function extractDashboardConstant(name) {
  const match = dashboardSectionsSource.match(
    new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`)
  );
  assert.ok(match, `${name} must be defined`);
  return match[1]
    .split("\n")
    .map((line) => line.trim().replace(/^"|",$|,$/g, ""))
    .filter(Boolean);
}

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

function testReviewedDbStatusesDefinedBeforeUse() {
  const values = extractDashboardConstant("REVIEWED_DB_STATUSES");

  const usageIndex = dashboardSectionsSource.indexOf("statusIn: REVIEWED_DB_STATUSES");
  const definitionIndex = dashboardSectionsSource.indexOf("const REVIEWED_DB_STATUSES");
  assert.ok(definitionIndex >= 0, "REVIEWED_DB_STATUSES definition missing");
  assert.ok(usageIndex >= 0, "REVIEWED_DB_STATUSES usage missing");
  assert.ok(definitionIndex < usageIndex, "REVIEWED_DB_STATUSES must be defined before use");

  assert.ok(values.includes("reviewed"));
  assert.ok(values.includes("تمت المراجعة"));
  assert.ok(!values.includes("upload_pending"));
  assert.ok(!values.includes("upload_failed"));
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

function testStatsSectionLoadsWithoutReferenceError() {
  const statsBlock = dashboardSectionsSource.match(
    /if \(section === "stats"\) \{[\s\S]*?payload\.returnedRows = 0;\s*\} else if \(section === "analysis"\)/
  )?.[0];
  assert.ok(statsBlock, "stats section block missing");
  assert.match(statsBlock, /statusIn: REVIEWED_DB_STATUSES/);
  assert.match(statsBlock, /analysisReviewed: analysisReviewed\.count/);
  assert.match(statsBlock, /subscriptionsTotal: subscriptionsTotal\.count/);
  assert.doesNotMatch(statsBlock, /upload_pending|upload_failed/);

  const reviewedValues = extractDashboardConstant("REVIEWED_DB_STATUSES");
  const pendingValues = extractDashboardConstant("PENDING_DB_STATUSES");
  assert.ok(reviewedValues.length >= 10);
  assert.ok(pendingValues.length >= 5);
  assert.ok(
    reviewedValues.every((value) => !pendingValues.includes(value)),
    "reviewed and pending status lists must not overlap"
  );
}

async function testSubscriptionsSectionUsesPendingFilterOnly() {
  assert.match(
    dashboardSectionsSource,
    /if \(pendingOnly\) \{\s*query = query\.in\("status", PENDING_DB_STATUSES\);/
  );
  const fetchBlock = dashboardSectionsSource.match(
    /async function fetchSubscriptionList[\s\S]*?^}/m
  )?.[0];
  assert.ok(fetchBlock, "fetchSubscriptionList missing");
  assert.doesNotMatch(fetchBlock, /upload_pending|upload_failed/);
  assert.match(fetchBlock, /PENDING_DB_STATUSES/);
}

const tests = [
  ["admin hub quick navigation links", testHubQuickNavLinks],
  ["reviewed db statuses defined before use", testReviewedDbStatusesDefinedBeforeUse],
  ["subscription filters exclude upload statuses", testSubscriptionFiltersExcludeUploadStatuses],
  ["admin dashboard sections cover hub page", testAdminDashboardSectionsCoverHubPage],
  ["stats section loads without reference error", testStatsSectionLoadsWithoutReferenceError],
  ["subscriptions section uses pending filter only", testSubscriptionsSectionUsesPendingFilterOnly],
];

for (const [name, runner] of tests) {
  await runner();
  console.log(`✅ ${name}`);
}

console.log(`\n${tests.length}/${tests.length} admin hub link tests passed`);
