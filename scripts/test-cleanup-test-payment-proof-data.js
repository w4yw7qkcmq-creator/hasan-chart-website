import assert from "node:assert/strict";
import {
  assertExecuteAllowed,
  assertExplicitRequestIds,
  buildCleanupPlan,
  buildStorageTarget,
  evaluateWithdrawalBlockers,
  isApprovedTestSubscriptionRow,
  isTestEmail,
  parseCleanupArgs,
  previewCommissionReversal,
} from "../lib/cleanup-test-payment-proof-data.js";
import { previewCommissionCleanupEligibility } from "../lib/settle-test-partner-financials.js";
import { runCleanupTestPaymentProofData } from "../lib/cleanup-test-payment-proof-runner.js";

function testParseArgsRequiresIds() {
  assert.throws(() => assertExplicitRequestIds([]), (error) => error.code === "MISSING_REQUEST_IDS");
  assert.throws(
    () => assertExplicitRequestIds(parseCleanupArgs([]).requestIds),
    (error) => error.code === "MISSING_REQUEST_IDS"
  );
  assert.deepEqual(parseCleanupArgs(["--request-ids=33,34"]).requestIds, [33, 34]);
  assert.equal(parseCleanupArgs(["--execute", "--request-ids=33"]).dryRun, false);
  assert.equal(parseCleanupArgs(["--dry-run", "--request-ids=33"]).dryRun, true);
}

function testRejectNonTestEmail() {
  assert.equal(isTestEmail("user@gmail.com"), false);
  assert.equal(isTestEmail("e2e-pay-1@test.local"), true);
  assert.equal(isApprovedTestSubscriptionRow({ user_email: "x@gmail.com", username: "RealUser" }), false);
  assert.equal(
    isApprovedTestSubscriptionRow({ user_email: "e2e-real-b-1@test.local", username: "RealB123" }),
    true
  );
}

function testRejectMissingRequestPlan() {
  const plan = buildCleanupPlan({
    requestIds: [999],
    rows: [],
    references: {},
    commissionPlans: [],
    storageTargets: [],
    blockers: [],
    dryRun: true,
  });
  assert.equal(plan.canExecute, false);
  assert.ok(plan.blockers.some((entry) => entry.code === "REQUEST_NOT_FOUND"));
}

function testUnknownReferenceBlocksExecute() {
  const plan = buildCleanupPlan({
    requestIds: [33],
    rows: [{ id: 33, user_email: "e2e@test.local", username: "PayE2E1" }],
    references: { mystery_table: { rowCount: 1 } },
    commissionPlans: [],
    storageTargets: [],
    blockers: [],
    dryRun: true,
  });
  assert.equal(plan.canExecute, false);
  assert.ok(plan.blockers.some((entry) => entry.code === "UNKNOWN_REFERENCE_TABLE"));
}

function testPaidCommissionBlocksExecute() {
  const preview = previewCommissionReversal(
    { id: "c1", status: "paid", amount: 20, subscription_id: "44" },
    { balance_withdrawable: 20, total_earnings: 20, total_withdrawn: 0 }
  );
  assert.equal(preview.blocker, "COMMISSION_ALREADY_PAID");
  const plan = buildCleanupPlan({
    requestIds: [44],
    rows: [{ id: 44, user_email: "e2e@test.local", username: "RealB1" }],
    references: {},
    commissionPlans: [preview],
    storageTargets: [],
    blockers: [{ code: "COMMISSION_ALREADY_PAID", commissionId: "c1" }],
    dryRun: true,
  });
  assert.equal(plan.canExecute, false);
}

