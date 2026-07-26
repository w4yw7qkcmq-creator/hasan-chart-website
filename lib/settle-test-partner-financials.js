/**
 * Central logic for E2E test partner financial settlement.
 * Dry-run planning + execute helpers (execute only when explicitly enabled).
 */

import {
  assertSettlementRpcAvailable,
  executeSettlementViaRpc,
  mapRpcResultToEntryResult,
  SETTLEMENT_RPC_NAME,
} from "./settle-test-partner-financial-rpc.js";
import {
  COMMISSION_COLUMNS,
  FINANCIAL_CLASSIFICATIONS,
  findLedgerLinksToCommission,
  findLedgerLinksToWithdrawal,
  hasExternalPayoutEvidence,
  inferWithdrawalCommissionLink,
  isTestPartnerEmail,
  isTestSettlementContext,
} from "./audit-test-partner-financial-settlement.js";
import { PARTNER_LEDGER_COLUMNS, PARTNER_WITHDRAWAL_COLUMNS } from "./supabase-query-columns.js";

export const SETTLEMENT_TARGET_COMMISSION_AMOUNT = 20;
export const SETTLEMENT_BONUS_TOLERANCE = 0.01;
export const SETTLEMENT_REASON = "test-data-financial-settlement";
export const SETTLEMENT_OPERATOR = "cleanup-script";
export const SETTLEMENT_LEDGER_TYPE = "adjustment";
export const SETTLEMENT_REFERENCE_TYPE = "test_financial_settlement";
export const SETTLEMENT_LEDGER_ACCOUNTING_EFFECT = "withdrawal_reversal_non_withdrawable";
export const SETTLEMENT_COMMISSION_STATUS = "rejected";

const E2E_WALLET_PATTERN = /^TXyz/i;
const E2E_NOTE_PATTERN = /\b(e2e|test|simulation|rej|paid)\b/i;

export function buildSettlementIdempotencyKey(requestId, commissionId, withdrawalId) {
  return `test-financial-settlement:${requestId}:${commissionId}:${withdrawalId}`;
}

export function buildSettlementLedgerNote({
  requestId,
  commissionId,
  withdrawalId,
  originalAmount,
  idempotencyKey,
  balancePendingAtSettlement = 0,
  timestamp = new Date().toISOString(),
}) {
  const note = [
    SETTLEMENT_REASON,
    `accountingEffect=${SETTLEMENT_LEDGER_ACCOUNTING_EFFECT}`,
    `idempotencyKey=${idempotencyKey}`,
    `requestId=${requestId}`,
    `commissionId=${commissionId}`,
    `withdrawalId=${withdrawalId}`,
    `originalAmount=${originalAmount}`,
    `operator=${SETTLEMENT_OPERATOR}`,
    `balancePendingAtSettlement=${roundMoney(balancePendingAtSettlement)}`,
    `timestamp=${timestamp}`,
  ].join(" | ");
  return note;
}

export function parseSettleTestPartnerFinancialsArgs(argv = []) {
  const args = { requestIds: [], execute: false, dryRun: true };
  for (const arg of argv) {
    if (arg === "--execute") {
      args.execute = true;
      args.dryRun = false;
    } else if (arg.startsWith("--request-ids=")) {
      args.requestIds = arg
        .slice("--request-ids=".length)
        .split(",")
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value) && value > 0);
    }
  }
  return args;
}

export function assertSettleRequestIds(requestIds = []) {
  if (!Array.isArray(requestIds) || requestIds.length === 0) {
    const error = new Error("Missing required --request-ids=44,45,46");
    error.code = "MISSING_REQUEST_IDS";
    throw error;
  }
  const unique = [...new Set(requestIds)];
  if (unique.length !== requestIds.length) {
    const error = new Error("Duplicate request IDs are not allowed");
    error.code = "DUPLICATE_REQUEST_IDS";
    throw error;
  }
  return unique.sort((a, b) => a - b);
}

export function isApprovedTestSubscriptionRow(row = {}) {
  const email = String(row.user_email || "").trim();
  if (isTestPartnerEmail(email)) return true;
  const username = String(row.username || "").trim();
  return /partner|e2e|test|prod-e2e|pay|realb|prodb/i.test(username);
}

