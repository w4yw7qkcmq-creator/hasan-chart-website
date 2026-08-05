#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function testCursorIndexExists() {
  const migration = read("supabase/migrations/20260805_financial_list_db_pagination.sql");
  assert.match(migration, /subscription_requests_admin_created_at_id_idx/);
  assert.match(migration, /created_at DESC, id DESC/);
}

function testLimitPlusOneInRpc() {
  const migration = read("supabase/migrations/20260805_financial_list_db_pagination.sql");
  assert.match(migration, /LIMIT GREATEST\(LEAST\(coalesce\(p_limit, 25\), 100\), 1\) \+ 1/);
}

function testSecurityInvoker() {
  const migration = read("supabase/migrations/20260805_financial_list_db_pagination.sql");
  assert.match(migration, /SECURITY INVOKER/);
}

function testExplicitProjectionNotSelectStar() {
  const migration = read("supabase/migrations/20260805_financial_list_db_pagination.sql");
  assert.doesNotMatch(migration, /SELECT sr\.\*/);
  assert.match(migration, /sr\.user_email/);
  assert.match(migration, /proof_available/);
}

function testStableOrderInRpc() {
  const migration = read("supabase/migrations/20260805_financial_list_db_pagination.sql");
  assert.match(migration, /ORDER BY sr\.created_at DESC, sr\.id DESC/);
}

function testCountMatchesFilterFunction() {
  const migration = read("supabase/migrations/20260805_financial_list_db_pagination.sql");
  assert.match(migration, /financial_subscription_matches_filters/);
  assert.match(migration, /count_financial_subscriptions/);
  assert.match(migration, /count_financial_payment_reviews/);
}

const tests = [
  testCursorIndexExists,
  testLimitPlusOneInRpc,
  testSecurityInvoker,
  testExplicitProjectionNotSelectStar,
  testStableOrderInRpc,
  testCountMatchesFilterFunction,
];

for (const test of tests) {
  test();
}

console.log(`finance-query-plan: ${tests.length} passed`);
