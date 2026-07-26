import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  countSubscriptionStatusFilter,
  formatSubscriptionRequest,
  isNewPendingSubscriptionRequest,
  matchesSubscriptionStatusFilter,
} from "../app/(app)/admin/admin-dashboard-helpers.js";
import {
  countPendingSubscriptionRequestRows,
  explainPendingSubscriptionRequestRow,
  getPendingSubscriptionDiagnostic,
  isPendingSubscriptionRequestRow,
  LEGACY_ENGLISH_PENDING_WITHOUT_PROOF_REASON,
  normalizePendingSubscriptionCandidate,
} from "../lib/admin-pending-subscription-request.js";
import { countPendingPaymentReviewRows } from "../lib/financial-center/pending-payment-review.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const adminPageSource = readFileSync(join(__dirname, "../app/(app)/admin/page.js"), "utf8");
const dashboardSectionsSource = readFileSync(join(__dirname, "../lib/admin-dashboard-sections.js"), "utf8");
const pendingSubscriptionSource = readFileSync(join(__dirname, "../lib/admin-pending-subscription-request.js"), "utf8");
const liveStatusSource = readFileSync(join(__dirname, "../app/(app)/admin/components/AdminHubLiveStatus.js"), "utf8");
const statusBadgeSource = readFileSync(join(__dirname, "../app/components/StatusBadge.js"), "utf8");

const currentArabicWithPath = {
  id: 57,
  status: "بانتظار المراجعة",
  payment_proof_path: "user/session/a.png",
  admin_disabled: false,
};

const legacyEnglishNoProof = {
  id: 8,
  status: "pending",
  payment_proof_path: "",
  payment_proof: "",
  admin_disabled: false,
};

function buildFormatted(row) {
  return formatSubscriptionRequest({
    ...row,
    user_email: "user@example.com",
    username: "User",
    plan_name: "VIP Spot",
    category: "spot",
    price: "50",
    has_payment_proof:
      Boolean(String(row.payment_proof_path || "").trim()) ||
      Boolean(String(row.payment_proof || "").trim()),
  });
}

function testNormalizeDbSnakeCase() {
  const normalized = normalizePendingSubscriptionCandidate(currentArabicWithPath);
  assert.equal(normalized.status, "بانتظار المراجعة");
  assert.equal(normalized.adminDisabled, false);
  assert.equal(normalized.hasPaymentProof, true);
  assert.equal(isPendingSubscriptionRequestRow(currentArabicWithPath), true);
}

function testNormalizeUiCamelCase() {
  const formatted = buildFormatted(currentArabicWithPath);
  assert.equal(formatted.hasPaymentProof, true);
  assert.equal(formatted.paymentProofPath, "user/session/a.png");
  assert.equal(isPendingSubscriptionRequestRow(formatted), true);
  assert.equal(matchesSubscriptionStatusFilter(formatted, "pending"), true);
}

function testFormattedProofViaHasPaymentProofOnly() {
  const formatted = {
    id: 99,
    status: "pending",
    hasPaymentProof: true,
    paymentProofPath: "",
    paymentProof: "",
    adminDisabled: false,
  };
  assert.equal(isPendingSubscriptionRequestRow(formatted), true);
}

function testCurrentPendingVisibleInTabAndHub() {
  const rows = [currentArabicWithPath, { ...currentArabicWithPath, id: 53 }];
  assert.equal(countPendingSubscriptionRequestRows(rows), 2);
  assert.equal(countSubscriptionStatusFilter(rows.map(buildFormatted), "pending"), 2);
}

function testLegacyStaleRowExcluded() {
  const diagnostic = getPendingSubscriptionDiagnostic(legacyEnglishNoProof);
  assert.equal(diagnostic.isPending, false);
  assert.equal(diagnostic.reason, LEGACY_ENGLISH_PENDING_WITHOUT_PROOF_REASON);
  assert.equal(isPendingSubscriptionRequestRow(legacyEnglishNoProof), false);
  assert.equal(explainPendingSubscriptionRequestRow(legacyEnglishNoProof).reason, LEGACY_ENGLISH_PENDING_WITHOUT_PROOF_REASON);
  assert.equal(matchesSubscriptionStatusFilter(buildFormatted(legacyEnglishNoProof), "pending"), false);
}

function testDiagnosticMatchesPendingHelper() {
  const diagnostic = getPendingSubscriptionDiagnostic(currentArabicWithPath);
  assert.equal(diagnostic.isPending, true);
  assert.equal(diagnostic.normalizedStatus, "بانتظار المراجعة");
  assert.equal(diagnostic.hasProof, true);
  assert.equal(diagnostic.adminDisabled, false);
  assert.equal(isPendingSubscriptionRequestRow(currentArabicWithPath), diagnostic.isPending);
}

function testFinancialCounterUnchanged() {
  const rows = [currentArabicWithPath, legacyEnglishNoProof];
  assert.equal(countPendingPaymentReviewRows(rows), 1);
  assert.equal(countPendingSubscriptionRequestRows(rows), 1);
}

