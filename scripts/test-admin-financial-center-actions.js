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
import { PENDING_ADMIN_DB_STATUSES } from "../lib/admin-status-constants.js";
import { PAYMENT_REVIEW_STATUSES } from "../lib/financial-center/financial-types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const financialPanelSource = readFileSync(
  join(__dirname, "../app/(app)/admin/components/FinancialCenterPanel.js"),
  "utf8"
);
const subscriptionServiceSource = readFileSync(
  join(__dirname, "../lib/financial-center/subscription-service.js"),
  "utf8"
);

function testPendingReviewShowsDecisionActions() {
  const pending = {
    requestId: "42",
    status: PAYMENT_REVIEW_STATUSES.PENDING_REVIEW,
    rawStatus: "بانتظار المراجعة",
  };
  assert.equal(isPaymentReviewActionable(pending.status), true);
  assert.equal(canActivatePaymentReviewItem(pending), true);
  assert.equal(canRejectPaymentReviewItem(pending), true);
  assert.match(financialPanelSource, /canActivatePaymentReviewItem|canRejectPaymentReviewItem/);
  assert.match(financialPanelSource, /قبول وتفعيل/);
  assert.match(financialPanelSource, /SubscriptionRejectModal/);
}

function testConfirmedAndRejectedHideDecisionActions() {
  const confirmed = {
    status: PAYMENT_REVIEW_STATUSES.CONFIRMED,
    rawStatus: "مفعل",
  };
  const rejected = {
    status: PAYMENT_REVIEW_STATUSES.REJECTED,
    rawStatus: "مرفوض",
  };
  assert.equal(canActivatePaymentReviewItem(confirmed), false);
  assert.equal(canRejectPaymentReviewItem(confirmed), false);
  assert.equal(canActivatePaymentReviewItem(rejected), false);
  assert.equal(canRejectPaymentReviewItem(rejected), false);
}

function testFinancialCenterUsesExistingApis() {
  assert.match(financialPanelSource, /postSubscriptionActivateViaDashboard/);
  assert.match(financialPanelSource, /postSubscriptionRejectViaApi/);
  assert.doesNotMatch(financialPanelSource, /dispatchAdminEvent/);
  assert.doesNotMatch(financialPanelSource, /dispatchTransactionalEmail/);
  assert.doesNotMatch(financialPanelSource, /notifyVipSubscribers/);
}

function testActivateApiPayload() {
  let payload = null;
  const adminFetch = async (_url, options = {}) => {
    payload = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({ success: true }),
    };
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
    return {
      ok: true,
      json: async () => ({ success: true }),
    };
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
  assert.equal(formatPaymentReviewStatusLabel("unknown"), "حالة غير معروفة");
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
  assert.equal(row.requestId, 42);
}

function testUnifiedPendingStatusesInFinancialSummary() {
  assert.match(subscriptionServiceSource, /PENDING_ADMIN_DB_STATUSES/);
  for (const status of ["بانتظار المراجعة", "pending", "بانتظار المعالجة"]) {
    assert.ok(PENDING_ADMIN_DB_STATUSES.includes(status), `missing pending status ${status}`);
  }
}

function testSubscriptionUpdatedEventShape() {
  const detail = buildAdminSubscriptionUpdatedDetail({
    requestId: "42",
    userEmail: "user@example.com",
    previousStatus: "pending_review",
    newStatus: "مفعل",
    source: "financial-center",
  });
  assert.equal(detail.requestId, "42");
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

function testFinancialPanelSyncAndGuards() {
  assert.match(financialPanelSource, /runAdminUserActionFlow/);
  assert.match(financialPanelSource, /subscriptionActionInFlightRef/);
  assert.match(financialPanelSource, /applyPaymentReviewStatusUpdate/);
  assert.match(financialPanelSource, /refreshFinancialSections/);
  assert.match(financialPanelSource, /refreshFailed/);
  assert.match(financialPanelSource, /subscribeAdminSubscriptionUpdated/);
  assert.match(financialPanelSource, /dispatchAdminSubscriptionUpdatedEvent/);
  assert.match(financialPanelSource, /error\?\.status === 409/);
}

function testMapPaymentReviewKeepsStringRequestId() {
  const mapped = mapPaymentReviewToSubscriptionRequest({
    requestId: 42,
    userEmail: "user@example.com",
    plan: "VIP Spot",
    priceRaw: "50",
    proofAvailable: true,
    status: "pending_review",
    rawStatus: "بانتظار المراجعة",
  });
  assert.equal(mapped.id, 42);
  assert.equal(typeof mapped.id, "number");
}

const tests = [
  ["pending_review shows decision actions", testPendingReviewShowsDecisionActions],
  ["confirmed and rejected hide decision actions", testConfirmedAndRejectedHideDecisionActions],
  ["financial center uses existing apis", testFinancialCenterUsesExistingApis],
  ["activate api payload", () => testActivateApiPayload()],
  ["reject api path", () => testRejectApiPath()],
  ["status formatter labels", testStatusFormatterLabels],
  ["normalize payment review keeps raw status", testNormalizePaymentReviewRowKeepsRawStatus],
  ["unified pending statuses in financial summary", testUnifiedPendingStatusesInFinancialSummary],
  ["subscription updated event shape", testSubscriptionUpdatedEventShape],
  ["open subscription href uses request id", testOpenSubscriptionHrefUsesRequestId],
  ["financial panel sync and guards", testFinancialPanelSyncAndGuards],
  ["map payment review keeps request id type", testMapPaymentReviewKeepsStringRequestId],
];

for (const [name, runner] of tests) {
  await runner();
  console.log(`✅ ${name}`);
}

console.log(`\n${tests.length}/${tests.length} financial center action tests passed`);
