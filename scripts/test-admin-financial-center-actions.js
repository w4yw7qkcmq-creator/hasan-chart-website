import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  ADMIN_SUBSCRIPTION_UPDATED_EVENT,
  buildAdminSubscriptionUpdatedDetail,
  dispatchAdminSubscriptionUpdatedEvent,
} from "../lib/admin-subscription-updated-client.js";
import {
  buildSubscriptionOpenHref,
  canActivatePaymentReviewItem,
  canRejectPaymentReviewItem,
  mapPaymentReviewToSubscriptionRequest,
  postSubscriptionActivateViaDashboard,
  postSubscriptionRejectViaApi,
} from "../lib/admin-subscription-review-actions-client.js";
import {
  formatPaymentReviewStatusLabel,
  isPaymentReviewActionable,
} from "../lib/financial-center/financial-center-shared.js";
import { normalizePaymentReviewRow } from "../lib/financial-center/payment-service.js";
import {
  buildPendingPaymentReviewProofOrFilter,
  countPendingPaymentReviewRows,
  filterPendingPaymentReviewRows,
  isPendingPaymentReviewRow,
  rowHasPendingPaymentReviewProof,
} from "../lib/financial-center/pending-payment-review.js";
import { PENDING_ADMIN_DB_STATUSES } from "../lib/admin-status-constants.js";
import { PAYMENT_REVIEW_STATUSES } from "../lib/financial-center/financial-types.js";
import { ADMIN_HUB_QUICK_NAV_ITEMS } from "../app/(app)/admin/components/admin-hub-config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const financialPanelSource = readFileSync(
  join(__dirname, "../app/(app)/admin/components/FinancialCenterPanel.js"),
  "utf8"
);
const subscriptionServiceSource = readFileSync(
  join(__dirname, "../lib/financial-center/subscription-service.js"),
  "utf8"
);
const paymentServiceSource = readFileSync(
  join(__dirname, "../lib/financial-center/payment-service.js"),
  "utf8"
);
const dashboardSectionsSource = readFileSync(
  join(__dirname, "../lib/admin-dashboard-sections.js"),
  "utf8"
);
const adminPageSource = readFileSync(join(__dirname, "../app/(app)/admin/page.js"), "utf8");

const pendingWithProof = {
  id: 1,
  status: "بانتظار المراجعة",
  payment_proof_path: "user/session/proof.png",
};
const pendingWithoutProof = {
  id: 2,
  status: "بانتظار المعالجة",
  payment_proof_path: "",
  payment_proof: "",
};
const confirmedWithProof = {
  id: 3,
  status: "مفعل",
  started_at: "2026-01-01T00:00:00.000Z",
  payment_proof_path: "user/session/proof2.png",
};
const rejectedWithProof = {
  id: 4,
  status: "مرفوض",
  payment_proof_path: "user/session/proof3.png",
};
const unknownWithProof = {
  id: 5,
  status: "حالة_غير_معروفة",
  payment_proof_path: "user/session/proof4.png",
};
const pendingLegacyProof = {
  id: 6,
  status: "pending",
  payment_proof: "https://example.com/proof.jpg",
};
const extraPendingRows = [
  { id: 101, status: "بانتظار المراجعة", payment_proof_path: "", payment_proof: "" },
  { id: 102, status: "بانتظار المعالجة", payment_proof_path: null },
  { id: 103, status: "pending", payment_proof_path: "", payment_proof: "" },
  { id: 104, status: "قيد المراجعة", payment_proof_path: "", payment_proof: "" },
];

function testListAndCounterShareHelper() {
  assert.match(subscriptionServiceSource, /countPendingPaymentReviews/);
  assert.match(paymentServiceSource, /buildPendingPaymentReviewProofOrFilter/);
  assert.match(paymentServiceSource, /countPendingPaymentReviews/);
  assert.match(dashboardSectionsSource, /countPendingPaymentReviews/);
}

function testThreePendingWithProofEqualsCardThree() {
  const rows = [pendingWithProof, pendingWithProof, pendingWithProof, pendingWithoutProof];
  assert.equal(countPendingPaymentReviewRows(rows), 3);
}

function testPendingWithoutProofExcludedFromFinancialCounter() {
  assert.equal(isPendingPaymentReviewRow(pendingWithoutProof), false);
  assert.equal(countPendingPaymentReviewRows([pendingWithoutProof, ...extraPendingRows]), 0);
}