function testVisibleCardsMatchPendingBadgeCount() {
  assert.match(adminPageSource, /resolvedPendingSubscriptions/);
  assert.match(adminPageSource, /subscriptionPendingBadgeCount = resolvedPendingSubscriptions/);
  assert.match(adminPageSource, /stats=\{hubStats\}/);
}

function testLegacyRowsDoNotLookActionablePending() {
  assert.match(statusBadgeSource, /subscriptionRow/);
  assert.match(statusBadgeSource, /getPendingSubscriptionDiagnostic/);
  assert.match(statusBadgeSource, /طلب قديم/);
  assert.match(adminPageSource, /subscriptionRow=\{req\}/);
  assert.equal(isNewPendingSubscriptionRequest(buildFormatted(legacyEnglishNoProof)), false);
}

function testAcceptRejectDecrementOnce() {
  assert.match(adminPageSource, /subscriptionsPending: Math\.max\(0, Number\(current\.subscriptionsPending \|\| 0\) - 1\)/);
}

function testNoFullRefreshRegression() {
  assert.doesNotMatch(adminPageSource, /window\.location\.reload|location\.reload|router\.refresh\(/);
}

function testFinancialCenterUntouched() {
  assert.doesNotMatch(adminPageSource, /pendingPaymentReviews: Math\.max/);
}

function testStatsPayloadUsesDirectPendingCount() {
  assert.doesNotMatch(dashboardSectionsSource, /subscriptionsPending: subscriptionsPending\.count/);
  const statsBlock = dashboardSectionsSource.match(
    /if \(section === "stats"\) \{[\s\S]*?payload\.returnedRows = 0;\s*\} else if \(section === "analysis"\)/
  )?.[0];
  assert.ok(statsBlock, "stats section block missing");
  assert.match(statsBlock, /countPendingSubscriptionRequests\(supabase\)/);
  assert.match(statsBlock, /subscriptionsPending,\s*\n\s*pendingPaymentReviews/);
}

function testCountQueryExcludesPaymentProofBlob() {
  assert.doesNotMatch(
    pendingSubscriptionSource,
    /countPendingSubscriptionRequests[\s\S]*?payment_proof[^_]/
  );
  assert.match(pendingSubscriptionSource, /payment_proof_path/);
}

function testDashboardLoadingNotConfirmedZero() {
  assert.match(adminPageSource, /statsPending = !sectionStates\.stats\.loaded/);
  assert.match(liveStatusSource, /loading = false/);
  assert.match(liveStatusSource, /if \(loading\)/);
  assert.match(liveStatusSource, /skeleton/);
}

function testHubCountIndependentOfSubscriptionSection() {
  assert.match(adminPageSource, /resolvedPendingSubscriptions/);
  assert.match(adminPageSource, /stats\.pendingSubscriptions/);
  assert.match(adminPageSource, /apiStats\.subscriptionsPending/);
  assert.doesNotMatch(adminPageSource, /sectionStates\.subscriptions\.loaded[\s\S]{0,120}loadSection\("stats"/);
}

function testLegacyBlobOnlyExcludedWhenLegacyDisabled() {
  const legacyBlobOnly = {
    id: 12,
    status: "pending",
    payment_proof_path: "",
    admin_disabled: false,
  };
  assert.equal(
    isPendingSubscriptionRequestRow(legacyBlobOnly, { legacyReadEnabled: false }),
    false
  );
  assert.equal(
    isPendingSubscriptionRequestRow(
      { ...legacyBlobOnly, payment_proof: "data:image/png;base64,abc" },
      { legacyReadEnabled: true }
    ),
    true
  );
}

const tests = [
  ["normalize db snake_case", testNormalizeDbSnakeCase],
  ["normalize ui camelCase", testNormalizeUiCamelCase],
  ["formatted proof via hasPaymentProof only", testFormattedProofViaHasPaymentProofOnly],
  ["current pending visible in tab and hub", testCurrentPendingVisibleInTabAndHub],
  ["legacy stale row excluded", testLegacyStaleRowExcluded],
  ["diagnostic matches pending helper", testDiagnosticMatchesPendingHelper],
  ["financial counter unchanged", testFinancialCounterUnchanged],
  ["visible cards match pending badge count", testVisibleCardsMatchPendingBadgeCount],
  ["legacy rows do not look actionable pending", testLegacyRowsDoNotLookActionablePending],
  ["accept reject decrement once", testAcceptRejectDecrementOnce],
  ["no full refresh regression", testNoFullRefreshRegression],
  ["financial center untouched", testFinancialCenterUntouched],
  ["stats payload uses direct pending count", testStatsPayloadUsesDirectPendingCount],
  ["count query excludes payment_proof blob", testCountQueryExcludesPaymentProofBlob],
  ["dashboard loading not confirmed zero", testDashboardLoadingNotConfirmedZero],
  ["hub count independent of subscription section", testHubCountIndependentOfSubscriptionSection],
  ["legacy blob-only excluded when legacy disabled", testLegacyBlobOnlyExcludedWhenLegacyDisabled],
];

for (const [name, runner] of tests) {
  runner();
  console.log(`✅ ${name}`);
}

console.log(`\n${tests.length}/${tests.length} pending subscription count tests passed`);
