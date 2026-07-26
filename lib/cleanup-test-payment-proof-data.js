/**
 * Core logic for production cleanup of test payment-proof subscription data.
 * Used by scripts/cleanup-test-payment-proof-data.js (CLI) and tests.
 * Settlement-aware cleanup eligibility is evaluated in cleanup-test-payment-proof-runner.js
 * via lib/settle-test-partner-financials.js (FINANCIAL_SETTLEMENT_REQUIRED blocker).
 */

import { PAYMENT_PROOF_BUCKET } from "./payment-proof-storage.js";

export const DEFAULT_APPROVED_TEST_REQUEST_IDS = [
  33, 34, 35, 41, 42, 43, 44, 45, 46, 54, 55, 56,
];

export const CLEANUP_EXECUTION_ORDER = [
  "revalidate_test_rows",
  "reverse_partner_commissions",
  "delete_partner_commission_ledger",
  "delete_partner_commissions",
  "delete_subscription_upload_sessions",
  "collect_storage_paths",
  "delete_crm_notes",
  "delete_notifications",
  "delete_email_outbox",
  "delete_admin_logs",
  "delete_affiliate_references",
  "clear_payment_proof_references",
  "delete_subscription_requests",
  "verify_storage_unreferenced",
  "delete_storage_objects",
  "verify_and_audit",
];

export const KNOWN_REFERENCE_SPECS = [
  {
    table: "subscription_requests",
    referenceType: "primary_row",
    fkEnforced: false,
    cleanupAction: "delete_row",
    order: 12,
  },
  {
    table: "subscription_upload_sessions",
    referenceType: "subscription_request_id",
    fkEnforced: false,
    cleanupAction: "delete_rows",
    order: 4,
  },
  {
    table: "partner_commissions",
    referenceType: "subscription_id|source_ref",
    fkEnforced: false,
    cleanupAction: "reject_then_delete",
    order: 2,
  },
  {
    table: "partner_wallet_ledger",
    referenceType: "commission_reference",
    fkEnforced: true,
    cleanupAction: "delete_rows",
    order: 3,
  },
  {
    table: "admin_logs",
    referenceType: "target_id",
    fkEnforced: false,
    cleanupAction: "delete_rows",
    order: 10,
  },
  {
    table: "notifications",
    referenceType: "metadata.subscriptionRequestId",
    fkEnforced: false,
    cleanupAction: "delete_rows",
    order: 8,
  },
  {
    table: "email_outbox",
    referenceType: "metadata.subscriptionRequestId|idempotency_key",
    fkEnforced: false,
    cleanupAction: "delete_rows",
    order: 9,
  },
  {
    table: "admin_user_notes",
    referenceType: "user_id",
    fkEnforced: false,
    cleanupAction: "delete_test_user_notes",
    order: 7,
  },
  {
    table: "partner_referrals",
    referenceType: "referred_user_id",
    fkEnforced: false,
    cleanupAction: "delete_test_referrals",
    order: 11,
  },
  {
    table: "partner_withdrawals",
    referenceType: "partner_balance_blocker",
    fkEnforced: false,
    cleanupAction: "blocker_check_only",
    order: 1,
  },
  {
    table: "storage_path_cross_refs",
    referenceType: "shared_storage_path",
    fkEnforced: false,
    cleanupAction: "blocker_check_only",
    order: 1,
  },
];

const TEST_EMAIL_PATTERNS = [
  /@test\.local$/i,
  /^e2e-/i,
  /^prod-e2e-/i,
  /\+test@/i,
];

const TEST_USERNAME_PATTERNS = [
  /^Partner[A-Z]\d+/i,
  /^RealB\d+/i,
  /^PayE2E/i,
  /^ProdB\d+/i,
  /e2e/i,
  /test/i,
];

export function parseCleanupArgs(argv = []) {
  const args = {
    dryRun: true,
    requestIds: [],
  };

  for (const arg of argv) {
    if (arg === "--execute") args.dryRun = false;
    if (arg === "--dry-run") args.dryRun = true;
    if (arg.startsWith("--request-ids=")) {
      args.requestIds = arg
        .slice("--request-ids=".length)
        .split(",")
        .map((value) => Number(String(value).trim()))
        .filter((value) => Number.isInteger(value) && value > 0);
    }
  }

  return args;
}

