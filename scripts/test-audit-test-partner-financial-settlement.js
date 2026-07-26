#!/usr/bin/env node
/**
 * Unit tests for financial settlement audit helpers (no DB access).
 */

import assert from "node:assert/strict";
import {
  assessPreviousWithdrawnBlocker,
  classifyWithdrawal,
  FINANCIAL_CLASSIFICATIONS,
  hasExternalPayoutEvidence,
  inferWithdrawalCommissionLink,
  parseSettlementAuditArgs,
  proposeSettlementActions,
  rebuildPartnerBalancesFromSources,
} from "../lib/audit-test-partner-financial-settlement.js";

function testAggregateWithdrawnDoesNotEqualDirectProof() {
  const assessment = assessPreviousWithdrawnBlocker({
    commission: { id: "c1", amount: 20, status: "withdrawable", is_withdrawable: true },
    partner: { total_withdrawn: 20, balance_withdrawable: 0 },
    commissionLedgerEntries: [{ id: "l1", type: "commission_release", reference_type: "commission", reference_id: "c1", amount: 20, created_at: "2026-01-01T00:00:00Z" }],
    partnerLedgerEntries: [],
    withdrawals: [{ id: "w1", status: "paid", amount: 20 }],
  });
  assert.equal(assessment.aggregateInference, true);
  assert.equal(assessment.directLedgerProof, false);
  assert.equal(assessment.wasAggregateInferenceOnly, true);
}

function testPaidWithdrawalWithTxHashIsRealExternal() {
  const txHash = "0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
  const result = hasExternalPayoutEvidence({
    admin_note: `Paid on chain ${txHash}`,
  });
  assert.equal(result.hasEvidence, true);
  const classified = classifyWithdrawal({
    withdrawal: {
      id: "w1",
      status: "paid",
      amount: 20,
      wallet_address: "0x1234567890abcdef1234567890abcdef12345678",
      admin_note: `Paid on chain ${txHash}`,
    },
    partnerProfile: { email: "e2e@test.local" },
    commission: { id: "c1", amount: 20 },
    commissionLedgerEntries: [],
    partnerLedgerEntries: [],
  });
  assert.equal(classified.classification, FINANCIAL_CLASSIFICATIONS.REAL_EXTERNAL_PAYOUT);
}

function testE2EWithdrawalWithoutExternalEvidence() {
  const commissionLedger = [
    {
      id: "l1",
      type: "commission_release",
      reference_type: "commission",
      reference_id: "c1",
      amount: 20,
      created_at: "2026-01-01T00:00:00Z",
    },
  ];
  const withdrawalLedger = [
    {
      id: "l2",
      type: "withdrawal_paid",
      reference_type: "withdrawal",
      reference_id: "w1",
      amount: 20,
      created_at: "2026-01-02T00:00:00Z",
    },
  ];
  const classified = classifyWithdrawal({
    withdrawal: {
      id: "w1",
      status: "paid",
      amount: 20,
      wallet_address: "0x0000000000000000000000000000000000000001",
      admin_note: "E2E payout simulation",
    },
    partnerProfile: { email: "partner@example.com" },
    subscriptionRow: { user_email: "e2e-real-b@test.local", username: "RealB1" },
    commission: { id: "c1", amount: 20 },
    commissionLedgerEntries: commissionLedger,
    partnerLedgerEntries: [...commissionLedger, ...withdrawalLedger],
  });
  assert.equal(classified.classification, FINANCIAL_CLASSIFICATIONS.TEST_WITHDRAWAL_COMPLETED);
}

function testPendingWithdrawalDoesNotBlockReversalPlan() {
  const settlement = proposeSettlementActions({
    classification: FINANCIAL_CLASSIFICATIONS.PENDING_OR_REJECTED,
    commission: { id: "c1", amount: 20 },
    partner: { balance_withdrawable: 20, total_earnings: 20, total_withdrawn: 0 },
  });
  assert.equal(settlement.blocker, null);
  assert.equal(settlement.canSettleAutomatically, true);
  assert.ok(settlement.actions.some((action) => action.includes("rejectCommission")));
}