export function isE2EWithdrawalPattern(withdrawal = {}) {
  const wallet = String(withdrawal.wallet_address || "").trim();
  const notes = `${withdrawal.admin_note || ""} ${withdrawal.partner_note || ""}`;
  return E2E_WALLET_PATTERN.test(wallet) || E2E_NOTE_PATTERN.test(notes);
}

export function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

export function buildExpectedBalancesAfterSettlement(partner = {}, commissionAmount = SETTLEMENT_TARGET_COMMISSION_AMOUNT) {
  const currentWithdrawable = roundMoney(partner.balance_withdrawable);
  const currentPending = roundMoney(partner.balance_pending);
  const currentEarnings = roundMoney(partner.total_earnings);
  const currentWithdrawn = roundMoney(partner.total_withdrawn);

  return {
    balanceWithdrawable: currentWithdrawable,
    balancePending: currentPending,
    totalEarnings: roundMoney(currentEarnings - commissionAmount),
    totalWithdrawn: roundMoney(Math.max(0, currentWithdrawn - commissionAmount)),
    netTestEffect: 0,
  };
}

export function analyzeRejectCommissionSafety(commission = {}, partner = {}) {
  const amount = roundMoney(commission.amount);
  const balanceWithdrawable = roundMoney(partner.balance_withdrawable);
  const totalEarnings = roundMoney(partner.total_earnings);
  const wasWithdrawable =
    commission.status === "withdrawable" || commission.is_withdrawable;

  const balanceWithdrawableAfterReject = wasWithdrawable
    ? Math.max(0, balanceWithdrawable - amount)
    : balanceWithdrawable;

  return {
    canUseDirectRejectCommission:
      wasWithdrawable && balanceWithdrawable <= amount && balanceWithdrawableAfterReject >= 0,
    useSettlementHelperInstead: wasWithdrawable && balanceWithdrawable < amount,
    reason:
      balanceWithdrawable < amount
        ? "Funds already withdrawn; rejectCommission reduces total_earnings only (balance_withdrawable stays 0 via Math.max)"
        : "Standard rejectCommission path",
    balanceWithdrawableAfterReject,
    totalEarningsAfterReject: roundMoney(Math.max(0, totalEarnings - amount)),
    doesNotUpdateTotalWithdrawn: true,
    requiresSeparateTotalWithdrawnAdjustment: roundMoney(partner.total_withdrawn) >= amount,
    skipsNegativeWithdrawable: true,
  };
}

export function findSettlementAdjustmentEntry(ledgerEntries = [], { commissionId, idempotencyKey } = {}) {
  const normalizedCommissionId = String(commissionId || "").trim();
  const structured = (ledgerEntries || []).find(
    (entry) =>
      entry.type === SETTLEMENT_LEDGER_TYPE &&
      entry.reference_type === SETTLEMENT_REFERENCE_TYPE &&
      String(entry.reference_id || "") === normalizedCommissionId
  );
  if (structured) return structured;

  if (!idempotencyKey) return null;
  const marker = `idempotencyKey=${idempotencyKey}`;
  return (ledgerEntries || []).find(
    (entry) =>
      entry.type === SETTLEMENT_LEDGER_TYPE &&
      String(entry.note || "").includes(marker)
  );
}

export function assessSettlementCompletionState({
  partner = {},
  commission = {},
  idempotencyKey,
  partnerLedgerEntries = [],
  expectedBonusAmount = 0.2,
} = {}) {
  const adjustment = findSettlementAdjustmentEntry(partnerLedgerEntries, {
    commissionId: commission.id,
    idempotencyKey,
  });

  const commissionRejected =
    commission.status === SETTLEMENT_COMMISSION_STATUS && commission.is_withdrawable === false;
  const withdrawnSettled = roundMoney(partner.total_withdrawn) === 0;
  const withdrawableOk = roundMoney(partner.balance_withdrawable) === 0;
  const earningsOk =
    Math.abs(roundMoney(partner.total_earnings) - expectedBonusAmount) <= SETTLEMENT_BONUS_TOLERANCE;

  const adjustmentValid =
    adjustment &&
    adjustment.reference_type === SETTLEMENT_REFERENCE_TYPE &&
    String(adjustment.reference_id || "") === String(commission.id || "") &&
    roundMoney(adjustment.amount) === SETTLEMENT_TARGET_COMMISSION_AMOUNT &&
    roundMoney(adjustment.balance_before) === 0 &&
    roundMoney(adjustment.balance_after) === 0;

  if (adjustmentValid && commissionRejected && withdrawnSettled && withdrawableOk && earningsOk) {
    return {
      status: "already-settled",
      adjustmentEntryId: adjustment.id,
      idempotencyKey,
    };
  }

  if (adjustment || commissionRejected) {
    return {
      status: "partial-settlement-detected",
      adjustmentEntryId: adjustment?.id || null,
      commissionStatus: commission.status,
      idempotencyKey,
      mismatches: {
        commissionRejected,
        withdrawnSettled,
        withdrawableOk,
        earningsOk,
        adjustmentPresent: Boolean(adjustment),
        adjustmentValid,
      },
    };
  }

  return { status: "unsettled", idempotencyKey };
}

