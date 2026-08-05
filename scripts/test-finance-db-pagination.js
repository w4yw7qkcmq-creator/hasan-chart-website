#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function testNoScanCapConstant() {
  assert.doesNotMatch(read("lib/financial-center/financial-center-shared.js"), /FINANCIAL_CLIENT_FILTER_SCAN_MAX/);
  assert.doesNotMatch(read("lib/financial-center/subscription-service.js"), /CLIENT_FILTER_SCAN/);
  assert.doesNotMatch(read("lib/financial-center/payment-service.js"), /CLIENT_FILTER_SCAN/);
}

function testNoMemorySliceAfterFetch() {
  const subscription = read("lib/financial-center/subscription-service.js");
  const payment = read("lib/financial-center/payment-service.js");
  assert.doesNotMatch(subscription, /filtered\.slice|applyClientFilters|clientFiltered|scannedRows|FINANCIAL_CLIENT_FILTER/);
  assert.doesNotMatch(payment, /filtered\.slice|clientFiltered|FINANCIAL_CLIENT_FILTER|\.limit\(FINANCIAL/);
}

function testUsesDbRpc() {
  assert.match(read("lib/financial-center/build-financial-list-query.js"), /list_financial_subscriptions/);
  assert.match(read("lib/financial-center/build-financial-list-query.js"), /list_financial_payment_reviews/);
  assert.match(read("lib/financial-center/subscription-service.js"), /fetchFinancialSubscriptionsPage/);
  assert.match(read("lib/financial-center/payment-service.js"), /fetchFinancialPaymentReviewsPage/);
}

function testCursorPagination() {
  assert.match(read("lib/financial-center/build-financial-list-query.js"), /decodeCursor/);
  assert.match(read("app/api/admin/financial-center/route.js"), /decodeCursor/);
  assert.match(read("app/api/admin/financial-center/route.js"), /400/);
}

function testDefaultMaxLimits() {
  assert.match(read("lib/financial-center/financial-center-shared.js"), /FINANCIAL_DEFAULT_PAGE_SIZE = 25/);
  assert.match(read("lib/financial-center/financial-center-shared.js"), /FINANCIAL_MAX_PAGE_SIZE = 100/);
}

function testIncludeTotalExplicit() {
  assert.match(read("lib/financial-center/build-financial-list-query.js"), /includeTotal/);
  assert.match(read("app/api/admin/financial-center/route.js"), /includeTotal/);
}

function testNoSignedUrlInList() {
  assert.doesNotMatch(read("lib/financial-center/payment-service.js"), /proofUrl:/);
  assert.match(read("lib/financial-center/payment-service.js"), /proofAvailable/);
}

function testUiDebouncedSearch() {
  assert.match(read("app/(app)/admin/components/FinancialCenterPanel.js"), /debouncedSearch/);
  assert.match(read("app/(app)/admin/components/FinancialCenterPanel.js"), /setTimeout/);
  assert.match(read("app/(app)/admin/components/FinancialCenterPanel.js"), /AbortController/);
}

function testLoadMoreCursor() {
  assert.match(read("app/(app)/admin/components/FinancialCenterPanel.js"), /nextCursor/);
  assert.match(read("app/(app)/admin/components/FinancialCenterPanel.js"), /تحميل المزيد/);
}

const tests = [
  testNoScanCapConstant,
  testNoMemorySliceAfterFetch,
  testUsesDbRpc,
  testCursorPagination,
  testDefaultMaxLimits,
  testIncludeTotalExplicit,
  testNoSignedUrlInList,
  testUiDebouncedSearch,
  testLoadMoreCursor,
];

for (const test of tests) {
  test();
}

console.log(`finance-db-pagination: ${tests.length} passed`);