function testConfirmedRejectedEndedExcluded() {
  assert.equal(isPendingPaymentReviewRow(confirmedWithProof), false);
  assert.equal(isPendingPaymentReviewRow(rejectedWithProof), false);
  assert.equal(
    isPendingPaymentReviewRow({
      id: 7,
      status: "منتهي",
      payment_proof_path: "user/session/proof5.png",
    }),
    false
  );
}

function testUnknownExcludedWithoutMapping() {
  assert.equal(isPendingPaymentReviewRow(unknownWithProof), false);
}

function testLegacyProofIncludedOnlyWhenLegacyReadEnabled() {
  assert.equal(isPendingPaymentReviewRow(pendingLegacyProof, { legacyReadEnabled: true }), true);
  assert.equal(isPendingPaymentReviewRow(pendingLegacyProof, { legacyReadEnabled: false }), false);
}

function testFinancialHubUsesPendingPaymentReviewsStat() {
  const financialCard = ADMIN_HUB_QUICK_NAV_ITEMS.find((item) => item.id === "financial");
  const subscriptionsCard = ADMIN_HUB_QUICK_NAV_ITEMS.find((item) => item.id === "subscriptions");
  assert.equal(financialCard.statKey, "pendingPaymentReviews");
  assert.equal(subscriptionsCard.statKey, "pendingSubscriptions");
  assert.match(adminPageSource, /pendingPaymentReviews: apiStats\.pendingPaymentReviews/);
}

function testExtraFourRecordsArePendingWithoutProof() {
  const allPending = [pendingWithProof, pendingWithProof, pendingWithProof, ...extraPendingRows];
  const pendingAdminCount = allPending.filter((row) => PENDING_ADMIN_DB_STATUSES.includes(row.status)).length;
  const paymentReviewCount = countPendingPaymentReviewRows(allPending);
  assert.equal(pendingAdminCount, 7);
  assert.equal(paymentReviewCount, 3);
  for (const row of extraPendingRows) {
    assert.equal(isPendingPaymentReviewRow(row), false);
    assert.ok(PENDING_ADMIN_DB_STATUSES.includes(row.status));
    assert.equal(rowHasPendingPaymentReviewProof(row), false);
  }
}

function testPendingReviewShowsDecisionActions() {
  const pending = {
    requestId: "42",
    status: PAYMENT_REVIEW_STATUSES.PENDING_REVIEW,
    rawStatus: "بانتظار المراجعة",
  };
  assert.equal(isPaymentReviewActionable(pending.status), true);
  assert.equal(canActivatePaymentReviewItem(pending), true);
  assert.equal(canRejectPaymentReviewItem(pending), true);
  assert.match(financialPanelSource, /applyPaymentReviewStatusUpdate/);
}

function testConfirmedAndRejectedHideDecisionActions() {
  const confirmed = { status: PAYMENT_REVIEW_STATUSES.CONFIRMED, rawStatus: "مفعل" };
  const rejected = { status: PAYMENT_REVIEW_STATUSES.REJECTED, rawStatus: "مرفوض" };
  assert.equal(canActivatePaymentReviewItem(confirmed), false);
  assert.equal(canRejectPaymentReviewItem(confirmed), false);
  assert.equal(canActivatePaymentReviewItem(rejected), false);
  assert.equal(canRejectPaymentReviewItem(rejected), false);
}