export function validateBonusIsolation({
  partnerCommissions = [],
  targetCommissionId,
  expectedBonusAmount = 0.2,
} = {}) {
  const others = (partnerCommissions || []).filter((row) => row.id !== targetCommissionId);
  const pendingBonus = others
    .filter((row) => ["pending", "pending_activation", "approved"].includes(String(row.status || "")))
    .reduce((sum, row) => sum + roundMoney(row.amount), 0);
  const withdrawableOther = others
    .filter((row) => row.status === "withdrawable" || row.is_withdrawable)
    .reduce((sum, row) => sum + roundMoney(row.amount), 0);

  return {
    ok:
      withdrawableOther === 0 &&
      Math.abs(pendingBonus - expectedBonusAmount) <= SETTLEMENT_BONUS_TOLERANCE,
    pendingBonus,
    withdrawableOther,
    expectedBonusAmount,
  };
}

export function validateSettlementPreconditions(context = {}) {
  const blockers = [];
  const {
    requestId,
    subscriptionRow,
    commission,
    partner,
    partnerProfile,
    commissionLedgerEntries = [],
    partnerLedgerEntries = [],
    partnerCommissions = [],
    paidWithdrawal,
    allWithdrawals = [],
    financialClassification,
    externalPayoutEvidence,
    settlementState,
  } = context;

  if (!subscriptionRow) {
    blockers.push({ code: "REQUEST_NOT_FOUND", requestId });
    return blockers;
  }

  if (!isApprovedTestSubscriptionRow(subscriptionRow)) {
    blockers.push({ code: "NON_TEST_REQUEST", requestId, email: subscriptionRow.user_email });
  }

  if (!isTestSettlementContext({ partnerProfile, subscriptionRow, withdrawal: paidWithdrawal })) {
    blockers.push({ code: "NON_TEST_PARTNER_OR_REFERRED_USER", requestId });
  }

  const requestCommissions = (partnerCommissions || []).filter(
    (row) => String(row.subscription_id || row.source_ref) === String(requestId)
  );
  if (requestCommissions.length !== 1) {
    blockers.push({
      code: "COMMISSION_COUNT_MISMATCH",
      requestId,
      count: requestCommissions.length,
    });
  }

  if (!commission?.id) {
    blockers.push({ code: "COMMISSION_NOT_FOUND", requestId });
    return blockers;
  }

  if (commission.status !== "withdrawable") {
    if (commission.status === SETTLEMENT_COMMISSION_STATUS && settlementState?.status === "already-settled") {
      return blockers;
    }
    blockers.push({
      code: "COMMISSION_STATUS_INVALID",
      requestId,
      status: commission.status,
      expected: "withdrawable",
    });
  }

  if (roundMoney(commission.amount) !== SETTLEMENT_TARGET_COMMISSION_AMOUNT) {
    blockers.push({
      code: "COMMISSION_AMOUNT_MISMATCH",
      requestId,
      amount: commission.amount,
      expected: SETTLEMENT_TARGET_COMMISSION_AMOUNT,
    });
  }

  const releaseEntries = (commissionLedgerEntries || []).filter(
    (entry) => entry.type === "commission_release"
  );
  if (releaseEntries.length !== 1 || roundMoney(releaseEntries[0].amount) !== SETTLEMENT_TARGET_COMMISSION_AMOUNT) {
    blockers.push({ code: "COMMISSION_RELEASE_LEDGER_INVALID", requestId, count: releaseEntries.length });
  }

  if (!paidWithdrawal?.id || paidWithdrawal.status !== "paid") {
    blockers.push({ code: "PAID_WITHDRAWAL_NOT_FOUND", requestId });
  } else if (roundMoney(paidWithdrawal.amount) !== SETTLEMENT_TARGET_COMMISSION_AMOUNT) {
    blockers.push({
      code: "WITHDRAWAL_AMOUNT_MISMATCH",
      requestId,
      amount: paidWithdrawal.amount,
    });
  }

  const withdrawalLedger = findLedgerLinksToWithdrawal(partnerLedgerEntries, paidWithdrawal?.id);
  const link = inferWithdrawalCommissionLink({
    commission,
    commissionLedgerEntries,
    withdrawal: paidWithdrawal || {},
    withdrawalLedgerEntries: withdrawalLedger,
  });
  if (!link.linked) {
    blockers.push({ code: "WITHDRAWAL_LEDGER_LINK_MISSING", requestId, reason: link.reason });
  }

  if (externalPayoutEvidence?.hasEvidence) {
    blockers.push({
      code: "EXTERNAL_PAYOUT_EVIDENCE",
      requestId,
      reason: externalPayoutEvidence.reason,
    });
  }

  if (paidWithdrawal?.payment_proof) {
    blockers.push({ code: "EXTERNAL_PAYMENT_PROOF_PRESENT", requestId });
  }

  if (!isE2EWithdrawalPattern(paidWithdrawal || {})) {
    blockers.push({ code: "NON_E2E_WITHDRAWAL_PATTERN", requestId });
  }

  if (roundMoney(partner.balance_withdrawable) !== 0) {
    blockers.push({
      code: "PARTNER_BALANCE_WITHDRAWABLE_MISMATCH",
      requestId,
      value: partner.balance_withdrawable,
    });
  }

  if (roundMoney(partner.total_withdrawn) < SETTLEMENT_TARGET_COMMISSION_AMOUNT) {
    blockers.push({
      code: "PARTNER_TOTAL_WITHDRAWN_TOO_LOW",
      requestId,
      value: partner.total_withdrawn,
    });
  }

  const otherPaidWithdrawals = (allWithdrawals || []).filter(
    (row) => row.status === "paid" && row.id !== paidWithdrawal?.id
  );
  if (otherPaidWithdrawals.length > 0) {
    blockers.push({
      code: "OTHER_PAID_WITHDRAWAL_PRESENT",
      requestId,
      withdrawalIds: otherPaidWithdrawals.map((row) => row.id),
    });
  }

  const bonusCheck = validateBonusIsolation({
    partnerCommissions,
    targetCommissionId: commission.id,
  });
  if (!bonusCheck.ok) {
    blockers.push({
      code: "BONUS_ISOLATION_FAILED",
      requestId,
      pendingBonus: bonusCheck.pendingBonus,
      withdrawableOther: bonusCheck.withdrawableOther,
    });
  }

  if (financialClassification !== FINANCIAL_CLASSIFICATIONS.TEST_WITHDRAWAL_COMPLETED) {
    blockers.push({
      code: "FINANCIAL_CLASSIFICATION_INVALID",
      requestId,
      classification: financialClassification,
    });
  }

  if (settlementState?.status === "partial-settlement-detected") {
    blockers.push({
      code: "PARTIAL_SETTLEMENT_DETECTED",
      requestId,
      mismatches: settlementState.mismatches,
    });
  }

  return blockers;
}