function testWithdrawnCommissionBlocksExecute() {
  const preview = previewCommissionReversal(
    {
      id: "c1",
      status: "withdrawable",
      amount: 20,
      is_withdrawable: true,
      subscription_id: "44",
    },
    { balance_withdrawable: 0, total_earnings: 20.2, total_withdrawn: 20 }
  );
  assert.equal(preview.blocker, "COMMISSION_ALREADY_WITHDRAWN");
  const plan = buildCleanupPlan({
    requestIds: [44],
    rows: [{ id: 44, user_email: "e2e@test.local", username: "RealB1" }],
    references: {},
    commissionPlans: [preview],
    storageTargets: [],
    blockers: [{ code: "FINANCIAL_SETTLEMENT_REQUIRED", commissionId: "c1" }],
    dryRun: true,
  });
  assert.equal(plan.canExecute, false);
}

function testFinancialSettlementRequiredBlocksCleanup() {
  const settlementPreview = previewCommissionCleanupEligibility(
    { id: "c1", status: "withdrawable", amount: 20, is_withdrawable: true, subscription_id: "44", partner_id: "p1" },
    { balance_withdrawable: 0, total_earnings: 20.2, total_withdrawn: 20 },
    { status: "unsettled" }
  );
  assert.equal(settlementPreview.blocker, "FINANCIAL_SETTLEMENT_REQUIRED");
}

function testWithdrawableCommissionPlansReversal() {
  const preview = previewCommissionReversal(
    { id: "c1", status: "withdrawable", amount: 20, is_withdrawable: true, subscription_id: "44" },
    { balance_withdrawable: 20, balance_pending: 0, total_earnings: 20, total_withdrawn: 0 }
  );
  assert.equal(preview.blocker, null);
  assert.equal(preview.after.balanceWithdrawable, 0);
  assert.equal(preview.after.totalEarnings, 0);
  assert.equal(preview.action, "rejectCommission_then_delete");
}

function testActiveWithdrawalBlocker() {
  const preview = previewCommissionReversal(
    { id: "c1", status: "withdrawable", amount: 20, is_withdrawable: true },
    { balance_withdrawable: 40, total_earnings: 40, total_withdrawn: 0 }
  );
  const ok = evaluateWithdrawalBlockers({
    partner: { balance_withdrawable: 40, total_withdrawn: 0 },
    commissionPreview: preview,
    withdrawals: [{ id: "w1", status: "pending", amount: 15 }],
  });
  assert.equal(ok.length, 0);
  const blocked = evaluateWithdrawalBlockers({
    partner: { balance_withdrawable: 20, total_withdrawn: 0 },
    commissionPreview: previewCommissionReversal(
      { id: "c2", status: "withdrawable", amount: 20, is_withdrawable: true },
      { balance_withdrawable: 20, total_earnings: 20, total_withdrawn: 0 }
    ),
    withdrawals: [{ id: "w2", status: "pending", amount: 25 }],
  });
  assert.ok(blocked.some((entry) => entry.code === "ACTIVE_WITHDRAWAL_EXCEEDS_BALANCE_AFTER_REVERSAL"));
}

function testStorageReferencedBlocksDelete() {
  const target = buildStorageTarget({
    requestId: 41,
    rowPath: "user/41/file.png",
    storageInspection: { bytes: 70, contentHash: "abc" },
    uploadSessionPaths: [],
  });
  const plan = buildCleanupPlan({
    requestIds: [41],
    rows: [{ id: 41, user_email: "e2e@test.local", username: "RealB1", payment_proof_path: target.objectPath }],
    references: {},
    commissionPlans: [],
    storageTargets: [{ ...target, blocked: true, blocker: "STORAGE_PATH_REFERENCED_BY_OTHER_REQUEST" }],
    blockers: [],
    dryRun: true,
  });
  assert.equal(plan.canExecute, false);
}

function testExecutionOrderPresent() {
  const plan = buildCleanupPlan({
    requestIds: [33],
    rows: [{ id: 33, user_email: "e2e@test.local", username: "PartnerB1" }],
    references: {
      subscription_requests: { rowCount: 1 },
      admin_logs: { rowCount: 0 },
    },
    commissionPlans: [],
    storageTargets: [],
    blockers: [],
    dryRun: true,
  });
  assert.ok(plan.executionOrder.includes("delete_subscription_requests"));
  assert.ok(plan.executionOrder.indexOf("delete_admin_logs") < plan.executionOrder.indexOf("delete_subscription_requests"));
  assert.ok(plan.executionOrder.indexOf("delete_storage_objects") > plan.executionOrder.indexOf("delete_subscription_requests"));
}

