import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { formatSubscriptionRequest } from "../app/(app)/admin/admin-dashboard-helpers.js";
import { buildSubscriptionRequestTimeline } from "../lib/admin-subscription-request-timeline.js";
import { fetchPaymentProof } from "../lib/admin-financial-center-client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(
  join(__dirname, "../app/(app)/admin/page.js"),
  "utf8"
);
const dashboardSectionsSource = readFileSync(
  join(__dirname, "../lib/admin-dashboard-sections.js"),
  "utf8"
);

function testSubscriptionListSelectExcludesPaymentProof() {
  const match = dashboardSectionsSource.match(
    /export const SUBSCRIPTION_LIST_SELECT_FIELDS\s*=\s*"([^"]+)"/
  );
  assert.ok(match, "SUBSCRIPTION_LIST_SELECT_FIELDS export missing");
  assert.doesNotMatch(match[1], /payment_proof/);
}

function testFormattedSubscriptionRequestHasNoProofPayload() {
  const formatted = formatSubscriptionRequest({
    id: "11111111-1111-4111-8111-111111111111",
    user_email: "user@example.com",
    username: "User",
    plan_name: "VIP Spot",
    category: "spot",
    price: "50",
    telegram_username: "@user",
    has_payment_proof: true,
    status: "بانتظار المراجعة",
    created_at: "2026-06-10T07:22:00.000Z",
    timeline: [],
    timeline_summary: {
      totalEvents: 2,
      lastUpdateLabel: "—",
      lastAdminEmail: "—",
      hasAdminHistory: false,
    },
  });

  assert.equal(formatted.hasPaymentProof, true);
  assert.equal(formatted.paymentProof, "");
  assert.equal(JSON.stringify(formatted).includes("data:image"), false);
}

function testTimelineStillShowsPaymentProofEventWithFlag() {
  const timeline = buildSubscriptionRequestTimeline(
    {
      id: "11111111-1111-4111-8111-111111111111",
      plan_name: "VIP Spot",
      created_at: "2026-06-10T07:22:00.000Z",
      has_payment_proof: true,
    },
    []
  );

  assert.equal(
    timeline.some((event) => event.type === "payment_proof"),
    true
  );
}

async function testLazyPaymentProofFetchUsesFinancialCenterRoute() {
  const calls = [];
  const adminFetch = async (url, options = {}) => {
    calls.push({ url, options });
    return {
      ok: true,
      async json() {
        return {
          success: true,
          proof: {
            requestId: "11111111-1111-4111-8111-111111111111",
            proof: "https://cdn.example.com/proof.jpg",
          },
        };
      },
    };
  };

  const proof = await fetchPaymentProof(adminFetch, "11111111-1111-4111-8111-111111111111");
  assert.equal(proof.proof, "https://cdn.example.com/proof.jpg");
  assert.match(calls[0].url, /\/api\/admin\/financial-center\/payment-proof\//);
}

async function testLazyPaymentProofFetchSurfacesErrors() {
  const adminFetch = async () => ({
    ok: false,
    async json() {
      return { success: false, error: "تعذر تحميل إثبات الدفع" };
    },
  });

  await assert.rejects(
    () => fetchPaymentProof(adminFetch, "11111111-1111-4111-8111-111111111111"),
    /تعذر تحميل إثبات الدفع/
  );
}

function testPageUsesLazySubscriptionProofPreview() {
  assert.match(pageSource, /openSubscriptionProofPreview\(req\.id\)/);
  assert.match(pageSource, /fetchPaymentProof/);
  assert.match(pageSource, /subscriptionProofAbortRef/);
  assert.doesNotMatch(pageSource, /setProofPreview\(req\.paymentProof\)/);
}

function testPageClearsProofPreviewOnClose() {
  assert.match(pageSource, /closeProofPreview/);
  assert.match(pageSource, /subscriptionProofAbortRef\.current\?\.abort\(\)/);
  assert.match(pageSource, /setSubscriptionProofPreview\(null\)/);
}

const tests = [
  ["subscription list select excludes payment_proof", testSubscriptionListSelectExcludesPaymentProof],
  ["formatted subscription request has no proof payload", testFormattedSubscriptionRequestHasNoProofPayload],
  ["timeline still shows payment proof event with flag", testTimelineStillShowsPaymentProofEventWithFlag],
  ["lazy payment proof fetch uses financial center route", testLazyPaymentProofFetchUsesFinancialCenterRoute],
  ["lazy payment proof fetch surfaces errors", testLazyPaymentProofFetchSurfacesErrors],
  ["page uses lazy subscription proof preview", testPageUsesLazySubscriptionProofPreview],
  ["page clears proof preview on close", testPageClearsProofPreviewOnClose],
];

let passed = 0;

for (const [name, run] of tests) {
  await run();
  passed += 1;
  console.log(`✓ ${name}`);
}

console.log(`\n${passed}/${tests.length} subscription list lazy-load checks passed`);
