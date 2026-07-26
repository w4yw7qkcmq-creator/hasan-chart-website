#!/usr/bin/env node
/**
 * Unit tests for E2E test partner financial settlement (no DB access).
 */

import assert from "node:assert/strict";
import {
  previewCommissionCleanupEligibility,
} from "../lib/settle-test-partner-financials.js";
import {
  analyzeRejectCommissionSafety,
  assertSettleRequestIds,
  assessSettlementCompletionState,
  buildExpectedBalancesAfterSettlement,
  buildSettlementIdempotencyKey,
  buildSettlementPlanEntry,
  buildSettlementPlanReport,
  findSettlementAdjustmentEntry,
  parseSettleTestPartnerFinancialsArgs,
  SETTLEMENT_LEDGER_ACCOUNTING_EFFECT,
  SETTLEMENT_REFERENCE_TYPE,
  SETTLEMENT_TARGET_COMMISSION_AMOUNT,
  validateBonusIsolation,
  validateSettlementPreconditions,
} from "../lib/settle-test-partner-financials.js";
import { FINANCIAL_CLASSIFICATIONS } from "../lib/audit-test-partner-financial-settlement.js";

const COMMISSION_ID = "93979afa-094b-4c7d-bb94-8be2c334d74f";
const WITHDRAWAL_ID = "46601b19-df9a-443a-b0fe-f1e18acce237";

function settledAdjustment(idempotencyKey, overrides = {}) {
  return {
    id: "adj1",
    type: "adjustment",
    amount: 20,
    reference_type: SETTLEMENT_REFERENCE_TYPE,
    reference_id: COMMISSION_ID,
    balance_before: 0,
    balance_after: 0,
    note: `test-data-financial-settlement | accountingEffect=${SETTLEMENT_LEDGER_ACCOUNTING_EFFECT} | idempotencyKey=${idempotencyKey} | requestId=44 | commissionId=${COMMISSION_ID} | withdrawalId=${WITHDRAWAL_ID} | balancePendingAtSettlement=0`,
    ...overrides,
  };
}

function baseContext(overrides = {}) {
  return {
    requestId: 44,
    subscriptionRow: {
      id: 44,
      user_email: "e2e-real-b@test.local",
      username: "RealB1",
    },
    commission: {
      id: COMMISSION_ID,
      partner_id: "2215e067-92ce-4cb0-a846-279832a49945",
      subscription_id: "44",
      amount: 20,
      status: "withdrawable",
      is_withdrawable: true,
    },
    partner: {
      id: "2215e067-92ce-4cb0-a846-279832a49945",
      balance_withdrawable: 0,
      balance_pending: 0,
      total_earnings: 20.2,
      total_withdrawn: 20,
    },
    partnerProfile: { email: "e2e-real-a@test.local" },
    partnerCommissions: [
      {
        id: COMMISSION_ID,
        subscription_id: "44",
        amount: 20,
        status: "withdrawable",
        is_withdrawable: true,
      },
      { id: "bonus-1", amount: 0.2, status: "approved" },
    ],
    commissionLedgerEntries: [
      {
        id: "l1",
        type: "commission_release",
        amount: 20,
        reference_type: "commission",
        reference_id: COMMISSION_ID,
        created_at: "2026-01-01T00:00:00Z",
      },
    ],
    partnerLedgerEntries: [
      {
        id: "l1",
        type: "commission_release",
        amount: 20,
        reference_type: "commission",
        reference_id: COMMISSION_ID,
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "l2",
        type: "withdrawal_paid",
        amount: 20,
        reference_type: "withdrawal",
        reference_id: WITHDRAWAL_ID,
        created_at: "2026-01-02T00:00:00Z",
      },
    ],
    paidWithdrawal: {
      id: WITHDRAWAL_ID,
      status: "paid",
      amount: 20,
      wallet_address: "TXyz123456789012345678901234567",
      admin_note: "e2e paid",
      payment_proof: null,
    },
    allWithdrawals: [
      {
        id: WITHDRAWAL_ID,
        status: "paid",
        amount: 20,
        wallet_address: "TXyz123456789012345678901234567",
        admin_note: "e2e paid",
      },
    ],
    financialClassification: FINANCIAL_CLASSIFICATIONS.TEST_WITHDRAWAL_COMPLETED,
    externalPayoutEvidence: { hasEvidence: false, reason: null },
    settlementState: { status: "unsettled" },
    rejectAnalysis: analyzeRejectCommissionSafety(
      { status: "withdrawable", is_withdrawable: true, amount: 20 },
      { balance_withdrawable: 0, total_earnings: 20.2, total_withdrawn: 20 }
    ),
    ...overrides,
  };
}

