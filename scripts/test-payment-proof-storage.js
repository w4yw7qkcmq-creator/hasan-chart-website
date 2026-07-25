import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  assertPaymentProofPathOwnedBySession,
  buildPaymentProofObjectPath,
  detectImageMimeFromMagicBytes,
  extensionForMimeType,
  generatePaymentProofNonce,
  isUploadSessionExpired,
  parsePaymentProofObjectPath,
  PAYMENT_PROOF_MAX_BYTES,
  PAYMENT_PROOF_SIGNED_READ_TTL_SECONDS,
  UPLOAD_SESSION_STATUS_COMPLETED,
  UPLOAD_SESSION_STATUS_FAILED,
  UPLOAD_SESSION_STATUS_OPEN,
  validatePaymentProofFileBuffer,
} from "../lib/payment-proof-storage.js";
import { buildSignedUrlPaymentProofResponse } from "../lib/admin-payment-proof-response.js";
import { requireValidSubscriptionRequestId, requireValidUuid } from "../lib/id-validation.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const VALID_UUID = "11111111-1111-4111-8111-111111111111";
const VALID_USER = "22222222-2222-4222-8222-222222222222";

const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);
const JPEG_HEADER = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);
const SVG_SNIPPET = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function testSessionMigrationSql() {
  const sql = read("supabase/migrations/20260726_subscription_upload_sessions.sql");
  assert.match(sql, /subscription_upload_sessions/);
  assert.match(sql, /subscription_request_id bigint/);
  assert.match(sql, /CHECK \(status IN \('open', 'completed', 'failed', 'expired'\)\)/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
}

function testSessionInitInFlow() {
  const source = read("lib/payment-proof-subscription-flow.js");
  assert.match(source, /export async function initUploadSession/);
  assert.match(source, /subscription_upload_sessions/);
  assert.match(source, /UPLOAD_SESSION_STATUS_OPEN/);
  assert.doesNotMatch(source, /subscription_requests[\s\S]*insert[\s\S]*upload_pending/i);
}

function testSessionExpiryHelper() {
  assert.equal(isUploadSessionExpired({ expires_at: new Date(Date.now() - 1000).toISOString() }), true);
  assert.equal(isUploadSessionExpired({ expires_at: new Date(Date.now() + 60000).toISOString() }), false);
}

function testPathOwnership() {
  const nonce = generatePaymentProofNonce();
  const path = buildPaymentProofObjectPath({
    userId: VALID_USER,
    sessionId: VALID_UUID,
    nonce,
    mimeType: "image/png",
  });
  assertPaymentProofPathOwnedBySession(path, { userId: VALID_USER, sessionId: VALID_UUID });
  assert.throws(
    () => assertPaymentProofPathOwnedBySession(path, { userId: "other", sessionId: VALID_UUID }),
    (error) => error.code === "PATH_USER_MISMATCH"
  );
}

function testPathSpoofingRejected() {
  const nonce = generatePaymentProofNonce();
  const path = buildPaymentProofObjectPath({
    userId: VALID_USER,
    sessionId: VALID_UUID,
    nonce,
    mimeType: "image/png",
  });
  assert.throws(
    () => assertPaymentProofPathOwnedBySession(path, { userId: VALID_USER, sessionId: VALID_USER }),
    (error) => error.code === "PATH_SESSION_MISMATCH"
  );
}

function testMimeAllowlist() {
  assert.equal(extensionForMimeType("image/png"), "png");
  assert.equal(extensionForMimeType("text/html"), null);
}

function testMagicBytesPngJpegWebp() {
  assert.equal(detectImageMimeFromMagicBytes(PNG_1PX), "image/png");
  assert.equal(detectImageMimeFromMagicBytes(JPEG_HEADER), "image/jpeg");
}

function testRejectSvgHtml() {
  assert.equal(validatePaymentProofFileBuffer(SVG_SNIPPET).ok, false);
  assert.equal(validatePaymentProofFileBuffer(Buffer.from("<html></html>")).ok, false);
}

function testMaxSize() {
  const oversized = Buffer.alloc(PAYMENT_PROOF_MAX_BYTES + 1, 0);
  oversized[0] = 0xff;
  oversized[1] = 0xd8;
  oversized[2] = 0xff;
  assert.equal(validatePaymentProofFileBuffer(oversized).code, "UPLOAD_TOO_LARGE");
}

function testSignedUploadInFlow() {
  const source = read("lib/payment-proof-subscription-flow.js");
  assert.match(source, /createPaymentProofSignedUploadUrl/);
}

function testSignedReadAdminOnly() {
  const route = read("app/api/admin/financial-center/payment-proof/[requestId]/route.js");
  assert.match(route, /verifyAdminSession/);
  assert.match(route, /createAdminPaymentProofSignedReadUrl/);
}

function testNoServiceRoleInClient() {
  assert.doesNotMatch(read("app/(app)/subscriptions/SubscriptionsAuthenticated.js"), /SERVICE_ROLE/);
}

function testNoFileReaderInSubscriptions() {
  const source = read("app/(app)/subscriptions/SubscriptionsAuthenticated.js");
  assert.doesNotMatch(source, /readAsDataURL/);
  assert.match(source, /sessionId/);
}

function testFinalizeCreatesRequestOnce() {
  const source = read("lib/payment-proof-subscription-flow.js");
  assert.match(source, /\.from\("subscription_requests"\)[\s\S]*\.insert/);
  assert.match(source, /PAYMENT_PROOF_REVIEW_STATUS/);
  assert.match(source, /payment_proof: null/);
}

function testDoubleFinalizeIdempotent() {
  const source = read("lib/payment-proof-subscription-flow.js");
  assert.match(source, /duplicate: true/);
  assert.match(source, /UPLOAD_SESSION_STATUS_COMPLETED/);
  assert.match(source, /existingByPath/);
}

function testObjectMissingHandling() {
  const source = read("lib/payment-proof-storage.js");
  assert.match(source, /downloadPaymentProofObject/);
  assert.match(source, /OBJECT_NOT_FOUND/);
  assert.doesNotMatch(source, /\.list\(/);
}

function testPathUserMismatchInFinalize() {
  const source = read("lib/payment-proof-subscription-flow.js");
  assert.match(source, /OBJECT_PATH_MISMATCH/);
  assert.match(source, /assertPaymentProofPathOwnedBySession/);
}

function testDeclaredMimeMismatch() {
  const result = validatePaymentProofFileBuffer(PNG_1PX, { declaredMime: "image/jpeg" });
  assert.equal(result.code, "MIME_MISMATCH");
}

function testDeclaredSizeMismatch() {
  const result = validatePaymentProofFileBuffer(PNG_1PX, { declaredMime: "image/png", declaredSize: 9999 });
  assert.equal(result.code, "SIZE_MISMATCH");
}

function testFailedSessionNoRequestInsert() {
  const source = read("lib/payment-proof-subscription-flow.js");
  assert.match(source, /markUploadSessionFailed/);
  assert.match(source, /UPLOAD_SESSION_STATUS_FAILED/);
  const failedBlock = source.match(/if \(!validation\.ok\) \{[\s\S]*?\n  \}/)?.[0] || "";
  assert.doesNotMatch(failedBlock, /\.from\("subscription_requests"\)/);
}

function testCompletedSessionLinksRequestId() {
  const source = read("lib/payment-proof-subscription-flow.js");
  assert.match(source, /subscription_request_id: createdRequest\.id/);
}

function testNoUploadStatusesInSubscriptionRequests() {
  const flow = read("lib/payment-proof-subscription-flow.js");
  const admin = read("lib/admin-dashboard-sections.js");
  assert.doesNotMatch(flow, /upload_pending|upload_failed/);
  assert.doesNotMatch(admin, /upload_pending|upload_failed/);
}

function testPathFirstNoLegacyInFirstQuery() {
  const source = read("lib/financial-center/payment-service.js");
  assert.doesNotMatch(
    source.match(/const PAYMENT_PROOF_METADATA_SELECT[\s\S]*?;/)?.[0] || "",
    /payment_proof[^_]/
  );
}

function testLegacyQueryOnlyWhenPathEmpty() {
  const fn = read("lib/financial-center/payment-service.js").match(
    /export async function getPaymentProofForReview[\s\S]*?^}/m
  )?.[0];
  assert.match(fn, /if \(storagePath\)/);
  assert.match(fn, /isPaymentProofLegacyReadEnabled/);
}

function testBase64PostReturns410() {
  const source = read("app/api/subscription-request/route.js");
  assert.match(source, /PAYMENT_PROOF_BASE64_DISABLED/);
  assert.match(source, /410/);
}

function testCleanupSessionDryRunDefault() {
  const source = read("scripts/cleanup-upload-sessions.js");
  assert.match(source, /dryRun: true/);
  assert.match(source, /--execute/);
}

function testOrphanCleanupSkipsLinked() {
  const source = read("scripts/cleanup-payment-proof-orphans.js");
  assert.match(source, /subscription_upload_sessions/);
  assert.match(source, /linkedPaths/);
}

function testMigrationDryRunDefault() {
  const source = read("scripts/migrate-payment-proofs-to-storage.js");
  assert.match(source, /dryRun: true/);
  assert.match(source, /--execute/);
}

function testMigrationIdempotentSkipPath() {
  const source = read("scripts/migrate-payment-proofs-to-storage.js");
  assert.match(source, /path-exists/);
  assert.match(source, /payment_proof_path/);
}

function testNullifyRequiresVerification() {
  const source = read("scripts/nullify-migrated-payment-proofs.js");
  assert.match(source, /validatePaymentProofFileBuffer/);
  assert.match(source, /dryRun: true/);
  assert.match(source, /verification\.ok/);
}

function testBigIntRequestIdAsString() {
  const bigId = "9007199254740993";
  assert.equal(requireValidSubscriptionRequestId(bigId), bigId);
  const parsed = parsePaymentProofObjectPath(
    buildPaymentProofObjectPath({
      userId: VALID_USER,
      sessionId: bigId,
      nonce: generatePaymentProofNonce(),
      mimeType: "image/png",
    })
  );
  assert.equal(parsed.sessionId, bigId);
}

function testSignedUrlResponseShape() {
  const response = buildSignedUrlPaymentProofResponse({
    requestId: "42",
    url: "https://example.supabase.co/sign",
    mimeType: "image/png",
    sizeBytes: 70,
    expiresIn: PAYMENT_PROOF_SIGNED_READ_TTL_SECONDS,
  });
  assert.equal(response.headers.get("X-Payment-Proof-Type"), "signed-url");
}

function testInitApiReturnsSessionId() {
  const source = read("app/api/subscription-request/init/route.js");
  assert.match(source, /sessionId:/);
  assert.match(source, /initUploadSession/);
}

function testAuthorizeRequiresSessionUuid() {
  assert.equal(requireValidUuid(VALID_UUID), VALID_UUID);
  const source = read("app/api/subscription-request/upload-authorize/route.js");
  assert.match(source, /sessionId/);
}

const tests = [
  ["session migration sql", testSessionMigrationSql],
  ["init creates upload session", testSessionInitInFlow],
  ["session expiry helper", testSessionExpiryHelper],
  ["path ownership", testPathOwnership],
  ["path spoofing rejected", testPathSpoofingRejected],
  ["mime allowlist", testMimeAllowlist],
  ["magic bytes png/jpeg", testMagicBytesPngJpegWebp],
  ["reject svg/html", testRejectSvgHtml],
  ["max size", testMaxSize],
  ["signed upload in flow", testSignedUploadInFlow],
  ["signed read admin only", testSignedReadAdminOnly],
  ["no service role in client", testNoServiceRoleInClient],
  ["no FileReader in subscriptions", testNoFileReaderInSubscriptions],
  ["finalize creates request once", testFinalizeCreatesRequestOnce],
  ["double finalize idempotent", testDoubleFinalizeIdempotent],
  ["object missing via download", testObjectMissingHandling],
  ["path mismatch in finalize", testPathUserMismatchInFinalize],
  ["declared mime mismatch", testDeclaredMimeMismatch],
  ["declared size mismatch", testDeclaredSizeMismatch],
  ["failed session no request insert", testFailedSessionNoRequestInsert],
  ["completed session links request id", testCompletedSessionLinksRequestId],
  ["no upload statuses in subscription_requests", testNoUploadStatusesInSubscriptionRequests],
  ["path-first no legacy column", testPathFirstNoLegacyInFirstQuery],
  ["legacy query only when path empty", testLegacyQueryOnlyWhenPathEmpty],
  ["base64 post returns 410", testBase64PostReturns410],
  ["cleanup session dry-run default", testCleanupSessionDryRunDefault],
  ["orphan cleanup skips linked", testOrphanCleanupSkipsLinked],
  ["migration dry-run default", testMigrationDryRunDefault],
  ["migration idempotent skip path", testMigrationIdempotentSkipPath],
  ["nullify requires verification", testNullifyRequiresVerification],
  ["bigint request id as string", testBigIntRequestIdAsString],
  ["signed url response shape", testSignedUrlResponseShape],
  ["init api returns sessionId", testInitApiReturnsSessionId],
  ["authorize requires session uuid", testAuthorizeRequiresSessionUuid],
];

let passed = 0;
for (const [name, run] of tests) {
  run();
  passed += 1;
  console.log(`✓ ${name}`);
}

console.log(`\n${passed}/${tests.length} payment proof storage checks passed`);
