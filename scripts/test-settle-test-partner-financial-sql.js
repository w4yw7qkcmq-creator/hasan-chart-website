#!/usr/bin/env node
/**
 * Static migration contract tests for settle_test_partner_financial RPC SQL.
 * No DB access — reads migration file only.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(
  __dirname,
  "../supabase/migrations/20260727_settle_test_partner_financial_rpc.sql"
);
const sql = readFileSync(migrationPath, "utf8");

function testStructuredPartialUniqueIndex() {
  assert.match(
    sql,
    /CREATE UNIQUE INDEX IF NOT EXISTS partner_wallet_ledger_test_settlement_commission_uidx[\s\S]*?\(reference_type, reference_id\)[\s\S]*?type = 'adjustment'[\s\S]*?reference_type = 'test_financial_settlement'/i
  );
  assert.doesNotMatch(sql, /idempotencyKey.*UNIQUE/i);
}

function testLedgerBalancesNonWithdrawable() {
  assert.match(sql, /balance_before,\s*\n\s*balance_after,/);
  assert.match(sql, /v_settlement_amount,\s*\n\s*0,\s*\n\s*0,/);
  assert.match(sql, /accountingEffect=withdrawal_reversal_non_withdrawable/);
}

function testAlreadySettledStrictChecks() {
  assert.match(sql, /partial_settlement_detected/);
  assert.match(sql, /is_withdrawable, false\) IS TRUE/);
  assert.match(sql, /balance_after, 0\), 2\) <> 0/);
  assert.match(sql, /balancePendingAtSettlement=/);
}

function testExternalPayoutGuards() {
  assert.match(sql, /payment_proof/);
  assert.match(sql, /external_payout_tx_hash/);
  assert.match(sql, /external_payment_proof_present/);
  assert.match(sql, /non_e2e_wallet_address/);
  assert.match(sql, /non_e2e_withdrawal_note/);
  assert.match(sql, /external_payout_reference/);
}

function testTestDataGuards() {
  assert.match(sql, /NOT LIKE '%@test\.local'/);
  assert.match(sql, /referred_user_request_mismatch/);
  assert.match(sql, /commission_request_mismatch/);
}

function testCommissionFinalState() {
  assert.match(sql, /status = 'rejected'/);
  assert.match(sql, /is_withdrawable = false/);
  assert.match(sql, /reason = v_reason/);
  assert.match(sql, /test-data-financial-settlement/);
}

function testPermissions() {
  assert.match(sql, /SET search_path = public, pg_temp/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.settle_test_partner_financial[\s\S]*FROM PUBLIC/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.settle_test_partner_financial[\s\S]*FROM anon/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.settle_test_partner_financial[\s\S]*FROM authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.settle_test_partner_financial[\s\S]*TO service_role/);
}

function testAdminLogsFailClosed() {
  assert.match(sql, /INSERT INTO public\.admin_logs/);
  assert.match(sql, /admin_id,\s*\n\s*admin_email/);
  assert.match(sql, /'test-partner-financial-settlement'/);
  assert.match(sql, /NULL,\s*\n\s*'cleanup-script@system'/);
  assert.doesNotMatch(sql, /undefined_table/);
  assert.doesNotMatch(sql, /EXCEPTION[\s\S]*WHEN undefined_table/);
}

function testConcurrentDuplicateHandling() {
  assert.match(sql, /WHEN unique_violation THEN/);
  assert.match(sql, /duplicate_settlement_adjustment/);
}

function testIdempotencyBeforePreconditions() {
  const adjustmentProbe = sql.indexOf("Structured idempotency probe");
  const forUpdateLock = sql.indexOf("Lock order: partner");
  assert.ok(adjustmentProbe > 0 && forUpdateLock > adjustmentProbe);
}

const tests = [
  ["structured partial unique index", testStructuredPartialUniqueIndex],
  ["ledger balances non-withdrawable", testLedgerBalancesNonWithdrawable],
  ["already-settled strict checks", testAlreadySettledStrictChecks],
  ["external payout guards", testExternalPayoutGuards],
  ["test data guards", testTestDataGuards],
  ["commission final state", testCommissionFinalState],
  ["RPC permissions", testPermissions],
  ["admin_logs fail closed", testAdminLogsFailClosed],
  ["concurrent duplicate handling", testConcurrentDuplicateHandling],
  ["idempotency probe before locks", testIdempotencyBeforePreconditions],
];

let passed = 0;
for (const [name, run] of tests) {
  run();
  passed += 1;
  console.log(`✓ ${name}`);
}

console.log(`\n${passed}/${tests.length} settle SQL migration checks passed`);
