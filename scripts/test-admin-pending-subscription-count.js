import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ADMIN_HUB_QUICK_NAV_ITEMS } from "../app/(app)/admin/components/admin-hub-config.js";
import {
  countSubscriptionStatusFilter,
  isNewPendingSubscriptionRequest,
  matchesSubscriptionStatusFilter,
} from "../app/(app)/admin/admin-dashboard-helpers.js";
import {
  countPendingSubscriptionRequestRows,
  explainPendingSubscriptionRequestRow,
  isPendingSubscriptionRequestRow,
} from "../lib/admin-pending-subscription-request.js";
import { countPendingPaymentReviewRows, isPendingPaymentReviewRow } from "../lib/financial-center/pending-payment-review.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dashboardSectionsSource = readFileSync(
  join(__dirname, "../lib/admin-dashboard-sections.js"),
  "utf8"
);
const adminPageSource = readFileSync(join(__dirname, "../app/(app)/admin/page.js"), "utf8");

const pendingArabicWithProof = {
  id: 57,
  status: "بانتظار المراجعة",
  payment_proof_path: "user/session/a.png",
  admin_disabled: false,
};
const legacyPendingWithoutProof = {
  id: 8,
  status: "pending",
  payment_proof_path: "",
  payment_proof: "",
  admin_disabled: false,
};

function testHubAndTabShareHelper() {
  assert.match(dashboardSectionsSource, /countPendingSubscriptionRequests/);
  assert.match(adminPageSource, /matchesSubscriptionStatusFilter/);
  assert.match(adminPageSource, /subscriptionPendingBadgeCount/);
}

function testThreePendingInTabEqualsHubThree() {
  const rows = [
    pendingArabicWithProof,
    { ...pendingArabicWithProof, id: 53 },
    { ...pendingArabicWithProof, id: 51, payment_proof_path: "user/session/b.png" },
    legacyPendingWithoutProof,
  ];
  const pendingCount = countPendingSubscriptionRequestRows(rows);
  assert.equal(pendingCount, 3);
  assert.equal(countSubscriptionStatusFilter(rows, "pending"), 3);
}

function testLegacyWithoutProofExcluded() {
  const rows = [legacyPendingWithoutProof, { ...legacyPendingWithoutProof, id: 9 }];
  assert.equal(countPendingSubscriptionRequestRows(rows), 0);
  assert.equal(explainPendingSubscriptionRequestRow(legacyPendingWithoutProof).reason, "legacy_english_pending_without_proof");
}

function testFinancialCounterStaysProofBased() {
  const rows = [
    pendingArabicWithProof,
    legacyPendingWithoutProof,
    { ...pendingArabicWithProof, id: 53 },
  ];
  assert.equal(countPendingPaymentReviewRows(rows), 2);
  assert.equal(countPendingSubscriptionRequestRows(rows), 2);
}

function testCountersCanDifferWhenDataDiffers() {
  const rows = [
    {
      id: 1,
      status: "بانتظار المعالجة",
      payment_proof_path: "",
      payment_proof: "",
      admin_disabled: false,
    },
    pendingArabicWithProof,
  ];
  assert.equal(countPendingSubscriptionRequestRows(rows), 2);
  assert.equal(countPendingPaymentReviewRows(rows), 1);
}

function testConfirmedRejectedEndedExcluded() {
  assert.equal(isPendingSubscriptionRequestRow({ status: "مفعل", started_at: "2026-01-01" }), false);
  assert.equal(isPendingSubscriptionRequestRow({ status: "مرفوض" }), false);
  assert.equal(isPendingSubscriptionRequestRow({ status: "منتهي" }), false);
}

function testUnknownExcludedWithoutMapping() {
  assert.equal(isPendingSubscriptionRequestRow({ status: "حالة_غير_معروفة" }), false);
  assert.equal(explainPendingSubscriptionRequestRow({ status: "حالة_غير_معروفة" }).reason, "unknown_status_without_mapping");
}

function testAdminDisabledExcluded() {
  assert.equal(
    isPendingSubscriptionRequestRow({
      status: "بانتظار المراجعة",
      admin_disabled: true,
    }),
    false
  );
}

function testAcceptRejectDecrementOnce() {
  assert.match(adminPageSource, /subscriptionsPending: Math\.max\(0, Number\(current\.subscriptionsPending \|\| 0\) - 1\)/);
}

function testCardsUseDifferentStatKeys() {
  const financial = ADMIN_HUB_QUICK_NAV_ITEMS.find((item) => item.id === "financial");
  const subscriptions = ADMIN_HUB_QUICK_NAV_ITEMS.find((item) => item.id === "subscriptions");
  assert.equal(financial.statKey, "pendingPaymentReviews");
  assert.equal(subscriptions.statKey, "pendingSubscriptions");
}

function testFilterUsesSameHelper() {
  assert.equal(matchesSubscriptionStatusFilter(pendingArabicWithProof, "pending"), true);
  assert.equal(matchesSubscriptionStatusFilter(legacyPendingWithoutProof, "pending"), false);
  assert.equal(isNewPendingSubscriptionRequest(pendingArabicWithProof), true);
}

const tests = [
  ["hub and tab share helper", testHubAndTabShareHelper],
  ["3 pending in tab equals hub 3", testThreePendingInTabEqualsHubThree],
  ["legacy without proof excluded", testLegacyWithoutProofExcluded],
  ["financial counter stays proof based", testFinancialCounterStaysProofBased],
  ["counters can differ when data differs", testCountersCanDifferWhenDataDiffers],
  ["confirmed rejected ended excluded", testConfirmedRejectedEndedExcluded],
  ["unknown excluded without mapping", testUnknownExcludedWithoutMapping],
  ["admin disabled excluded", testAdminDisabledExcluded],
  ["accept reject decrement once", testAcceptRejectDecrementOnce],
  ["cards use different stat keys", testCardsUseDifferentStatKeys],
  ["filter uses same helper", testFilterUsesSameHelper],
];

for (const [name, runner] of tests) {
  runner();
  console.log(`✅ ${name}`);
}

console.log(`\n${tests.length}/${tests.length} pending subscription count tests passed`);
