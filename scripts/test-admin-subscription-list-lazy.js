import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  buildInlineDataUrlPaymentProofResponse,
  buildInlinePaymentProofResponse,
  buildUrlPaymentProofResponse,
  decodeInlinePaymentProof,
  INLINE_PAYMENT_PROOF_BINARY_MAX_BYTES,
} from "../lib/admin-payment-proof-response.js";
import { formatSubscriptionRequest } from "../app/(app)/admin/admin-dashboard-helpers.js";
import { buildSubscriptionRequestTimeline } from "../lib/admin-subscription-request-timeline.js";
import {
  fetchPaymentProof,
  PAYMENT_PROOF_FETCH_TIMEOUT_MS,
} from "../lib/admin-financial-center-client.js";
import { getPaymentProofForReview } from "../lib/financial-center/payment-service.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(
  join(__dirname, "../app/(app)/admin/page.js"),
  "utf8"
);
const dashboardSectionsSource = readFileSync(
  join(__dirname, "../lib/admin-dashboard-sections.js"),
  "utf8"
);
const paymentServiceSource = readFileSync(
  join(__dirname, "../lib/financial-center/payment-service.js"),
  "utf8"
);
const rejectSource = readFileSync(
  join(__dirname, "../lib/admin-subscription-request-reject.js"),
  "utf8"
);
const clientSource = readFileSync(
  join(__dirname, "../lib/admin-financial-center-client.js"),
  "utf8"
);
const globalsCssSource = readFileSync(join(__dirname, "../app/globals.css"), "utf8");
const adminThemeSource = readFileSync(
  join(__dirname, "../app/(app)/admin/admin-theme.css"),
  "utf8"
);
const rejectModalSource = readFileSync(
  join(__dirname, "../app/(app)/admin/components/SubscriptionRejectModal.js"),
  "utf8"
);

const INLINE_PROOF =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function testSubscriptionListSelectExcludesPaymentProof() {
  const match = dashboardSectionsSource.match(
    /export const SUBSCRIPTION_LIST_SELECT_FIELDS\s*=\s*"([^"]+)"/
  );
  assert.ok(match, "SUBSCRIPTION_LIST_SELECT_FIELDS export missing");
  assert.doesNotMatch(match[1], /payment_proof[^_]/);
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
      headers: {
        get(name) {
          if (name === "content-type") return "application/json";
          return "";
        },
      },
      async json() {
        return {
          success: true,
          proofType: "url",
          url: "https://cdn.example.com/proof.jpg",
          requestId: "11111111-1111-4111-8111-111111111111",
        };
      },
    };
  };

  const proof = await fetchPaymentProof(adminFetch, "11111111-1111-4111-8111-111111111111");
  assert.equal(proof.proof, "https://cdn.example.com/proof.jpg");
  assert.equal(proof.proofType, "url");
  assert.match(calls[0].url, /\/api\/admin\/financial-center\/payment-proof\//);
}

async function testLazyPaymentProofFetchHandlesBinaryResponse() {
  const pngBytes = decodeInlinePaymentProof(INLINE_PROOF).buffer;
  const adminFetch = async () => ({
    ok: true,
    headers: {
      get(name) {
        if (name === "content-type") return "image/png";
        if (name === "X-Payment-Proof-Request-Id") return "11111111-1111-4111-8111-111111111111";
        return "";
      },
    },
    async blob() {
      return new Blob([pngBytes], { type: "image/png" });
    },
  });

  const proof = await fetchPaymentProof(adminFetch, "11111111-1111-4111-8111-111111111111");
  assert.equal(proof.proofType, "binary");
  assert.match(proof.imageUrl, /^blob:/);
  proof.revoke();
}

function testPaymentProofServiceSelectsMinimalFields() {
  assert.match(paymentServiceSource, /PAYMENT_PROOF_METADATA_SELECT/);
  assert.doesNotMatch(
    paymentServiceSource.match(/const PAYMENT_PROOF_METADATA_SELECT[\s\S]*?;/)?.[0] || "",
    /payment_proof[^_]/
  );
  assert.match(paymentServiceSource, /legacyRow/);
  assert.match(paymentServiceSource, /isPaymentProofLegacyReadEnabled/);
}