function testRejectMissingIds() {
  assert.throws(() => assertSettleRequestIds([]), (error) => error.code === "MISSING_REQUEST_IDS");
}

function testRejectNonTestRequest() {
  const blockers = validateSettlementPreconditions(
    baseContext({
      subscriptionRow: { id: 44, user_email: "real@example.com", username: "Real" },
    })
  );
  assert.ok(blockers.some((entry) => entry.code === "NON_TEST_REQUEST"));
}

function testRejectExternalPayout() {
  const blockers = validateSettlementPreconditions(
    baseContext({
      externalPayoutEvidence: { hasEvidence: true, reason: "transaction_hash_in_notes" },
    })
  );
  assert.ok(blockers.some((entry) => entry.code === "EXTERNAL_PAYOUT_EVIDENCE"));
}

function testRejectCommissionAmountMismatch() {
  const blockers = validateSettlementPreconditions(
    baseContext({
      commission: { ...baseContext().commission, amount: 15 },
    })
  );
  assert.ok(blockers.some((entry) => entry.code === "COMMISSION_AMOUNT_MISMATCH"));
}

function testRejectWithdrawalAmountMismatch() {
  const blockers = validateSettlementPreconditions(
    baseContext({
      paidWithdrawal: { ...baseContext().paidWithdrawal, amount: 25 },
    })
  );
  assert.ok(blockers.some((entry) => entry.code === "WITHDRAWAL_AMOUNT_MISMATCH"));
}

function testRejectPartnerBalanceMismatch() {
  const blockers = validateSettlementPreconditions(
    baseContext({
      partner: { ...baseContext().partner, balance_withdrawable: 5 },
    })
  );
  assert.ok(blockers.some((entry) => entry.code === "PARTNER_BALANCE_WITHDRAWABLE_MISMATCH"));
}

function testBonus020Preserved() {
  const bonus = validateBonusIsolation({
    partnerCommissions: baseContext().partnerCommissions,
    targetCommissionId: COMMISSION_ID,
  });
  assert.equal(bonus.ok, true);
  assert.equal(bonus.pendingBonus, 0.2);
  const expected = buildExpectedBalancesAfterSettlement(baseContext().partner, 20);
  assert.equal(expected.totalEarnings, 0.2);
}

function testAdjustmentReversesWithdrawalInternally() {
  const entry = buildSettlementPlanEntry(baseContext());
  assert.equal(entry.ledgerAdjustmentAmount, 20);
  assert.equal(entry.ledgerBalanceBefore, 0);
  assert.equal(entry.ledgerBalanceAfter, 0);
  assert.equal(entry.ledgerReferenceType, SETTLEMENT_REFERENCE_TYPE);
  assert.ok(entry.proposedActions.some((action) => /reference_type=test_financial_settlement/i.test(action)));
  assert.ok(entry.proposedActions.some((action) => /balance_after=0/i.test(action)));
}

function testTotalWithdrawnDecreasesBy20() {
  const expected = buildExpectedBalancesAfterSettlement(baseContext().partner, 20);
  assert.equal(expected.totalWithdrawn, 0);
}

function testTotalEarningsDecreasesBy20Only() {
  const expected = buildExpectedBalancesAfterSettlement(baseContext().partner, 20);
  assert.equal(expected.totalEarnings, 0.2);
}

function testBalanceWithdrawableStaysZero() {
  const expected = buildExpectedBalancesAfterSettlement(baseContext().partner, 20);
  assert.equal(expected.balanceWithdrawable, 0);
}

function testCommissionExpectedRejected() {
  const entry = buildSettlementPlanEntry(baseContext());
  assert.equal(entry.commissionExpectedStatus, "rejected");
}

function testPaidWithdrawalPreservedInPlan() {
  const entry = buildSettlementPlanEntry(baseContext());
  assert.ok(
    entry.proposedActions.some((action) => /preserve paid withdrawal/i.test(action))
  );
}