export function buildSettlementPlanEntry(context = {}) {
  const {
    requestId,
    partner,
    partnerProfile,
    commission,
    paidWithdrawal,
    financialClassification,
    externalPayoutEvidence,
    settlementState,
    rejectAnalysis,
  } = context;

  const idempotencyKey = buildSettlementIdempotencyKey(
    requestId,
    commission.id,
    paidWithdrawal.id
  );
  const currentBalances = {
    balanceWithdrawable: roundMoney(partner.balance_withdrawable),
    balancePending: roundMoney(partner.balance_pending),
    totalEarnings: roundMoney(partner.total_earnings),
    totalWithdrawn: roundMoney(partner.total_withdrawn),
  };
  const expectedBalances = buildExpectedBalancesAfterSettlement(partner, roundMoney(commission.amount));
  const blockers = validateSettlementPreconditions(context);
  const alreadySettled = settlementState?.status === "already-settled";

  const proposedActions = alreadySettled
    ? ["status=already-settled", "skip — idempotent no-op"]
    : [
        `insert partner_wallet_ledger adjustment amount=+${roundMoney(commission.amount)} reference_type=${SETTLEMENT_REFERENCE_TYPE} balance_before=0 balance_after=0`,
        `update partners.total_withdrawn ${currentBalances.totalWithdrawn} → ${expectedBalances.totalWithdrawn}`,
        `reject commission ${commission.id} via settlement helper (skip withdrawable double-deduct)`,
        `update partners.total_earnings ${currentBalances.totalEarnings} → ${expectedBalances.totalEarnings}`,
        "write partner audit log with before/after + idempotency key",
        "preserve paid withdrawal row and original ledger entries",
      ];

  return {
    requestId,
    partnerId: partner.id,
    commissionId: commission.id,
    withdrawalId: paidWithdrawal.id,
    financialClassification,
    externalPayoutEvidence,
    settlementStatus: settlementState?.status || "unsettled",
    currentBalances,
    expectedBalances,
    commissionCurrentStatus: commission.status,
    commissionExpectedStatus: SETTLEMENT_COMMISSION_STATUS,
    ledgerAdjustmentAmount: roundMoney(commission.amount),
    ledgerAdjustmentSignedAmount: roundMoney(commission.amount),
    ledgerBalanceBefore: 0,
    ledgerBalanceAfter: 0,
    ledgerReferenceType: SETTLEMENT_REFERENCE_TYPE,
    ledgerAccountingEffect: SETTLEMENT_LEDGER_ACCOUNTING_EFFECT,
    idempotencyKey,
    transactionRequired: true,
    proposedRpc: SETTLEMENT_RPC_NAME,
    rejectCommissionAnalysis: rejectAnalysis,
    proposedActions,
    blockers,
    canExecute: blockers.length === 0 && !alreadySettled,
    alreadySettled,
    dryRun: true,
    auditPayload: {
      reason: SETTLEMENT_REASON,
      requestId,
      commissionId: commission.id,
      withdrawalId: paidWithdrawal.id,
      partnerEmail: partnerProfile?.email || null,
      before: currentBalances,
      after: expectedBalances,
      idempotencyKey,
      operator: SETTLEMENT_OPERATOR,
    },
  };
}

