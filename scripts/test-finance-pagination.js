#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FINANCIAL_DEFAULT_PAGE_SIZE,
  FINANCIAL_MAX_PAGE_SIZE,
  clampPageSize,
} from "../lib/financial-center/financial-center-shared.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function testDefaultMaxLimits() {
  assert.equal(FINANCIAL_DEFAULT_PAGE_SIZE, 25);
  assert.equal(clampPageSize(999), FINANCIAL_MAX_PAGE_SIZE);
  assert.equal(clampPageSize(25), 25);
}

function testNoProofBlobInListColumns() {
  const shared = read("lib/financial-center/financial-center-shared.js");
  assert.match(shared, /FINANCIAL_SUBSCRIPTION_PROOF_LIST_COLUMNS/);
  const listCols = shared.match(/FINANCIAL_SUBSCRIPTION_PROOF_LIST_COLUMNS\s*=\s*"([^"]+)"/)?.[1] || "";
  assert.equal(/(?:^|,)payment_proof(?!_)(?:,|$)/.test(listCols), false);
}

function testIncludeTotalExplicit() {
  assert.match(read("lib/financial-center/subscription-service.js"), /includeTotal/);
  assert.match(read("app/api/admin/financial-center/route.js"), /includeTotal/);
}

function testNoSignedUrlInPaymentList() {
  const payment = read("lib/financial-center/payment-service.js");
  assert.doesNotMatch(payment, /proofUrl:/);
  assert.match(payment, /proofAvailable/);
}

function testClientFilterScanCap() {
  assert.match(read("lib/financial-center/financial-center-shared.js"), /FINANCIAL_CLIENT_FILTER_SCAN_MAX = 500/);
  assert.doesNotMatch(read("lib/financial-center/subscription-service.js"), /limit\(1000\)/);
}

function testCacheControl() {
  assert.match(read("app/api/admin/financial-center/route.js"), /CACHE_NO_STORE/);
}

function testDetailSignedUrlSeparate() {
  assert.match(read("app/api/admin/financial-center/payment-proof/[requestId]/route.js"), /signedUrl|createAdminPaymentProofSignedReadUrl/);
}

const tests = [
  testDefaultMaxLimits,
  testNoProofBlobInListColumns,
  testIncludeTotalExplicit,
  testNoSignedUrlInPaymentList,
  testClientFilterScanCap,
  testCacheControl,
  testDetailSignedUrlSeparate,
];

for (const test of tests) {
  test();
}

console.log(`finance-pagination: ${tests.length} passed`);