function testIdempotencyKeyStable() {
  const key = buildSettlementIdempotencyKey(44, COMMISSION_ID, WITHDRAWAL_ID);
  assert.equal(key, `test-financial-settlement:44:${COMMISSION_ID}:${WITHDRAWAL_ID}`);
}

function testIdempotencyAlreadySettled() {
  const idempotencyKey = buildSettlementIdempotencyKey(44, COMMISSION_ID, WITHDRAWAL_ID);
  const state = assessSettlementCompletionState({
    partner: { balance_withdrawable: 0, balance_pending: 0, total_earnings: 0.2, total_withdrawn: 0 },
    commission: { id: COMMISSION_ID, status: "rejected", is_withdrawable: false },
    idempotencyKey,
    partnerLedgerEntries: [settledAdjustment(idempotencyKey)],
  });
  assert.equal(state.status, "already-settled");
  const entry = buildSettlementPlanEntry(
    baseContext({
      settlementState: state,
      commission: { ...baseContext().commission, status: "rejected", is_withdrawable: false },
      partner: { ...baseContext().partner, total_earnings: 0.2, total_withdrawn: 0 },
    })
  );
  assert.equal(entry.alreadySettled, true);
  assert.equal(entry.canExecute, false);
}

function testStructuredIdempotencyIgnoresDifferentNote() {
  const idempotencyKey = buildSettlementIdempotencyKey(44, COMMISSION_ID, WITHDRAWAL_ID);
  const found = findSettlementAdjustmentEntry(
    [
      settledAdjustment(idempotencyKey, {
        note: "different-audit-note-only",
      }),
    ],
    { commissionId: COMMISSION_ID, idempotencyKey: "other-key" }
  );
  assert.equal(found?.reference_id, COMMISSION_ID);
  assert.equal(found?.reference_type, SETTLEMENT_REFERENCE_TYPE);
}

function testPartialSettlementWrongAdjustmentAmount() {
  const idempotencyKey = buildSettlementIdempotencyKey(44, COMMISSION_ID, WITHDRAWAL_ID);
  const state = assessSettlementCompletionState({
    partner: { balance_withdrawable: 0, balance_pending: 0, total_earnings: 0.2, total_withdrawn: 0 },
    commission: { id: COMMISSION_ID, status: "rejected", is_withdrawable: false },
    idempotencyKey,
    partnerLedgerEntries: [settledAdjustment(idempotencyKey, { amount: 15 })],
  });
  assert.equal(state.status, "partial-settlement-detected");
  assert.equal(state.mismatches.adjustmentValid, false);
}

function testPartialSettlementWithdrawableLedgerBalances() {
  const idempotencyKey = buildSettlementIdempotencyKey(44, COMMISSION_ID, WITHDRAWAL_ID);
  const state = assessSettlementCompletionState({
    partner: { balance_withdrawable: 0, balance_pending: 0, total_earnings: 0.2, total_withdrawn: 0 },
    commission: { id: COMMISSION_ID, status: "rejected", is_withdrawable: false },
    idempotencyKey,
    partnerLedgerEntries: [settledAdjustment(idempotencyKey, { balance_after: 20 })],
  });
  assert.equal(state.status, "partial-settlement-detected");
}

function testPartialSettlementIsWithdrawableStillTrue() {
  const idempotencyKey = buildSettlementIdempotencyKey(44, COMMISSION_ID, WITHDRAWAL_ID);
  const state = assessSettlementCompletionState({
    partner: { balance_withdrawable: 0, balance_pending: 0, total_earnings: 0.2, total_withdrawn: 0 },
    commission: { id: COMMISSION_ID, status: "rejected", is_withdrawable: true },
    idempotencyKey,
    partnerLedgerEntries: [settledAdjustment(idempotencyKey)],
  });
  assert.equal(state.status, "partial-settlement-detected");
  assert.equal(state.mismatches.commissionRejected, false);
}

function testPartialSettlementBlocksExecute() {
  const blockers = validateSettlementPreconditions(
    baseContext({
      settlementState: {
        status: "partial-settlement-detected",
        mismatches: { commissionRejected: false },
      },
    })
  );
  assert.ok(blockers.some((entry) => entry.code === "PARTIAL_SETTLEMENT_DETECTED"));
}