export function buildSettlementPlanReport(entries = []) {
  const blockers = entries.flatMap((entry) =>
    (entry.blockers || []).map((blocker) => ({ requestId: entry.requestId, ...blocker }))
  );
  return {
    dryRun: true,
    executeSupported: true,
    entries,
    canExecuteAll: entries.every((entry) => entry.canExecute || entry.alreadySettled),
    blockers,
    transactional: {
      supportedViaSupabaseJs: false,
      recommended:
        "One RPC/function per partner wrapping ledger insert + partners update + commission reject in a single Postgres transaction",
      proposedSql: `
CREATE OR REPLACE FUNCTION settle_test_partner_financial(
  p_partner_id uuid,
  p_commission_id uuid,
  p_withdrawal_id uuid,
  p_request_id bigint,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
BEGIN
  -- 1) fail if adjustment with p_idempotency_key already exists
  -- 2) insert adjustment ledger (+amount)
  -- 3) update partners.total_withdrawn -= amount, total_earnings -= amount
  -- 4) update partner_commissions status rejected (skip balance_withdrawable decrement)
  -- 5) return before/after snapshot
END;
$$;`,
      note: "Do not deploy without explicit approval",
    },
  };
}

export function evaluateCleanupFinancialSettlementBlocker(settlementAssessment = null) {
  if (!settlementAssessment) {
    return { code: "FINANCIAL_SETTLEMENT_REQUIRED", message: "Settlement assessment missing" };
  }
  if (settlementAssessment.status === "already-settled") {
    return null;
  }
  if (settlementAssessment.status === "partial-settlement-detected") {
    return {
      code: "PARTIAL_FINANCIAL_SETTLEMENT",
      message: "Partial settlement detected; manual review required",
      mismatches: settlementAssessment.mismatches,
    };
  }
  return {
    code: "FINANCIAL_SETTLEMENT_REQUIRED",
    message: "E2E financial settlement must complete before cleanup",
  };
}

