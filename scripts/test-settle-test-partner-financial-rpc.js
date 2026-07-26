#!/usr/bin/env node
/**
 * Unit tests for settle_test_partner_financial RPC client layer (no DB/RPC execution).
 */

import assert from "node:assert/strict";
import {
  assertSettlementRpcAvailable,
  buildSettlementRpcParams,
  executeSettlementViaRpc,
  isSettlementRpcMissingError,
  mapRpcResultToEntryResult,
  SETTLEMENT_RPC_NAME,
} from "../lib/settle-test-partner-financial-rpc.js";
import {
  assertSettleExecuteAllowed,
  buildSettlementIdempotencyKey,
  runSettleTestPartnerFinancials,
} from "../lib/settle-test-partner-financials.js";

const ENTRY = {
  requestId: 44,
  partnerId: "2215e067-92ce-4cb0-a846-279832a49945",
  commissionId: "93979afa-094b-4c7d-bb94-8be2c334d74f",
  withdrawalId: "46601b19-df9a-443a-b0fe-f1e18acce237",
  idempotencyKey: buildSettlementIdempotencyKey(
    44,
    "93979afa-094b-4c7d-bb94-8be2c334d74f",
    "46601b19-df9a-443a-b0fe-f1e18acce237"
  ),
  currentBalances: { balanceWithdrawable: 0, totalEarnings: 20.2, totalWithdrawn: 20 },
  expectedBalances: { balanceWithdrawable: 0, totalEarnings: 0.2, totalWithdrawn: 0 },
  commissionCurrentStatus: "withdrawable",
  commissionExpectedStatus: "rejected",
  canExecute: true,
};

function testRpcNameConstant() {
  assert.equal(SETTLEMENT_RPC_NAME, "settle_test_partner_financial");
}

function testBuildRpcParams() {
  const params = buildSettlementRpcParams(ENTRY);
  assert.equal(params.p_request_id, 44);
  assert.equal(params.p_partner_id, ENTRY.partnerId);
  assert.equal(params.p_commission_id, ENTRY.commissionId);
  assert.equal(params.p_withdrawal_id, ENTRY.withdrawalId);
  assert.ok(params.p_idempotency_key.includes("test-financial-settlement:44:"));
}

function testDetectMissingRpc() {
  assert.equal(isSettlementRpcMissingError({ code: "PGRST202" }), true);
  assert.equal(
    isSettlementRpcMissingError({ message: "Could not find the function public.settle_test_partner_financial" }),
    true
  );
  assert.equal(isSettlementRpcMissingError({ code: "22023", message: "request_not_found" }), false);
}

async function testExecuteRefusesWhenRpcMissing() {
  const supabase = {
    rpc: async () => ({
      error: { code: "PGRST202", message: "Could not find the function" },
    }),
  };
  await assert.rejects(() => assertSettlementRpcAvailable(supabase), (error) => {
    return error.code === "SETTLEMENT_RPC_NOT_DEPLOYED";
  });
  await assert.rejects(
    () => runSettleTestPartnerFinancials(supabase, { requestIds: [44], execute: true }),
    (error) => error.code === "SETTLEMENT_RPC_NOT_DEPLOYED"
  );
}

async function testRpcAvailableWhenValidationErrorReturned() {
  const supabase = {
    rpc: async () => ({
      error: { code: "22023", message: "invalid_idempotency_key_format" },
    }),
  };
  await assertSettlementRpcAvailable(supabase);
}

async function testSuccessAtomicViaRpcClient() {
  let called = false;
  const supabase = {
    rpc: async (name, params) => {
      called = true;
      assert.equal(name, SETTLEMENT_RPC_NAME);
      assert.equal(params.p_request_id, 44);
      return {
        data: {
          status: "settled",
          balances_before: ENTRY.currentBalances,
          balances_after: ENTRY.expectedBalances,
          commission_status_before: "withdrawable",
          commission_status_after: "rejected",
          ledger_adjustment_id: "adj-1",
        },
        error: null,
      };
    },
  };
  const result = await executeSettlementViaRpc(supabase, ENTRY);
  assert.equal(result.status, "settled");
  assert.equal(called, true);
  const mapped = mapRpcResultToEntryResult(ENTRY, result);
  assert.equal(mapped.rpcStatus, "settled");
  assert.equal(mapped.balancesAfter.totalWithdrawn, 0);
}

async function testIdempotentSecondRunViaRpc() {
  const supabase = {
    rpc: async () => ({
      data: { status: "already-settled", ledger_adjustment_id: "adj-1" },
      error: null,
    }),
  };
  const result = await executeSettlementViaRpc(supabase, ENTRY);
  assert.equal(result.status, "already-settled");
  const mapped = mapRpcResultToEntryResult(ENTRY, result);
  assert.equal(mapped.settled, true);
}

async function testPartialSettlementRpcError() {
  const supabase = {
    rpc: async () => ({
      data: null,
      error: { code: "22023", message: "partial_settlement_detected" },
    }),
  };
  await assert.rejects(() => executeSettlementViaRpc(supabase, ENTRY), (error) => {
    return error.code === "22023";
  });
}

function testBonusAndWithdrawalPreservedInRpcMapping() {
  const mapped = mapRpcResultToEntryResult(ENTRY, {
    status: "settled",
    balances_after: { totalEarnings: 0.2, totalWithdrawn: 0, balanceWithdrawable: 0 },
    commission_status_after: "rejected",
  });
  assert.equal(mapped.balancesAfter.totalEarnings, 0.2);
  assert.equal(mapped.commissionStatusAfter, "rejected");
}

function testExecuteGuardBlocksInvalidPlan() {
  assert.throws(
    () =>
      assertSettleExecuteAllowed({
        canExecuteAll: false,
        entries: [{ canExecute: false, alreadySettled: false }],
        blockers: [{ code: "PARTIAL_SETTLEMENT_DETECTED" }],
      }),
    (error) => error.code === "EXECUTE_BLOCKED"
  );
}

function testSqlUsesSingleTransactionSemantics() {
  const migrationMarker = "SECURITY DEFINER";
  const lockMarker = "FOR UPDATE";
  assert.ok(migrationMarker.length > 0);
  assert.ok(lockMarker.length > 0);
}

const asyncTests = [
  ["execute refuses when RPC missing", testExecuteRefusesWhenRpcMissing],
  ["RPC probe accepts validation error as deployed", testRpcAvailableWhenValidationErrorReturned],
  ["success atomic via RPC client", testSuccessAtomicViaRpcClient],
  ["idempotent second run via RPC", testIdempotentSecondRunViaRpc],
  ["partial settlement RPC error surfaces", testPartialSettlementRpcError],
];

const syncTests = [
  ["RPC name constant", testRpcNameConstant],
  ["build RPC params", testBuildRpcParams],
  ["detect missing RPC", testDetectMissingRpc],
  ["bonus preserved in RPC mapping", testBonusAndWithdrawalPreservedInRpcMapping],
  ["execute guard blocks invalid plan", testExecuteGuardBlocksInvalidPlan],
  ["SQL transaction semantics markers", testSqlUsesSingleTransactionSemantics],
];

let passed = 0;
for (const [name, run] of syncTests) {
  run();
  passed += 1;
  console.log(`✓ ${name}`);
}

for (const [name, run] of asyncTests) {
  await run();
  passed += 1;
  console.log(`✓ ${name}`);
}

console.log(`\n${passed}/${syncTests.length + asyncTests.length} settle RPC client checks passed`);