function testCleanupBlockedBeforeSettlement() {
  const preview = previewCommissionCleanupEligibility(
    baseContext().commission,
    baseContext().partner,
    { status: "unsettled" }
  );
  assert.equal(preview.blocker, "FINANCIAL_SETTLEMENT_REQUIRED");
}

function testCleanupAllowedAfterSettlementSimulation() {
  const preview = previewCommissionCleanupEligibility(
    { ...baseContext().commission, status: "rejected" },
    { ...baseContext().partner, total_earnings: 0.2, total_withdrawn: 0 },
    { status: "already-settled", idempotencyKey: buildSettlementIdempotencyKey(44, COMMISSION_ID, WITHDRAWAL_ID) }
  );
  assert.equal(preview.blocker, null);
  assert.equal(preview.action, "delete_settled_commission_row");
}

function testRejectCommissionSafeWithoutDoubleDeduct() {
  const analysis = analyzeRejectCommissionSafety(
    { status: "withdrawable", is_withdrawable: true, amount: 20 },
    { balance_withdrawable: 0, total_earnings: 20.2, total_withdrawn: 20 }
  );
  assert.equal(analysis.balanceWithdrawableAfterReject, 0);
  assert.equal(analysis.requiresSeparateTotalWithdrawnAdjustment, true);
}

function testDryRunPlanCanExecuteWhenValid() {
  const report = buildSettlementPlanReport([buildSettlementPlanEntry(baseContext())]);
  assert.equal(report.entries[0].canExecute, true);
  assert.equal(report.canExecuteAll, true);
}

function testDoesNotTouchOtherCommissions() {
  const bonus = validateBonusIsolation({
    partnerCommissions: [
      { id: COMMISSION_ID, amount: 20, status: "withdrawable", is_withdrawable: true },
      { id: "bonus-1", amount: 0.2, status: "approved" },
      { id: "other", amount: 50, status: "withdrawable", is_withdrawable: true },
    ],
    targetCommissionId: COMMISSION_ID,
  });
  assert.equal(bonus.ok, false);
}

const tests = [
  ["reject run without ids", testRejectMissingIds],
  ["reject non-test request", testRejectNonTestRequest],
  ["reject external payout", testRejectExternalPayout],
  ["reject commission amount mismatch", testRejectCommissionAmountMismatch],
  ["reject withdrawal amount mismatch", testRejectWithdrawalAmountMismatch],
  ["reject partner balance mismatch", testRejectPartnerBalanceMismatch],
  ["preserve bonus 0.2", testBonus020Preserved],
  ["adjustment +20 proposed", testAdjustmentReversesWithdrawalInternally],
  ["total_withdrawn decreases by 20", testTotalWithdrawnDecreasesBy20],
  ["total_earnings decreases by 20 only", testTotalEarningsDecreasesBy20Only],
  ["balance_withdrawable stays 0", testBalanceWithdrawableStaysZero],
  ["commission becomes rejected", testCommissionExpectedRejected],
  ["paid withdrawal preserved", testPaidWithdrawalPreservedInPlan],
  ["idempotency key stable", testIdempotencyKeyStable],
  ["already settled is idempotent", testIdempotencyAlreadySettled],
  ["structured idempotency ignores note text", testStructuredIdempotencyIgnoresDifferentNote],
  ["partial settlement wrong adjustment amount", testPartialSettlementWrongAdjustmentAmount],
  ["partial settlement withdrawable ledger balances", testPartialSettlementWithdrawableLedgerBalances],
  ["partial settlement is_withdrawable still true", testPartialSettlementIsWithdrawableStillTrue],
  ["partial settlement blocks execute", testPartialSettlementBlocksExecute],
  ["cleanup blocked before settlement", testCleanupBlockedBeforeSettlement],
  ["cleanup allowed after settlement simulation", testCleanupAllowedAfterSettlementSimulation],
  ["rejectCommission no double deduct", testRejectCommissionSafeWithoutDoubleDeduct],
  ["valid dry-run canExecute", testDryRunPlanCanExecuteWhenValid],
  ["does not touch other commissions", testDoesNotTouchOtherCommissions],
];

let passed = 0;
for (const [name, run] of tests) {
  run();
  passed += 1;
  console.log(`✓ ${name}`);
}

console.log(`\n${passed}/${tests.length} settle test partner financial checks passed`);
