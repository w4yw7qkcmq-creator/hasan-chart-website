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
];

for (const [name, runner] of tests) {
  runner();
  console.log(`✅ ${name}`);
}

console.log(`\n${tests.length}/${tests.length} pending subscription count tests passed`);