function testAcceptUpdatesRowLocally() {
  assert.match(financialPanelSource, /applyPaymentReviewStatusUpdate\(request\.id, PAYMENT_REVIEW_STATUSES\.CONFIRMED/);
}

function testRejectUpdatesRowLocally() {
  assert.match(financialPanelSource, /applyPaymentReviewStatusUpdate\(request\.id, PAYMENT_REVIEW_STATUSES\.REJECTED/);
}

function testAcceptDecrementsPendingCounterLocally() {
  assert.match(financialPanelSource, /pendingReviews: Math\.max\(0, Number\(current\.pendingReviews \|\| 0\) - 1\)/);
}

function testRejectDecrementsPendingCounterLocally() {
  assert.match(financialPanelSource, /pendingReviews: Math\.max\(0, Number\(current\.pendingReviews \|\| 0\) - 1\)/);
}

function testNoFullPageReloadAfterActions() {
  assert.doesNotMatch(financialPanelSource, /window\.location\.reload|location\.reload/);
  assert.doesNotMatch(financialPanelSource, /router\.refresh\(/);
}

function testNoFullAdminReloadAfterActions() {
  assert.match(financialPanelSource, /background: true/);
  assert.match(adminPageSource, /loadSection\("stats", \{ force: true, background: true \}\)/);
  assert.doesNotMatch(adminPageSource, /window\.location\.reload|location\.reload/);
}

function testBackgroundRefreshTargetsPaymentReviewsOnly() {
  assert.match(financialPanelSource, /loadSection\("payment-reviews", \{ force: true, background: true \}\)/);
  assert.match(financialPanelSource, /refreshPendingOverviewCount/);
}

function testSelfSourceSkipsEventRefreshLoop() {
  assert.match(financialPanelSource, /event\.detail\?\.source === "financial-center"/);
}

function testExternalSourceRefreshesSectionsOnly() {
  assert.match(financialPanelSource, /refreshFinancialSections/);
  assert.doesNotMatch(financialPanelSource, /router\.push\(\s*["'`]\/admin\?section=financial-center/);
}

function testScrollSearchFilterPreservedDuringBackgroundRefresh() {
  assert.match(financialPanelSource, /background = false/);
  assert.doesNotMatch(financialPanelSource, /setSearch\(""\)/);
  assert.doesNotMatch(financialPanelSource, /setReviewStatus\("all"\)/);
  assert.doesNotMatch(financialPanelSource, /window\.scrollTo/);
}

function testRefreshFailureDoesNotUndoSuccess() {
  assert.match(financialPanelSource, /if \(flowResult\.refreshFailed\)/);
  assert.match(financialPanelSource, /تمت العملية، لكن تعذر تحديث البيانات تلقائيًا/);
  assert.doesNotMatch(financialPanelSource, /applyPaymentReviewStatusUpdate[\s\S]*refreshFailed[\s\S]*PENDING_REVIEW/);
}

function test409DoesNotFullReload() {
  assert.match(financialPanelSource, /flowResult\.error\?\.status === 409/);
  assert.match(financialPanelSource, /تم تغيير حالة الطلب من نافذة أخرى/);
  assert.match(financialPanelSource, /void refreshFinancialSections\(\)/);
  assert.doesNotMatch(financialPanelSource, /window\.location\.reload|location\.reload|router\.refresh/);
}

function testNoFullSkeletonDuringSingleRowAction() {
  assert.match(financialPanelSource, /loading && paymentReviews\.length === 0 \? <SectionSkeleton/);
  assert.match(financialPanelSource, /:activate/);
  assert.match(financialPanelSource, /:reject/);
}

function testFinancialCenterUsesExistingApis() {
  assert.match(financialPanelSource, /postSubscriptionActivateViaDashboard/);
  assert.match(financialPanelSource, /postSubscriptionRejectViaApi/);
}

function testActivateApiPayload() {
  let payload = null;
  const adminFetch = async (_url, options = {}) => {
    payload = JSON.parse(options.body);
    return { ok: true, json: async () => ({ success: true }) };
  };

  return postSubscriptionActivateViaDashboard(adminFetch, {
    id: "42",
    userEmail: "user@example.com",
    planName: "VIP Spot",
  }).then((result) => {
    assert.equal(result.success, true);
    assert.equal(payload.action, "update-subscription-request");
    assert.equal(payload.status, "مفعل");
    assert.equal(payload.requestId, "42");
  });
}

function testRejectApiPath() {
  let url = "";
  const adminFetch = async (requestUrl) => {
    url = requestUrl;
    return { ok: true, json: async () => ({ success: true }) };
  };

  return postSubscriptionRejectViaApi(adminFetch, "42", {
    rejectionReason: "invalid_proof",
    rejectionNotes: "test",
  }).then((result) => {
    assert.equal(result.success, true);
    assert.match(url, /\/api\/admin\/subscription-requests\/42\/reject$/);
  });
}

function testStatusFormatterLabels() {
  assert.equal(formatPaymentReviewStatusLabel("pending_review"), "بانتظار المراجعة");
  assert.equal(formatPaymentReviewStatusLabel("confirmed"), "مفعل");
  assert.equal(formatPaymentReviewStatusLabel("rejected"), "مرفوض");
}

function testNormalizePaymentReviewRowKeepsRawStatus() {
  const row = normalizePaymentReviewRow({
    id: 42,
    user_email: "user@example.com",
    username: "User",
    plan_name: "VIP Spot",
    category: "spot",
    price: "50",
    status: "بانتظار المعالجة",
    payment_proof_path: "user/session/file.png",
    created_at: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(row.status, PAYMENT_REVIEW_STATUSES.PENDING_REVIEW);
  assert.equal(row.rawStatus, "بانتظار المعالجة");
}

function testProofFilterRespectsLegacyFlag() {
  assert.match(buildPendingPaymentReviewProofOrFilter({ legacyReadEnabled: true }), /payment_proof_path/);
  assert.match(buildPendingPaymentReviewProofOrFilter({ legacyReadEnabled: true }), /payment_proof/);
  assert.equal(
    buildPendingPaymentReviewProofOrFilter({ legacyReadEnabled: false }),
    "payment_proof_path.not.is.null"
  );
}

function testFilterPendingPaymentReviewRows() {
  const rows = [pendingWithProof, pendingWithoutProof, confirmedWithProof, pendingLegacyProof];
  const legacyEnabled = filterPendingPaymentReviewRows(rows, { legacyReadEnabled: true });
  const legacyDisabled = filterPendingPaymentReviewRows(rows, { legacyReadEnabled: false });
  assert.deepEqual(legacyEnabled.map((row) => row.id), [1, 6]);
  assert.deepEqual(legacyDisabled.map((row) => row.id), [1]);
}

function testSubscriptionUpdatedEventShape() {
  const detail = buildAdminSubscriptionUpdatedDetail({
    requestId: "42",
    userEmail: "user@example.com",
    previousStatus: "pending_review",
    newStatus: "مفعل",
    source: "financial-center",
  });
  assert.equal(detail.source, "financial-center");
  assert.equal(ADMIN_SUBSCRIPTION_UPDATED_EVENT, "hc:admin-subscription-updated");
  assert.doesNotThrow(() =>
    dispatchAdminSubscriptionUpdatedEvent({
      requestId: "1",
      newStatus: "مفعل",
      source: "test",
    })
  );
}

function testOpenSubscriptionHrefUsesRequestId() {
  assert.equal(
    buildSubscriptionOpenHref("42"),
    "/admin?section=subscriptions&tab=subscriptions&requestId=42"
  );
}

const tests = [
  ["list and counter share helper", testListAndCounterShareHelper],
  ["3 pending with proof equals card 3", testThreePendingWithProofEqualsCardThree],
  ["pending without proof excluded", testPendingWithoutProofExcludedFromFinancialCounter],
  ["confirmed rejected ended excluded", testConfirmedRejectedEndedExcluded],
  ["unknown excluded without mapping", testUnknownExcludedWithoutMapping],
  ["legacy proof only when legacy read enabled", testLegacyProofIncludedOnlyWhenLegacyReadEnabled],
  ["financial hub uses pendingPaymentReviews stat", testFinancialHubUsesPendingPaymentReviewsStat],
  ["extra four records are pending without proof", testExtraFourRecordsArePendingWithoutProof],
  ["pending_review shows decision actions", testPendingReviewShowsDecisionActions],
  ["confirmed and rejected hide decision actions", testConfirmedAndRejectedHideDecisionActions],
  ["accept updates row locally", testAcceptUpdatesRowLocally],
  ["reject updates row locally", testRejectUpdatesRowLocally],
  ["accept decrements pending counter locally", testAcceptDecrementsPendingCounterLocally],
  ["reject decrements pending counter locally", testRejectDecrementsPendingCounterLocally],
  ["no window.location.reload", testNoFullPageReloadAfterActions],
  ["no full admin reload after actions", testNoFullAdminReloadAfterActions],
  ["background refresh targets payment-reviews only", testBackgroundRefreshTargetsPaymentReviewsOnly],
  ["source=self skips event refresh loop", testSelfSourceSkipsEventRefreshLoop],
  ["external source refreshes sections only", testExternalSourceRefreshesSectionsOnly],
  ["scroll search filter preserved", testScrollSearchFilterPreservedDuringBackgroundRefresh],
  ["refresh failure does not undo success", testRefreshFailureDoesNotUndoSuccess],
  ["409 does not full reload", test409DoesNotFullReload],
  ["no full skeleton during single row action", testNoFullSkeletonDuringSingleRowAction],
  ["financial center uses existing apis", testFinancialCenterUsesExistingApis],
  ["activate api payload", () => testActivateApiPayload()],
  ["reject api path", () => testRejectApiPath()],
  ["status formatter labels", testStatusFormatterLabels],
  ["normalize payment review keeps raw status", testNormalizePaymentReviewRowKeepsRawStatus],
  ["proof filter respects legacy flag", testProofFilterRespectsLegacyFlag],
  ["filter pending payment review rows", testFilterPendingPaymentReviewRows],
  ["subscription updated event shape", testSubscriptionUpdatedEventShape],
  ["open subscription href uses request id", testOpenSubscriptionHrefUsesRequestId],
];

for (const [name, runner] of tests) {
  await runner();
  console.log(`✅ ${name}`);
}

console.log(`\n${tests.length}/${tests.length} financial center action tests passed`);