export function parseRequestIdsFromArgs(argv = []) {
  const { requestIds } = parseCleanupArgs(argv);
  return requestIds;
}

export function isTestEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return false;
  return TEST_EMAIL_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isTestUsername(username) {
  const normalized = String(username || "").trim();
  if (!normalized) return false;
  return TEST_USERNAME_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function isApprovedTestSubscriptionRow(row = {}) {
  const email = String(row.user_email || row.userEmail || "").trim();
  const username = String(row.username || "").trim();
  if (isTestEmail(email)) return true;
  if (isTestUsername(username) && (isTestEmail(email) || /test|e2e/i.test(email))) return true;
  return false;
}

export function assertExplicitRequestIds(requestIds = []) {
  if (!Array.isArray(requestIds) || requestIds.length === 0) {
    const error = new Error("Missing required --request-ids=33,34,... (explicit ID list mandatory)");
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

export function previewCommissionReversal(commission = {}, partner = {}) {
  const status = String(commission.status || "").trim();
  const amount = Number(commission.amount || 0);
  const before = {
    balanceWithdrawable: Number(partner.balance_withdrawable || 0),
    balancePending: Number(partner.balance_pending || 0),
    totalEarnings: Number(partner.total_earnings || 0),
    totalWithdrawn: Number(partner.total_withdrawn || 0),
  };

  if (status === "paid") {
    return {
      commissionId: commission.id,
      requestId: commission.subscription_id || commission.source_ref,
      blocker: "COMMISSION_ALREADY_PAID",
      before,
      after: before,
      action: "stop",
    };
  }

  if (
    (status === "withdrawable" || commission.is_withdrawable) &&
    before.balanceWithdrawable < amount &&
    before.totalWithdrawn >= amount
  ) {
    return {
      commissionId: commission.id,
      requestId: commission.subscription_id || commission.source_ref,
      partnerId: commission.partner_id,
      amount,
      status,
      blocker: "COMMISSION_ALREADY_WITHDRAWN",
      before,
      after: before,
      action: "stop",
    };
  }

  if (status === "rejected") {
    return {
      commissionId: commission.id,
      requestId: commission.subscription_id || commission.source_ref,
      blocker: null,
      before,
      after: before,
      action: "already_reversed_delete_row",
    };
  }

  const after = { ...before };
  if (status === "withdrawable" || commission.is_withdrawable) {
    after.balanceWithdrawable = Math.max(0, before.balanceWithdrawable - amount);
  } else if (["pending", "pending_activation", "approved"].includes(status)) {
    after.balancePending = Math.max(0, before.balancePending - amount);
  }
  after.totalEarnings = Math.max(0, before.totalEarnings - amount);

  return {
    commissionId: commission.id,
    requestId: commission.subscription_id || commission.source_ref,
    partnerId: commission.partner_id,
    amount,
    status,
    blocker: null,
    before,
    after,
    action: "rejectCommission_then_delete",
  };
}

export function evaluateWithdrawalBlockers({
  partner = {},
  commissionPreview = {},
  withdrawals = [],
} = {}) {
  const blockers = [];
  const amount = Number(commissionPreview.amount || 0);
  const afterWithdrawable = Number(
    commissionPreview.after?.balanceWithdrawable ?? partner.balance_withdrawable ?? 0
  );

  for (const withdrawal of withdrawals || []) {
    const status = String(withdrawal.status || "").trim();
    const withdrawalAmount = Number(withdrawal.amount || 0);
    if (!["pending", "approved"].includes(status)) continue;

    if (withdrawalAmount > afterWithdrawable) {
      blockers.push({
        code: "ACTIVE_WITHDRAWAL_EXCEEDS_BALANCE_AFTER_REVERSAL",
        withdrawalId: withdrawal.id,
        amount: withdrawalAmount,
        balanceAfterReversal: afterWithdrawable,
        message: "Active withdrawal would exceed partner balance after commission reversal",
      });
    }
  }

  if (amount > 0 && afterWithdrawable < 0) {
    blockers.push({
      code: "NEGATIVE_BALANCE_AFTER_REVERSAL",
      message: "Commission reversal would drive withdrawable balance negative",
    });
  }

  return blockers;
}

export function buildStorageTarget({
  requestId,
  rowPath = "",
  storageInspection = null,
  uploadSessionPaths = [],
} = {}) {
  const dbPath = String(rowPath || "").trim();
  if (!dbPath) return null;

  const foreignSessionPaths = (uploadSessionPaths || []).filter((path) => path && path !== dbPath);
  if (foreignSessionPaths.length > 0) {
    return {
      requestId,
      objectPath: dbPath,
      bucket: PAYMENT_PROOF_BUCKET,
      blocked: true,
      blocker: "STORAGE_PATH_SHARED_WITH_UPLOAD_SESSION",
      sharedPaths: foreignSessionPaths,
    };
  }

  return {
    requestId,
    objectPath: dbPath,
    bucket: PAYMENT_PROOF_BUCKET,
    bytes: storageInspection?.bytes ?? null,
    contentHash: storageInspection?.contentHash ?? null,
    blocked: false,
    blocker: null,
  };
}

export function findUnknownReferences(discovered = {}, knownTables = KNOWN_REFERENCE_SPECS) {
  const known = new Set(knownTables.map((spec) => spec.table));
  return Object.keys(discovered).filter((table) => !known.has(table));
}

export function buildCleanupPlan({
  requestIds = [],
  rows = [],
  references = {},
  commissionPlans = [],
  storageTargets = [],
  blockers = [],
  dryRun = true,
} = {}) {
  const missingIds = requestIds.filter(
    (id) => !(rows || []).some((row) => Number(row.id) === Number(id))
  );

  const nonTestRows = (rows || []).filter((row) => !isApprovedTestSubscriptionRow(row));
  const unknownReferences = findUnknownReferences(references);

  const planBlockers = [...(blockers || [])];
  if (missingIds.length) {
    planBlockers.push({
      code: "REQUEST_NOT_FOUND",
      requestIds: missingIds,
      message: "One or more request IDs were not found",
    });
  }
  if (nonTestRows.length) {
    planBlockers.push({
      code: "NON_TEST_ROW",
      requestIds: nonTestRows.map((row) => row.id),
      emails: nonTestRows.map((row) => row.user_email),
      message: "Refusing cleanup: row is not an approved test account",
    });
  }
  if (unknownReferences.length) {
    planBlockers.push({
      code: "UNKNOWN_REFERENCE_TABLE",
      tables: unknownReferences,
      message: "Discovered references in tables not covered by cleanup script",
    });
  }

  for (const target of storageTargets || []) {
    if (target.blocked) {
      planBlockers.push({
        code: target.blocker || "STORAGE_BLOCKED",
        requestId: target.requestId,
        objectPath: target.objectPath,
      });
    }
  }

  for (const commissionPlan of commissionPlans || []) {
    if (commissionPlan.blocker) {
      planBlockers.push({
        code: commissionPlan.blocker,
        commissionId: commissionPlan.commissionId,
        requestId: commissionPlan.requestId,
      });
    }
  }

  const canExecute = planBlockers.length === 0;

  return {
    dryRun,
    requestIds,
    rows: (rows || []).map((row) => ({
      id: row.id,
      user_email: row.user_email,
      username: row.username,
      status: row.status,
      payment_proof_path: row.payment_proof_path,
      hasBase64: Boolean(String(row.payment_proof || "").trim()),
      isTest: isApprovedTestSubscriptionRow(row),
    })),
    references,
    commissionPlans,
    storageTargets,
    executionOrder: CLEANUP_EXECUTION_ORDER,
    base64Note:
      "Deleting subscription_requests removes inline test Base64; no separate nullify step required for targeted rows.",
    transactional: {
      supported: false,
      reason:
        "Supabase JS client cannot run multi-table DB transactions; Storage deletes are non-transactional. Safe production approach: ordered steps with fail-closed preconditions, then Storage delete only after DB paths are cleared.",
      storageRetry:
        "If Storage delete fails after DB cleanup, re-run with --execute; idempotent skips already-deleted rows and retries remaining object paths only.",
    },
    blockers: planBlockers,
    canExecute,
  };
}

export function assertExecuteAllowed(plan = {}) {
  if (plan.canExecute) return plan;
  const error = new Error(
    `Cleanup preconditions failed (${(plan.blockers || []).map((b) => b.code).join(", ")})`
  );
  error.code = "EXECUTE_BLOCKED";
  error.blockers = plan.blockers || [];
  throw error;
}

const PENDING_BALANCE_STATUSES = new Set(["pending", "pending_activation", "approved"]);

/**
 * Mirrors lib/partner-commission-engine.rejectCommission for Node CLI usage.
 * Reverses partner balances, then marks commission rejected.
 */
export async function reverseTestCommissionForCleanup(
  supabase,
  commissionId,
  { reason = "Test data cleanup before production launch" } = {}
) {
  const normalizedCommissionId = String(commissionId || "").trim();
  if (!normalizedCommissionId) throw new Error("MISSING_COMMISSION_ID");

  const { data: commission, error: commissionError } = await supabase
    .from("partner_commissions")
    .select("id, partner_id, amount, status, is_withdrawable")
    .eq("id", normalizedCommissionId)
    .maybeSingle();
  if (commissionError) throw commissionError;
  if (!commission?.id) throw new Error("NOT_FOUND");
  if (["rejected", "paid"].includes(String(commission.status || ""))) {
    return { skipped: true, commission };
  }

  const amount = Number(commission.amount || 0);
  const wasWithdrawable =
    commission.status === "withdrawable" || commission.is_withdrawable;

  const { data: partner, error: partnerError } = await supabase
    .from("partners")
    .select("balance_pending, balance_withdrawable, total_earnings")
    .eq("id", commission.partner_id)
    .single();
  if (partnerError) throw partnerError;

  const partnerUpdates = { updated_at: new Date().toISOString() };
  if (wasWithdrawable) {
    partnerUpdates.balance_withdrawable = Math.max(
      0,
      Number(partner.balance_withdrawable || 0) - amount
    );
  } else if (PENDING_BALANCE_STATUSES.has(String(commission.status || ""))) {
    partnerUpdates.balance_pending = Math.max(0, Number(partner.balance_pending || 0) - amount);
  }
  if (amount > 0) {
    partnerUpdates.total_earnings = Math.max(0, Number(partner.total_earnings || 0) - amount);
  }

  const { data: rejectedCommission, error: rejectError } = await supabase
    .from("partner_commissions")
    .update({
      status: "rejected",
      is_withdrawable: false,
      reason,
      description: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", commission.id)
    .in("status", ["pending", "pending_activation", "approved", "withdrawable"])
    .select("id,status,amount,partner_id")
    .maybeSingle();
  if (rejectError) throw rejectError;
  if (!rejectedCommission?.id) throw new Error("INVALID_STATUS");

  if (Object.keys(partnerUpdates).length > 1) {
    const { error: partnerUpdateError } = await supabase
      .from("partners")
      .update(partnerUpdates)
      .eq("id", commission.partner_id);
    if (partnerUpdateError) throw partnerUpdateError;
  }

  return { skipped: false, commission: rejectedCommission, partnerUpdates };
}

export function summarizePartnerBalances(commissionPlans = []) {
  const byPartner = new Map();
  for (const plan of commissionPlans || []) {
    if (!plan.partnerId) continue;
    const current = byPartner.get(plan.partnerId) || {
      partnerId: plan.partnerId,
      commissionIds: [],
      before: plan.before,
      after: plan.after,
    };
    current.commissionIds.push(plan.commissionId);
    current.before = plan.before;
    current.after = plan.after;
    byPartner.set(plan.partnerId, current);
  }
  return [...byPartner.values()];
}