export function previewCommissionCleanupEligibility(
  commission = {},
  partner = {},
  settlementAssessment = null
) {
  const amount = roundMoney(commission.amount);
  const before = {
    balanceWithdrawable: roundMoney(partner.balance_withdrawable),
    balancePending: roundMoney(partner.balance_pending),
    totalEarnings: roundMoney(partner.total_earnings),
    totalWithdrawn: roundMoney(partner.total_withdrawn),
  };

  if (commission.status === SETTLEMENT_COMMISSION_STATUS) {
    const settlementBlocker = evaluateCleanupFinancialSettlementBlocker(settlementAssessment);
    if (!settlementBlocker) {
      return {
        commissionId: commission.id,
        requestId: commission.subscription_id || commission.source_ref,
        partnerId: commission.partner_id,
        amount,
        status: commission.status,
        blocker: null,
        before,
        after: before,
        action: "delete_settled_commission_row",
      };
    }
    return {
      commissionId: commission.id,
      requestId: commission.subscription_id || commission.source_ref,
      partnerId: commission.partner_id,
      amount,
      status: commission.status,
      blocker: settlementBlocker.code,
      before,
      after: before,
      action: "stop",
    };
  }

  const settlementBlocker = evaluateCleanupFinancialSettlementBlocker(settlementAssessment);
  if (
    settlementBlocker &&
    (commission.status === "withdrawable" || commission.is_withdrawable) &&
    before.balanceWithdrawable < amount &&
    before.totalWithdrawn >= amount
  ) {
    return {
      commissionId: commission.id,
      requestId: commission.subscription_id || commission.source_ref,
      partnerId: commission.partner_id,
      amount,
      status: commission.status,
      blocker: settlementBlocker.code,
      before,
      after: before,
      action: "stop",
    };
  }

  if (
    (commission.status === "withdrawable" || commission.is_withdrawable) &&
    before.balanceWithdrawable < amount &&
    before.totalWithdrawn >= amount
  ) {
    return {
      commissionId: commission.id,
      requestId: commission.subscription_id || commission.source_ref,
      partnerId: commission.partner_id,
      amount,
      status: commission.status,
      blocker: "FINANCIAL_SETTLEMENT_REQUIRED",
      before,
      after: before,
      action: "stop",
    };
  }

  return null;
}

export async function assessSettlementStateForRequest(supabase, requestId) {
  const { data: commission, error: commissionError } = await supabase
    .from("partner_commissions")
    .select(COMMISSION_COLUMNS)
    .eq("subscription_id", String(requestId))
    .maybeSingle();
  if (commissionError) throw commissionError;
  if (!commission?.id) {
    return { requestId, status: "unsettled", reason: "commission_not_found" };
  }

  const { data: partner, error: partnerError } = await supabase
    .from("partners")
    .select("id,balance_withdrawable,balance_pending,total_earnings,total_withdrawn")
    .eq("id", commission.partner_id)
    .single();
  if (partnerError) throw partnerError;

  const { data: withdrawals, error: withdrawalError } = await supabase
    .from("partner_withdrawals")
    .select(PARTNER_WITHDRAWAL_COLUMNS)
    .eq("partner_id", commission.partner_id);
  if (withdrawalError) throw withdrawalError;

  const paidWithdrawal = (withdrawals || []).find((row) => row.status === "paid");
  if (!paidWithdrawal?.id) {
    return { requestId, status: "unsettled", reason: "paid_withdrawal_not_found" };
  }

  const idempotencyKey = buildSettlementIdempotencyKey(
    requestId,
    commission.id,
    paidWithdrawal.id
  );

  const { data: partnerLedgerEntries, error: ledgerError } = await supabase
    .from("partner_wallet_ledger")
    .select(PARTNER_LEDGER_COLUMNS)
    .eq("partner_id", commission.partner_id)
    .order("created_at", { ascending: true });
  if (ledgerError) throw ledgerError;

  return {
    requestId,
    commissionId: commission.id,
    withdrawalId: paidWithdrawal.id,
    idempotencyKey,
    ...assessSettlementCompletionState({
      partner,
      commission,
      idempotencyKey,
      partnerLedgerEntries: partnerLedgerEntries || [],
    }),
  };
}