async function testPaymentProofServiceReturnsStorageMetadataFirst() {
  const supabase = {
    from() {
      return {
        select(columns) {
          return {
            eq(_column, value) {
              return {
                async maybeSingle() {
                  if (String(columns).includes("payment_proof_path")) {
                    return {
                      data: {
                        id: value,
                        payment_proof_path: `${value}/9007199254740993/nonce.png`,
                        payment_proof_mime_type: "image/png",
                        payment_proof_size_bytes: 128,
                        payment_proof_uploaded_at: "2026-07-18T00:00:00.000Z",
                      },
                      error: null,
                    };
                  }
                  return { data: null, error: null };
                },
              };
            },
          };
        },
      };
    },
  };

  const result = await getPaymentProofForReview(supabase, "11111111-1111-4111-8111-111111111111");
  assert.equal(result.source, "storage");
  assert.ok(result.storagePath);
  assert.equal(result.mimeType, "image/png");
}

async function testPaymentProofServiceReturnsEstimatedBytesForLegacyFallback() {
  const previousLegacyFlag = process.env.PAYMENT_PROOF_LEGACY_READ_ENABLED;
  process.env.PAYMENT_PROOF_LEGACY_READ_ENABLED = "true";

  let queryCount = 0;
  const supabase = {
    from() {
      return {
        select(columns) {
          return {
            eq(_column, value) {
              return {
                async maybeSingle() {
                  queryCount += 1;
                  if (String(columns).includes("payment_proof_path")) {
                    return {
                      data: {
                        id: value,
                        payment_proof_path: "",
                        payment_proof_mime_type: null,
                        payment_proof_size_bytes: null,
                        payment_proof_uploaded_at: null,
                      },
                      error: null,
                    };
                  }
                  return {
                    data: {
                      id: value,
                      payment_proof: INLINE_PROOF,
                    },
                    error: null,
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  try {
    const result = await getPaymentProofForReview(supabase, "11111111-1111-4111-8111-111111111111");
    assert.equal(queryCount, 2);
    assert.equal(result.isInline, true);
    assert.ok(result.proofBytes > 0);
  } finally {
    if (previousLegacyFlag === undefined) {
      delete process.env.PAYMENT_PROOF_LEGACY_READ_ENABLED;
    } else {
      process.env.PAYMENT_PROOF_LEGACY_READ_ENABLED = previousLegacyFlag;
    }
  }
}

function testPaymentProofResponseSizeImprovement() {
  const { buffer } = decodeInlinePaymentProof(INLINE_PROOF);
  const legacyJsonBytes = Buffer.byteLength(
    JSON.stringify({ success: true, proof: { proof: INLINE_PROOF } })
  );

  assert.ok(buffer.length < legacyJsonBytes);
  console.log(`  binary response bytes=${buffer.length}, legacy json bytes=${legacyJsonBytes}`);
}
function testInlinePaymentProofResponseIsBinary() {
  const response = buildInlinePaymentProofResponse(INLINE_PROOF, {
    requestId: "11111111-1111-4111-8111-111111111111",
  });

  assert.equal(response.headers.get("Content-Type"), "image/png");
  assert.equal(response.headers.get("X-Payment-Proof-Type"), "inline-binary");
}

function testUrlPaymentProofResponseReturnsJsonUrl() {
  const response = buildUrlPaymentProofResponse({
    requestId: "11111111-1111-4111-8111-111111111111",
    url: "https://cdn.example.com/proof.jpg",
  });

  assert.equal(response.headers.get("X-Payment-Proof-Type"), "url");
}

function testPaymentProofFetchTimeoutConstant() {
  assert.equal(PAYMENT_PROOF_FETCH_TIMEOUT_MS, 15000);
  assert.match(clientSource, /تعذر تحميل إثبات الدفع خلال الوقت المحدد/);
}

function testPageRevokesProofObjectUrlOnClose() {
  assert.match(pageSource, /subscriptionProofRevokeRef/);
  assert.match(pageSource, /subscriptionProofRevokeRef\.current\?\.\(\)/);
}

function testRejectFetchDoesNotLoadPaymentProofColumn() {
  assert.match(rejectSource, /\.select\("id,user_email,username,plan_name,price,status,created_at"\)/);
  assert.doesNotMatch(rejectSource, /select\("[^"]*payment_proof/);
}

function testRejectModalShowsApiErrorInline() {
  assert.match(rejectModalSource, /apiError/);
  assert.match(pageSource, /subscriptionRejectApiError/);
  assert.doesNotMatch(pageSource, /showAdminNotice\(flowResult\.errorMessage \|\| "تعذر رفض طلب الاشتراك", "error"\)/);
}

async function testLazyPaymentProofFetchSurfacesErrors() {
  const adminFetch = async () => ({
    ok: false,
    headers: {
      get() {
        return "";
      },
    },
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

function testInlineDataUrlPaymentProofResponse() {
  const response = buildInlineDataUrlPaymentProofResponse(INLINE_PROOF, {
    requestId: "11111111-1111-4111-8111-111111111111",
  });

  assert.equal(response.headers.get("Content-Type"), "application/json; charset=utf-8");
  assert.equal(response.headers.get("X-Payment-Proof-Type"), "inline-data-url");
}

async function testLazyPaymentProofFetchHandlesInlineDataUrlJson() {
  const adminFetch = async () => ({
    ok: true,
    headers: {
      get(name) {
        if (name === "content-type") return "application/json; charset=utf-8";
        return "";
      },
    },
    async json() {
      return {
        success: true,
        proofType: "inline-data-url",
        url: INLINE_PROOF,
        requestId: "11111111-1111-4111-8111-111111111111",
      };
    },
  });

  const proof = await fetchPaymentProof(adminFetch, "11111111-1111-4111-8111-111111111111");
  assert.equal(proof.proofType, "inline-data-url");
  assert.match(proof.imageUrl, /^data:image\//);
}

async function testLazyPaymentProofFetchHandles401() {
  const adminFetch = async () => ({
    ok: false,
    status: 401,
    headers: {
      get(name) {
        if (name === "content-type") return "application/json";
        return "";
      },
    },
    async json() {
      return { success: false, error: "Unauthorized" };
    },
  });

  await assert.rejects(
    () => fetchPaymentProof(adminFetch, "11111111-1111-4111-8111-111111111111"),
    /Unauthorized/
  );
}

async function testLazyPaymentProofFetchHandles403() {
  const adminFetch = async () => ({
    ok: false,
    status: 403,
    headers: {
      get(name) {
        if (name === "content-type") return "application/json";
        return "";
      },
    },
    async json() {
      return { success: false, error: "Forbidden" };
    },
  });

  await assert.rejects(
    () => fetchPaymentProof(adminFetch, "11111111-1111-4111-8111-111111111111"),
    /Forbidden/
  );
}

async function testLazyPaymentProofFetchHandlesUnexpectedContentType() {
  const adminFetch = async () => ({
    ok: true,
    status: 200,
    headers: {
      get(name) {
        if (name === "content-type") return "text/html";
        return "";
      },
    },
  });

  await assert.rejects(
    () => fetchPaymentProof(adminFetch, "11111111-1111-4111-8111-111111111111"),
    /نوع استجابة غير متوقع/
  );
}

function testLargeInlineProofUsesDataUrlThreshold() {
  assert.ok(INLINE_PAYMENT_PROOF_BINARY_MAX_BYTES >= 256 * 1024);
  const routeSource = readFileSync(
    new URL("../app/api/admin/financial-center/payment-proof/[requestId]/route.js", import.meta.url),
    "utf8"
  );
  assert.match(routeSource, /buildInlineDataUrlPaymentProofResponse/);
  assert.match(routeSource, /INLINE_PAYMENT_PROOF_BINARY_MAX_BYTES/);
}

function testSubscriptionsLightThemeHasReadablePlanCards() {
  assert.match(globalsCssSource, /html\[data-theme="light"\] \.subscriptions-page__bg/);
  assert.match(globalsCssSource, /html\[data-theme="light"\] \.subscriptions-plan-card/);
  assert.match(globalsCssSource, /html\[data-theme="dark"\] \.subscriptions-plan-card/);
}

function testAdminSubscriptionStateStylesScopedToAdminShell() {
  assert.match(
    adminThemeSource,
    /html\[data-theme="light"\] \.admin-theme-page \.admin-subscription-state--active/
  );
  assert.doesNotMatch(
    adminThemeSource,
    /html\[data-theme="light"\] \.admin-subscription-state--active \{/
  );
}

function testProofPreviewModalUsesNativeImage() {
  const modalSource = readFileSync(
    join(__dirname, "../app/(app)/admin/components/AdminProofPreviewModal.js"),
    "utf8"
  );
  assert.match(modalSource, /<img/);
  assert.doesNotMatch(modalSource, /from "next\/image"/);
}

async function testLazyPaymentProofFetchHandlesSignedUrlJson() {
  const adminFetch = async () => ({
    ok: true,
    headers: {
      get(name) {
        if (name === "content-type") return "application/json; charset=utf-8";
        if (name === "X-Payment-Proof-Type") return "signed-url";
        return "";
      },
    },
    async json() {
      return {
        success: true,
        proofType: "signed-url",
        url: "https://example.supabase.co/storage/v1/object/sign/payment-proofs/u/r/n.png?token=abc",
        requestId: "11111111-1111-4111-8111-111111111111",
        mimeType: "image/png",
        sizeBytes: 128,
        expiresIn: 120,
      };
    },
  });

  const proof = await fetchPaymentProof(adminFetch, "11111111-1111-4111-8111-111111111111");
  assert.equal(proof.proofType, "signed-url");
  assert.match(proof.imageUrl, /^https:\/\//);
}

function testPaymentProofRouteUsesSignedUrlForStorage() {
  const routeSource = readFileSync(
    new URL("../app/api/admin/financial-center/payment-proof/[requestId]/route.js", import.meta.url),
    "utf8"
  );

  assert.match(routeSource, /buildSignedUrlPaymentProofResponse/);
  assert.match(routeSource, /"signed-url"/);
}

function testPaymentProofRouteUsesCentralSubscriptionIdValidator() {
  const routeSource = readFileSync(
    new URL("../app/api/admin/financial-center/payment-proof/[requestId]/route.js", import.meta.url),
    "utf8"
  );

  assert.match(routeSource, /requireValidSubscriptionRequestId/);
  assert.doesNotMatch(routeSource, /requireValidUuid/);
}

const tests = [
  ["subscription list select excludes payment_proof", testSubscriptionListSelectExcludesPaymentProof],
  ["formatted subscription request has no proof payload", testFormattedSubscriptionRequestHasNoProofPayload],
  ["timeline still shows payment proof event with flag", testTimelineStillShowsPaymentProofEventWithFlag],
  ["lazy payment proof fetch uses financial center route", testLazyPaymentProofFetchUsesFinancialCenterRoute],
  ["lazy payment proof fetch handles binary response", testLazyPaymentProofFetchHandlesBinaryResponse],
  ["payment proof service selects minimal fields", testPaymentProofServiceSelectsMinimalFields],
  ["payment proof service returns storage metadata first", testPaymentProofServiceReturnsStorageMetadataFirst],
  ["payment proof service returns estimated bytes for legacy fallback", testPaymentProofServiceReturnsEstimatedBytesForLegacyFallback],
  ["payment proof response size improvement", testPaymentProofResponseSizeImprovement],
  ["inline payment proof response is binary", testInlinePaymentProofResponseIsBinary],
  ["inline data url payment proof response", testInlineDataUrlPaymentProofResponse],
  ["lazy payment proof fetch handles inline data url json", testLazyPaymentProofFetchHandlesInlineDataUrlJson],
  ["lazy payment proof fetch handles 401", testLazyPaymentProofFetchHandles401],
  ["lazy payment proof fetch handles 403", testLazyPaymentProofFetchHandles403],
  ["lazy payment proof fetch handles unexpected content type", testLazyPaymentProofFetchHandlesUnexpectedContentType],
  ["large inline proof uses data url threshold", testLargeInlineProofUsesDataUrlThreshold],
  ["subscriptions light theme has readable plan cards", testSubscriptionsLightThemeHasReadablePlanCards],
  ["admin subscription state styles scoped to admin shell", testAdminSubscriptionStateStylesScopedToAdminShell],
  ["proof preview modal uses native image", testProofPreviewModalUsesNativeImage],
  ["url payment proof response returns json url", testUrlPaymentProofResponseReturnsJsonUrl],
  ["payment proof fetch timeout constant", testPaymentProofFetchTimeoutConstant],
  ["lazy payment proof fetch surfaces errors", testLazyPaymentProofFetchSurfacesErrors],
  ["page uses lazy subscription proof preview", testPageUsesLazySubscriptionProofPreview],
  ["page clears proof preview on close", testPageClearsProofPreviewOnClose],
  ["page revokes proof object url on close", testPageRevokesProofObjectUrlOnClose],
  ["reject fetch does not load payment_proof column", testRejectFetchDoesNotLoadPaymentProofColumn],
  ["reject modal shows api error inline", testRejectModalShowsApiErrorInline],
  ["lazy payment proof fetch handles signed url json", testLazyPaymentProofFetchHandlesSignedUrlJson],
  ["payment proof route uses signed url for storage", testPaymentProofRouteUsesSignedUrlForStorage],
  ["payment proof route uses central subscription id validator", testPaymentProofRouteUsesCentralSubscriptionIdValidator],
];

let passed = 0;

for (const [name, run] of tests) {
  await run();
  passed += 1;
  console.log(`✓ ${name}`);
}

console.log(`\n${passed}/${tests.length} subscription list lazy-load checks passed`);