function testIdempotentEmptyPlanAllowed() {
  const plan = buildCleanupPlan({
    requestIds: [33],
    rows: [],
    references: { subscription_requests: { rowCount: 0 } },
    commissionPlans: [],
    storageTargets: [],
    blockers: [],
    dryRun: true,
  });
  assert.equal(plan.canExecute, false);
  assert.ok(plan.blockers.some((entry) => entry.code === "REQUEST_NOT_FOUND"));
}

async function testDryRunDoesNotMutateWithMockSupabase() {
  let mutated = false;
  const chain = () => ({
    select() {
      return chain();
    },
    limit() {
      return chain();
    },
    in() {
      return chain();
    },
    eq() {
      return chain();
    },
    or() {
      return chain();
    },
    order() {
      return Promise.resolve({
        data: [{ id: 33, user_email: "e2e@test.local", username: "PayE2E1" }],
        error: null,
      });
    },
    then(resolve, reject) {
      return Promise.resolve({ data: [], error: null }).then(resolve, reject);
    },
    delete() {
      mutated = true;
      return chain();
    },
    update() {
      mutated = true;
      return chain();
    },
  });
  const supabase = {
    from() {
      return chain();
    },
    storage: {
      from() {
        return {
          download: async () => ({ data: null, error: { message: "not found" } }),
        };
      },
    },
  };

  const plan = await runCleanupTestPaymentProofData({
    supabase,
    argv: ["--request-ids=33"],
  });
  assert.equal(plan.dryRun, true);
  assert.equal(mutated, false);
  assert.equal(plan.canExecute, true);
}

function testExecuteGuardBlocksWhenPlanInvalid() {
  assert.throws(
    () =>
      assertExecuteAllowed({
        canExecute: false,
        blockers: [{ code: "REQUEST_NOT_FOUND" }],
      }),
    (error) => error.code === "EXECUTE_BLOCKED"
  );
}

function testDoesNotExpandBeyondExplicitIds() {
  const args = parseCleanupArgs(["--request-ids=33,34,35"]);
  assert.deepEqual(args.requestIds, [33, 34, 35]);
  assert.throws(() => assertExplicitRequestIds([33, 33]), (error) => error.code === "DUPLICATE_REQUEST_IDS");
}

const tests = [
  ["reject run without ids", testParseArgsRequiresIds],
  ["reject non-test.local email", testRejectNonTestEmail],
  ["reject missing request id", testRejectMissingRequestPlan],
  ["unknown reference blocks execute", testUnknownReferenceBlocksExecute],
  ["paid commission blocks execute", testPaidCommissionBlocksExecute],
  ["withdrawn commission blocks execute", testWithdrawnCommissionBlocksExecute],
  ["financial settlement required blocks cleanup", testFinancialSettlementRequiredBlocksCleanup],
  ["withdrawable commission plans reversal", testWithdrawableCommissionPlansReversal],
  ["active withdrawal blocker", testActiveWithdrawalBlocker],
  ["storage still referenced blocks delete", testStorageReferencedBlocksDelete],
  ["dependent deletes precede request delete", testExecutionOrderPresent],
  ["idempotent empty state reports not found", testIdempotentEmptyPlanAllowed],
  ["execute guard on failed preconditions", testExecuteGuardBlocksWhenPlanInvalid],
  ["explicit id list only", testDoesNotExpandBeyondExplicitIds],
];

let passed = 0;
for (const [name, run] of tests) {
  run();
  passed += 1;
  console.log(`✓ ${name}`);
}

await testDryRunDoesNotMutateWithMockSupabase();
passed += 1;
console.log("✓ dry run does not mutate db/storage");

console.log(`\n${passed}/${tests.length + 1} cleanup test payment proof checks passed`);