async function fetchPartnerProfile(supabase, partner = {}) {
  if (!partner?.user_id) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,username")
    .eq("id", partner.user_id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function discoverSettlementContext(supabase, requestId) {
  const { data: subscriptionRow, error: subscriptionError } = await supabase
    .from("subscription_requests")
    .select("id,user_email,username,status")
    .eq("id", requestId)
    .maybeSingle();
  if (subscriptionError) throw subscriptionError;

  const { data: commissions, error: commissionError } = await supabase
    .from("partner_commissions")
    .select(COMMISSION_COLUMNS)
    .eq("subscription_id", String(requestId));
  if (commissionError) throw commissionError;

  const commission = (commissions || [])[0] || null;
  if (!commission?.id) {
    return { requestId, subscriptionRow, commission: null };
  }

  const { data: partner, error: partnerError } = await supabase
    .from("partners")
    .select("id,user_id,balance_withdrawable,balance_pending,total_earnings,total_withdrawn")
    .eq("id", commission.partner_id)
    .single();
  if (partnerError) throw partnerError;

  const partnerProfile = await fetchPartnerProfile(supabase, partner);

  const { data: partnerCommissions, error: allCommissionError } = await supabase
    .from("partner_commissions")
    .select(COMMISSION_COLUMNS)
    .eq("partner_id", commission.partner_id);
  if (allCommissionError) throw allCommissionError;

  const { data: commissionLedgerEntries, error: commissionLedgerError } = await supabase
    .from("partner_wallet_ledger")
    .select(PARTNER_LEDGER_COLUMNS)
    .eq("reference_type", "commission")
    .eq("reference_id", commission.id)
    .order("created_at", { ascending: true });
  if (commissionLedgerError) throw commissionLedgerError;

  const { data: partnerLedgerEntries, error: partnerLedgerError } = await supabase
    .from("partner_wallet_ledger")
    .select(PARTNER_LEDGER_COLUMNS)
    .eq("partner_id", commission.partner_id)
    .order("created_at", { ascending: true });
  if (partnerLedgerError) throw partnerLedgerError;

  const { data: allWithdrawals, error: withdrawalError } = await supabase
    .from("partner_withdrawals")
    .select(PARTNER_WITHDRAWAL_COLUMNS)
    .eq("partner_id", commission.partner_id)
    .order("created_at", { ascending: true });
  if (withdrawalError) throw withdrawalError;

  const paidWithdrawals = (allWithdrawals || []).filter((row) => row.status === "paid");
  let paidWithdrawal = null;
  let financialClassification = FINANCIAL_CLASSIFICATIONS.NEEDS_MANUAL_REVIEW;

  for (const withdrawal of paidWithdrawals) {
    const withdrawalLedger = findLedgerLinksToWithdrawal(partnerLedgerEntries || [], withdrawal.id);
    const link = inferWithdrawalCommissionLink({
      commission,
      commissionLedgerEntries: commissionLedgerEntries || [],
      withdrawal,
      withdrawalLedgerEntries: withdrawalLedger,
    });
    if (link.linked) {
      paidWithdrawal = withdrawal;
      financialClassification = FINANCIAL_CLASSIFICATIONS.TEST_WITHDRAWAL_COMPLETED;
      break;
    }
  }

  if (!paidWithdrawal && paidWithdrawals.length === 1) {
    paidWithdrawal = paidWithdrawals[0];
    if (
      isTestSettlementContext({ partnerProfile, subscriptionRow, withdrawal: paidWithdrawal }) &&
      !hasExternalPayoutEvidence(paidWithdrawal).hasEvidence
    ) {
      financialClassification = FINANCIAL_CLASSIFICATIONS.TEST_WITHDRAWAL_COMPLETED;
    }
  }

  const externalPayoutEvidence = hasExternalPayoutEvidence(paidWithdrawal || {});
  const idempotencyKey = paidWithdrawal
    ? buildSettlementIdempotencyKey(requestId, commission.id, paidWithdrawal.id)
    : null;
  const settlementState = assessSettlementCompletionState({
    partner,
    commission,
    idempotencyKey,
    partnerLedgerEntries: partnerLedgerEntries || [],
  });

  return {
    requestId,
    subscriptionRow,
    commission,
    partner,
    partnerProfile,
    partnerCommissions: partnerCommissions || [],
    commissionLedgerEntries: commissionLedgerEntries || [],
    partnerLedgerEntries: partnerLedgerEntries || [],
    allWithdrawals: allWithdrawals || [],
    paidWithdrawal,
    financialClassification,
    externalPayoutEvidence,
    settlementState,
    rejectAnalysis: analyzeRejectCommissionSafety(commission, partner),
  };
}

export async function runSettleTestPartnerFinancials(supabase, { requestIds = [], execute = false } = {}) {
  const ids = assertSettleRequestIds(requestIds);
  if (execute) {
    await assertSettlementRpcAvailable(supabase);
  }
  const entries = [];

  for (const requestId of ids) {
    const context = await discoverSettlementContext(supabase, requestId);
    if (!context.commission?.id || !context.paidWithdrawal?.id) {
      entries.push({
        requestId,
        blockers: [{ code: "DISCOVERY_INCOMPLETE", requestId }],
        canExecute: false,
        dryRun: !execute,
      });
      continue;
    }

    entries.push(
      buildSettlementPlanEntry({
        ...context,
        requestId,
      })
    );
  }

  const report = buildSettlementPlanReport(entries);
  report.dryRun = !execute;

  if (execute) {
    const results = [];
    for (const entry of entries) {
      if (entry.alreadySettled) {
        results.push({
          requestId: entry.requestId,
          rpcStatus: "already-settled",
          skipped: true,
        });
        continue;
      }
      if (!entry.canExecute) {
        const err = new Error(`Settlement preconditions failed for request ${entry.requestId}`);
        err.code = "EXECUTE_BLOCKED";
        err.blockers = entry.blockers || [];
        throw err;
      }
      const rpcResult = await executeSettlementViaRpc(supabase, entry);
      results.push(mapRpcResultToEntryResult(entry, rpcResult));
    }
    report.executed = true;
    report.executionMode = "rpc_only";
    report.rpcResults = results;
  }

  return report;
}

/**
 * Legacy non-transactional helper — NOT used by --execute.
 * Production execute must go through settle_test_partner_financial RPC only.
 */
export async function applyTestCommissionSettlement(
  supabase,
  {
    commission,
    partner,
    paidWithdrawal,
    idempotencyKey,
    requestId,
    reason = SETTLEMENT_REASON,
  }
) {
  const amount = roundMoney(commission.amount);
  const currentWithdrawable = roundMoney(partner.balance_withdrawable);
  const currentEarnings = roundMoney(partner.total_earnings);
  const currentWithdrawn = roundMoney(partner.total_withdrawn);
  const timestamp = new Date().toISOString();

  const note = buildSettlementLedgerNote({
    requestId,
    commissionId: commission.id,
    withdrawalId: paidWithdrawal.id,
    originalAmount: amount,
    idempotencyKey,
    balancePendingAtSettlement: partner.balance_pending,
    timestamp,
  });

  const { data: ledgerRow, error: ledgerError } = await supabase
    .from("partner_wallet_ledger")
    .insert({
      partner_id: partner.id,
      type: SETTLEMENT_LEDGER_TYPE,
      amount,
      balance_before: currentWithdrawable,
      balance_after: currentWithdrawable,
      reference_type: "withdrawal",
      reference_id: paidWithdrawal.id,
      note,
    })
    .select(PARTNER_LEDGER_COLUMNS)
    .single();
  if (ledgerError) throw ledgerError;

  const { data: updatedPartner, error: partnerError } = await supabase
    .from("partners")
    .update({
      total_withdrawn: roundMoney(Math.max(0, currentWithdrawn - amount)),
      total_earnings: roundMoney(Math.max(0, currentEarnings - amount)),
      updated_at: timestamp,
    })
    .eq("id", partner.id)
    .select("id,balance_withdrawable,balance_pending,total_earnings,total_withdrawn")
    .single();
  if (partnerError) throw partnerError;

  const { data: rejectedCommission, error: rejectError } = await supabase
    .from("partner_commissions")
    .update({
      status: SETTLEMENT_COMMISSION_STATUS,
      is_withdrawable: false,
      reason,
      description: reason,
      updated_at: timestamp,
    })
    .eq("id", commission.id)
    .in("status", ["withdrawable"])
    .select("id,status,amount,partner_id")
    .maybeSingle();
  if (rejectError) throw rejectError;
  if (!rejectedCommission?.id) throw new Error("COMMISSION_REJECT_FAILED");

  return {
    ledgerRow,
    partner: updatedPartner,
    commission: rejectedCommission,
    idempotencyKey,
  };
}

export function assertSettleExecuteAllowed(report = {}) {
  if (report.canExecuteAll || (report.entries || []).every((entry) => entry.canExecute || entry.alreadySettled)) {
    return report;
  }
  const error = new Error("Settlement preconditions failed");
  error.code = "EXECUTE_BLOCKED";
  error.blockers = report.blockers || [];
  throw error;
}
