#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isPendingPaymentReviewRow } from "../lib/financial-center/pending-payment-review.js";
import { normalizeSubscriptionStatus } from "../lib/financial-center/financial-center-shared.js";
import { SUBSCRIPTION_STATUSES } from "../lib/financial-center/financial-types.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function testSqlPendingParityFunctionsExist() {
  const migration = read("supabase/migrations/20260805_financial_list_db_pagination.sql");
  assert.match(migration, /financial_is_pending_payment_review_row/);
  assert.match(migration, /financial_normalize_subscription_status/);
  assert.match(migration, /count_pending_payment_reviews_db/);
}

function testPendingHelperParity() {
  const pendingRow = {
    status: "بانتظار المراجعة",
    payment_proof_path: "proofs/x.jpg",
    started_at: null,
  };
  const excludedRow = {
    status: "مفعل",
    payment_proof_path: "proofs/x.jpg",
    started_at: "2026-01-01T00:00:00.000Z",
  };
  assert.equal(isPendingPaymentReviewRow(pendingRow), true);
  assert.equal(isPendingPaymentReviewRow(excludedRow), false);
}

function testNormalizedStatusParity() {
  assert.equal(
    normalizeSubscriptionStatus("active", { adminDisabled: false, expiresAt: "2099-01-01T00:00:00.000Z" }),
    SUBSCRIPTION_STATUSES.ACTIVE
  );
  assert.equal(
    normalizeSubscriptionStatus("active", { adminDisabled: true, expiresAt: null }),
    SUBSCRIPTION_STATUSES.SUSPENDED
  );
  assert.equal(
    normalizeSubscriptionStatus("active", {
      adminDisabled: false,
      expiresAt: "2020-01-01T00:00:00.000Z",
    }),
    SUBSCRIPTION_STATUSES.EXPIRED
  );
}

function testCountUsesSameRpc() {
  assert.match(read("lib/financial-center/pending-payment-review.js"), /count_pending_payment_reviews_db/);
  assert.match(read("lib/financial-center/build-financial-list-query.js"), /count_pending_payment_reviews_db/);
}

function testAllFiltersInSqlMigration() {
  const migration = read("supabase/migrations/20260805_financial_list_db_pagination.sql");
  for (const token of ["p_status", "p_service", "p_source", "p_paid", "p_started_from", "p_expires_to", "p_search"]) {
    assert.match(migration, new RegExp(token));
  }
}

function testPaymentReviewStatusFilterInSql() {
  const migration = read("supabase/migrations/20260805_financial_list_db_pagination.sql");
  assert.match(migration, /financial_resolve_payment_review_status/);
  assert.match(migration, /p_review_status/);
}

const tests = [
  testSqlPendingParityFunctionsExist,
  testPendingHelperParity,
  testNormalizedStatusParity,
  testCountUsesSameRpc,
  testAllFiltersInSqlMigration,
  testPaymentReviewStatusFilterInSql,
];

for (const test of tests) {
  test();
}

console.log(`finance-filter-parity: ${tests.length} passed`);