function testRebuildUsesCorrectSources() {
  const rebuild = rebuildPartnerBalancesFromSources({
    partner: {
      balance_withdrawable: 0,
      balance_pending: 0,
      total_earnings: 20.2,
      total_withdrawn: 20,
    },
    commissions: [{ id: "c1", amount: 20, status: "withdrawable", is_withdrawable: true }],
    ledgerEntries: [{ balance_after: 0, created_at: "2026-01-02T00:00:00Z" }],
    withdrawals: [{ id: "w1", status: "paid", amount: 20 }],
  });
  assert.equal(rebuild.computed.totalWithdrawnFromWithdrawals, 20);
  assert.equal(rebuild.computed.withdrawableFromCommissions, 20);
  assert.equal(rebuild.consistency.totalWithdrawnMatchesPaidWithdrawals, true);
}

function testNoCommissionDeleteBeforeLedgerSettlement() {
  const settlement = proposeSettlementActions({
    classification: FINANCIAL_CLASSIFICATIONS.TEST_WITHDRAWAL_COMPLETED,
    commission: { id: "c1", amount: 20 },
    partner: { total_withdrawn: 20, balance_withdrawable: 0, total_earnings: 20.2 },
  });
  assert.ok(settlement.actions.some((action) => /ledger/i.test(action)));
  assert.ok(!settlement.actions.some((action) => /delete withdrawal/i.test(action)));
}

function testRealExternalWithdrawalNotDeleted() {
  const settlement = proposeSettlementActions({
    classification: FINANCIAL_CLASSIFICATIONS.REAL_EXTERNAL_PAYOUT,
    commission: { id: "c1", amount: 20 },
    partner: {},
  });
  assert.equal(settlement.blocker, "REAL_EXTERNAL_PAYOUT_BLOCKER");
  assert.ok(settlement.actions.some((action) => /Do not reverse financial records/i.test(action)));
}

function testE2ESettlementNetZeroPlan() {
  const settlement = proposeSettlementActions({
    classification: FINANCIAL_CLASSIFICATIONS.TEST_WITHDRAWAL_COMPLETED,
    commission: { id: "c1", amount: 20 },
    partner: { total_withdrawn: 20, balance_withdrawable: 0, total_earnings: 20.2 },
  });
  assert.ok(settlement.actions.some((action) => /net \$0/i.test(action)));
}

function testExecuteFlagRejected() {
  assert.throws(
    () => parseSettlementAuditArgs(["--execute", "--request-ids=44"]),
    (error) => error.code === "EXECUTE_NOT_SUPPORTED"
  );
}

function testDirectLedgerLinkInference() {
  const link = inferWithdrawalCommissionLink({
    commission: { amount: 20 },
    commissionLedgerEntries: [
      { type: "commission_release", created_at: "2026-01-01T00:00:00Z" },
    ],
    withdrawal: { amount: 20 },
    withdrawalLedgerEntries: [{ type: "withdrawal_paid", created_at: "2026-01-02T00:00:00Z" }],
  });
  assert.equal(link.linked, true);
  assert.equal(link.confidence, "high");
}

const tests = [
  ["aggregate withdrawn without direct link is inference only", testAggregateWithdrawnDoesNotEqualDirectProof],
  ["paid withdrawal with tx hash is REAL_EXTERNAL_PAYOUT", testPaidWithdrawalWithTxHashIsRealExternal],
  ["e2e withdrawal without external evidence is TEST_WITHDRAWAL_COMPLETED", testE2EWithdrawalWithoutExternalEvidence],
  ["pending/rejected withdrawal allows reversal plan", testPendingWithdrawalDoesNotBlockReversalPlan],
  ["aggregate balance rebuild uses primary sources", testRebuildUsesCorrectSources],
  ["settlement plan keeps ledger before commission delete", testNoCommissionDeleteBeforeLedgerSettlement],
  ["real external withdrawal is not deleted", testRealExternalWithdrawalNotDeleted],
  ["e2e settlement plan targets net zero", testE2ESettlementNetZeroPlan],
  ["--execute is rejected", testExecuteFlagRejected],
  ["ledger chain infers commission withdrawal link", testDirectLedgerLinkInference],
];

let passed = 0;
for (const [name, run] of tests) {
  run();
  passed += 1;
  console.log(`✓ ${name}`);
}

console.log(`\n${passed}/${tests.length} financial settlement audit checks passed`);
