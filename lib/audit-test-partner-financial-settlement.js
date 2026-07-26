/**
 * Financial settlement audit for test partner commissions (dry-run only).
 * Read-only discovery + classification; no DB mutations.
 */

import { PARTNER_LEDGER_COLUMNS, PARTNER_WITHDRAWAL_COLUMNS } from "./supabase-query-columns.js";

export const FINANCIAL_CLASSIFICATIONS = {
  REAL_EXTERNAL_PAYOUT: "REAL_EXTERNAL_PAYOUT",
  TEST_WITHDRAWAL_COMPLETED: "TEST_WITHDRAWAL_COMPLETED",
  AGGREGATE_ONLY_NO_DIRECT_LINK: "AGGREGATE_ONLY_NO_DIRECT_LINK",
  PENDING_OR_REJECTED: "PENDING_OR_REJECTED",
  NEEDS_MANUAL_REVIEW: "NEEDS_MANUAL_REVIEW",
};

export const COMMISSION_COLUMNS =
  "id,partner_id,user_id,subscription_id,source_id,source_type,source_ref,amount,currency,status,is_withdrawable,description,reason,invited_username,service_type,commission_percent,base_amount,created_at,updated_at";

const TX_HASH_PATTERN = /\b(0x[a-fA-F0-9]{40,64}|T[A-Za-z0-9]{33}|[a-fA-F0-9]{64})\b/;
const TEST_WALLET_PATTERNS = [
  /^0x0{8,}/i,
  /^test/i,
  /^e2e/i,
  /^TTest/i,
  /^0xdeadbeef/i,
  /^0x1111/i,
];
const TEST_EMAIL_SUFFIX = "@test.local";

export function parseSettlementAuditArgs(argv = []) {
  const args = { requestIds: [], dryRun: true };
  for (const arg of argv) {
    if (arg === "--execute") {
      const error = new Error("--execute is not supported for financial settlement audit");
      error.code = "EXECUTE_NOT_SUPPORTED";
      throw error;
    }
    if (arg.startsWith("--request-ids=")) {
      args.requestIds = arg
        .slice("--request-ids=".length)
        .split(",")
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value) && value > 0);
    }
  }
  return args;
}

export function assertSettlementRequestIds(requestIds = []) {
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

export function isTestPartnerEmail(email = "") {
  return String(email || "").trim().toLowerCase().endsWith(TEST_EMAIL_SUFFIX);
}

export function signedLedgerAmount(entry = {}) {
  const amount = Number(entry.amount || 0);
  const type = String(entry.type || "").trim();
  if (type === "commission_release") return amount;
  if (type === "withdrawal_paid") return -amount;
  if (type === "adjustment") return amount;
  return 0;
}

export function hasExternalPayoutEvidence(withdrawal = {}) {
  const adminNote = String(withdrawal.admin_note || "").trim();
  const partnerNote = String(withdrawal.partner_note || "").trim();
  const paymentProof = String(withdrawal.payment_proof || "").trim();
  const combined = `${adminNote} ${partnerNote}`.trim();

  if (TX_HASH_PATTERN.test(combined)) {
    return { hasEvidence: true, reason: "transaction_hash_in_notes" };
  }

  if (paymentProof && paymentProof.startsWith("data:image/") && paymentProof.length > 500) {
    return { hasEvidence: true, reason: "payment_proof_attached" };
  }

  if (/mainnet|trc20|erc20|bsc|confirmed on chain|block explorer/i.test(combined)) {
    return { hasEvidence: true, reason: "mainnet_reference_in_notes" };
  }

  return { hasEvidence: false, reason: null };
}

export function isTestWalletAddress(wallet = "") {
  const normalized = String(wallet || "").trim();
  if (!normalized) return true;
  return TEST_WALLET_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function findLedgerLinksToCommission(ledgerEntries = [], commissionId) {
  const normalized = String(commissionId || "").trim();
  return (ledgerEntries || []).filter(
    (entry) =>
      String(entry.reference_type || "") === "commission" &&
      String(entry.reference_id || "") === normalized
  );
}

export function findLedgerLinksToWithdrawal(ledgerEntries = [], withdrawalId) {
  const normalized = String(withdrawalId || "").trim();
  return (ledgerEntries || []).filter(
    (entry) =>
      String(entry.reference_type || "") === "withdrawal" &&
      String(entry.reference_id || "") === normalized
  );
}

export function inferWithdrawalCommissionLink({
  commission = {},
  commissionLedgerEntries = [],
  withdrawal = {},
  withdrawalLedgerEntries = [],
} = {}) {
  const releaseEntries = commissionLedgerEntries.filter((entry) => entry.type === "commission_release");
  const paidEntries = withdrawalLedgerEntries.filter((entry) => entry.type === "withdrawal_paid");
  const commissionAmount = Number(commission.amount || 0);
  const withdrawalAmount = Number(withdrawal.amount || 0);

  if (!releaseEntries.length || !paidEntries.length) {
    return {
      linked: false,
      confidence: "none",
      reason: "missing_commission_release_or_withdrawal_paid_ledger",
    };
  }

  const releaseAt = releaseEntries.map((entry) => entry.created_at).sort()[0];
  const paidAt = paidEntries.map((entry) => entry.created_at).sort().slice(-1)[0];

  if (commissionAmount !== withdrawalAmount) {
    return {
      linked: false,
      confidence: "low",
      reason: "amount_mismatch",
      commissionAmount,
      withdrawalAmount,
    };
  }

  if (releaseAt && paidAt && paidAt >= releaseAt) {
    return {
      linked: true,
      confidence: "high",
      reason: "ledger_chain_amount_match_timeline",
      releaseAt,
      paidAt,
    };
  }

  return {
    linked: false,
    confidence: "low",
    reason: "timeline_inconsistent",
    releaseAt,
    paidAt,
  };
}

export function isTestSettlementContext({ partnerProfile = {}, subscriptionRow = null, withdrawal = {} } = {}) {
  if (isTestPartnerEmail(partnerProfile.email)) return true;
  if (isTestPartnerEmail(subscriptionRow?.user_email)) return true;
  if (/e2e|test|prod-e2e/i.test(String(subscriptionRow?.username || ""))) return true;
  if (/e2e|test|simulation/i.test(String(withdrawal.admin_note || ""))) return true;
  if (/e2e|test|simulation/i.test(String(withdrawal.partner_note || ""))) return true;
  return false;
}

export function classifyWithdrawal({
  withdrawal = {},
  partnerProfile = {},
  subscriptionRow = null,
  commission = {},
  commissionLedgerEntries = [],
  partnerLedgerEntries = [],
} = {}) {
  const status = String(withdrawal.status || "").trim();
  const withdrawalLedgerEntries = findLedgerLinksToWithdrawal(partnerLedgerEntries, withdrawal.id);
  const link = inferWithdrawalCommissionLink({
    commission,
    commissionLedgerEntries,
    withdrawal,
    withdrawalLedgerEntries,
  });
  const external = hasExternalPayoutEvidence(withdrawal);
  const testContext = isTestSettlementContext({ partnerProfile, subscriptionRow, withdrawal });
  const testWallet = isTestWalletAddress(withdrawal.wallet_address);

  if (["pending", "approved"].includes(status)) {
    return {
      classification: FINANCIAL_CLASSIFICATIONS.PENDING_OR_REJECTED,
      link,
      externalPayoutEvidence: external,
      rationale: "Withdrawal not paid yet",
    };
  }

  if (status === "rejected") {
    return {
      classification: FINANCIAL_CLASSIFICATIONS.PENDING_OR_REJECTED,
      link,
      externalPayoutEvidence: external,
      rationale: "Withdrawal rejected; no payout",
    };
  }

  if (status !== "paid") {
    return {
      classification: FINANCIAL_CLASSIFICATIONS.NEEDS_MANUAL_REVIEW,
      link,
      externalPayoutEvidence: external,
      rationale: `Unexpected withdrawal status: ${status}`,
    };
  }

  if (external.hasEvidence) {
    return {
      classification: FINANCIAL_CLASSIFICATIONS.REAL_EXTERNAL_PAYOUT,
      link,
      externalPayoutEvidence: external,
      rationale: external.reason,
    };
  }

  if (link.linked && link.confidence === "high" && testContext) {
    return {
      classification: FINANCIAL_CLASSIFICATIONS.TEST_WITHDRAWAL_COMPLETED,
      link,
      externalPayoutEvidence: external,
      rationale: "Paid test-context withdrawal with ledger chain and no external tx evidence",
    };
  }

  if (testContext && !external.hasEvidence) {
    return {
      classification: FINANCIAL_CLASSIFICATIONS.TEST_WITHDRAWAL_COMPLETED,
      link,
      externalPayoutEvidence: external,
      rationale: "Paid withdrawal in E2E/test context without external payout evidence",
    };
  }

  if (!link.linked) {
    return {
      classification: FINANCIAL_CLASSIFICATIONS.AGGREGATE_ONLY_NO_DIRECT_LINK,
      link,
      externalPayoutEvidence: external,
      rationale: "Paid withdrawal exists but no provable ledger chain to this commission",
    };
  }

  return {
    classification: FINANCIAL_CLASSIFICATIONS.NEEDS_MANUAL_REVIEW,
    link,
    externalPayoutEvidence: external,
    rationale: "Insufficient evidence for automatic classification",
  };
}

export function describeBalanceSources() {
  return {
    balanceWithdrawable: {
      storage: "partners.balance_withdrawable",
      mutators: [
        "releaseCommissionToWithdrawable (partner-commission-engine.js)",
        "rejectCommission (partner-commission-engine.js)",
        "markCommissionPaidIfNeeded (partner-commission-engine.js)",
        "markPartnerWithdrawalPaid (partner-admin-server.js)",
        "partner tier bonus automation (partner-automation.js)",
      ],
      notComputedFromView: true,
    },
    balancePending: {
      storage: "partners.balance_pending",
      mutators: ["commission creation/approval flows in partner-commission-engine.js"],
      notComputedFromView: true,
    },
    totalEarnings: {
      storage: "partners.total_earnings",
      mutators: ["commission creation", "rejectCommission reduction"],
      dashboardRpc: "partner_analytics_summary also reports totalCommissions/totalEarnings via RPC",
    },
    totalWithdrawn: {
      storage: "partners.total_withdrawn",
      mutators: ["markPartnerWithdrawalPaid only — incremented by paid withdrawal amount"],
      important:
        "Aggregate column only; does NOT store per-commission withdrawal mapping",
    },
    partnerWalletLedger: {
      storage: "partner_wallet_ledger",
      role: "Audit trail with balance_before/balance_after snapshots per event",
      types: ["commission_release", "withdrawal_request", "withdrawal_paid", "withdrawal_rejected", "adjustment"],
    },
    partnerAnalytics: {
      source: "RPC partner_analytics_summary / partner_analytics_charts",
      note: "Dashboard stats; balances ultimately sourced from partners table + commission aggregates",
    },
  };
}

export function rebuildPartnerBalancesFromSources({
  partner = {},
  commissions = [],
  ledgerEntries = [],
  withdrawals = [],
} = {}) {
  const stored = {
    balanceWithdrawable: Number(partner.balance_withdrawable || 0),
    balancePending: Number(partner.balance_pending || 0),
    totalEarnings: Number(partner.total_earnings || 0),
    totalWithdrawn: Number(partner.total_withdrawn || 0),
  };

  const activeCommissions = (commissions || []).filter((row) => row.status !== "rejected");
  const withdrawableFromCommissions = activeCommissions
    .filter((row) => row.status === "withdrawable" || row.is_withdrawable)
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const pendingFromCommissions = activeCommissions
    .filter((row) => ["pending", "pending_activation", "approved"].includes(String(row.status || "")))
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const earningsFromCommissions = activeCommissions.reduce(
    (sum, row) => sum + Number(row.amount || 0),
    0
  );

  const paidWithdrawals = (withdrawals || []).filter((row) => row.status === "paid");
  const totalWithdrawnFromWithdrawals = paidWithdrawals.reduce(
    (sum, row) => sum + Number(row.amount || 0),
    0
  );

  const sortedLedger = [...(ledgerEntries || [])].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const latestLedgerBalance =
    sortedLedger.length > 0
      ? Number(sortedLedger[sortedLedger.length - 1].balance_after || 0)
      : null;

  const impliedWithdrawable =
    withdrawableFromCommissions - totalWithdrawnFromWithdrawals;

  return {
    stored,
    computed: {
      withdrawableFromCommissions,
      pendingFromCommissions,
      earningsFromCommissions,
      totalWithdrawnFromWithdrawals,
      latestLedgerBalance,
      impliedWithdrawableAfterPaidWithdrawals: impliedWithdrawable,
    },
    consistency: {
      totalWithdrawnMatchesPaidWithdrawals:
        Math.abs(stored.totalWithdrawn - totalWithdrawnFromWithdrawals) < 0.01,
      ledgerMatchesStoredWithdrawable:
        latestLedgerBalance == null
          ? null
          : Math.abs(latestLedgerBalance - stored.balanceWithdrawable) < 0.01,
      aggregateImpliesCommissionWithdrawn:
        stored.totalWithdrawn >= Number(commissions.find((c) => c)?.amount || 0) &&
        stored.balanceWithdrawable === 0,
    },
  };
}

export function assessPreviousWithdrawnBlocker({
  commission = {},
  partner = {},
  commissionLedgerEntries = [],
  partnerLedgerEntries = [],
  withdrawals = [],
  partnerProfile = {},
} = {}) {
  const amount = Number(commission.amount || 0);
  const storedWithdrawn = Number(partner.total_withdrawn || 0);
  const storedWithdrawable = Number(partner.balance_withdrawable || 0);
  const aggregateInference =
    (commission.status === "withdrawable" || commission.is_withdrawable) &&
    storedWithdrawable < amount &&
    storedWithdrawn >= amount;

  const paidWithdrawals = (withdrawals || []).filter((w) => w.status === "paid");
  const linkedPaidWithdrawals = paidWithdrawals.filter((withdrawal) => {
    const withdrawalLedger = findLedgerLinksToWithdrawal(partnerLedgerEntries, withdrawal.id);
    const link = inferWithdrawalCommissionLink({
      commission,
      commissionLedgerEntries,
      withdrawal,
      withdrawalLedgerEntries: withdrawalLedger,
    });
    return link.linked;
  });

  return {
    previousBlockerCode: "COMMISSION_ALREADY_WITHDRAWN",
    wasAggregateInferenceOnly: aggregateInference && linkedPaidWithdrawals.length === 0,
    aggregateInference,
    directLedgerProof: linkedPaidWithdrawals.length > 0,
    linkedPaidWithdrawalIds: linkedPaidWithdrawals.map((row) => row.id),
    note:
      aggregateInference && linkedPaidWithdrawals.length === 0
        ? "Previous cleanup blocker used total_withdrawn aggregate without direct commission link"
        : linkedPaidWithdrawals.length > 0
          ? "Direct ledger/timeline link supports withdrawn classification"
          : "Insufficient proof that this specific commission was withdrawn",
  };
}

export function proposeSettlementActions({
  classification,
  commission = {},
  partner = {},
  linkedWithdrawals = [],
  balanceRebuild = {},
} = {}) {
  const amount = Number(commission.amount || 0);
  const actions = [];
  let blocker = null;
  let canSettleAutomatically = false;

  if (classification === FINANCIAL_CLASSIFICATIONS.REAL_EXTERNAL_PAYOUT) {
    blocker = "REAL_EXTERNAL_PAYOUT_BLOCKER";
    actions.push(
      "Do not reverse financial records or delete ledger/withdrawals",
      "Keep commission/withdrawal audit trail intact",
      "Only delete test subscription/payment-proof artifacts if references allow without touching paid ledger"
    );
    return { actions, blocker, canSettleAutomatically: false };
  }

  if (classification === FINANCIAL_CLASSIFICATIONS.PENDING_OR_REJECTED) {
    canSettleAutomatically = true;
    actions.push(
      `rejectCommission(${commission.id}) via partner-commission-engine.js`,
      "Delete commission_release ledger row after commission rejected",
      "Verify partners.total_earnings and balance columns match recomputed values",
      "Then allow test subscription cleanup"
    );
    return { actions, blocker: null, canSettleAutomatically: true };
  }

  if (classification === FINANCIAL_CLASSIFICATIONS.TEST_WITHDRAWAL_COMPLETED) {
    canSettleAutomatically = true;
    actions.push(
      "Keep withdrawal row for audit; do not hard-delete initially",
      `Create ADJUSTMENT ledger entry (+${amount}) or documented admin reversal workflow if added later`,
      "Optionally mark paid test withdrawal as reversed in admin_note metadata (no schema change now)",
      `rejectCommission(${commission.id}) to zero commission impact`,
      "Recalculate partners.balance_withdrawable, total_earnings, total_withdrawn to net $0 test effect",
      "Verify ledger chain + partner balances",
      "Then allow subscription/payment-proof cleanup"
    );
    return { actions, blocker: null, canSettleAutomatically: true };
  }

  if (classification === FINANCIAL_CLASSIFICATIONS.AGGREGATE_ONLY_NO_DIRECT_LINK) {
    blocker = "REBUILD_REQUIRED";
    actions.push(
      "Rebuild partner balances from partner_commissions + partner_withdrawals + partner_wallet_ledger",
      "Do not treat total_withdrawn alone as proof this commission was withdrawn",
      `If rebuild shows unused withdrawable ${amount}, rejectCommission(${commission.id}) safely`,
      "If rebuild still ambiguous, manual review before cleanup"
    );
    return {
      actions,
      blocker,
      canSettleAutomatically: balanceRebuild.consistency?.ledgerMatchesStoredWithdrawable === true,
    };
  }

  blocker = "NEEDS_MANUAL_REVIEW";
  actions.push("Manual finance review required before any settlement automation");
  return { actions, blocker, canSettleAutomatically: false };
}

export function expectedBalancesAfterE2ESettlement(partner = {}, commission = {}) {
  const amount = Number(commission.amount || 0);
  return {
    balanceWithdrawable: Math.max(0, Number(partner.balance_withdrawable || 0)),
    balancePending: Number(partner.balance_pending || 0),
    totalEarnings: Math.max(0, Number(partner.total_earnings || 0) - amount),
    totalWithdrawn: Math.max(0, Number(partner.total_withdrawn || 0) - amount),
    netTestEffect: 0,
  };
}

export function buildCommissionSettlementAudit({
  requestId,
  subscriptionRow = null,
  commission = null,
  partner = null,
  partnerProfile = null,
  commissionLedgerEntries = [],
  partnerLedgerEntries = [],
  withdrawals = [],
  balanceRebuild = null,
  previousBlockerAssessment = null,
}) {
  if (!commission?.id) {
    return {
      requestId,
      error: "COMMISSION_NOT_FOUND",
      financialClassification: FINANCIAL_CLASSIFICATIONS.NEEDS_MANUAL_REVIEW,
      canSettleAutomatically: false,
      blocker: "COMMISSION_NOT_FOUND",
    };
  }

  const withdrawalAudits = (withdrawals || []).map((withdrawal) => {
    const withdrawalLedgerEntries = findLedgerLinksToWithdrawal(partnerLedgerEntries, withdrawal.id);
    const classification = classifyWithdrawal({
      withdrawal,
      partnerProfile,
      subscriptionRow,
      commission,
      commissionLedgerEntries,
      partnerLedgerEntries,
    });
    return {
      withdrawalId: withdrawal.id,
      amount: Number(withdrawal.amount || 0),
      currency: withdrawal.currency,
      status: withdrawal.status,
      requestedAt: withdrawal.created_at,
      approvedAt: withdrawal.approved_at || null,
      paidAt: withdrawal.paid_at || null,
      rejectedAt: withdrawal.rejected_at || null,
      network: withdrawal.network,
      walletAddress: withdrawal.wallet_address,
      adminNote: withdrawal.admin_note,
      partnerNote: withdrawal.partner_note,
      paymentProofPresent: Boolean(withdrawal.payment_proof),
      metadata: {
        hasDirectCommissionLink: classification.link?.linked || false,
        linkConfidence: classification.link?.confidence || "none",
        linkReason: classification.link?.reason || null,
      },
      ledgerEntryIds: withdrawalLedgerEntries.map((entry) => entry.id),
      classification: classification.classification,
      externalPayoutEvidence: classification.externalPayoutEvidence,
      rationale: classification.rationale,
    };
  });

  const paidWithdrawals = withdrawalAudits.filter((row) => row.status === "paid");
  const primaryPaid = paidWithdrawals.find((row) => row.metadata.hasDirectCommissionLink) || paidWithdrawals[0] || null;
  const financialClassification =
    primaryPaid?.classification ||
    (commission.status === "withdrawable" && Number(partner?.total_withdrawn || 0) >= Number(commission.amount || 0)
      ? FINANCIAL_CLASSIFICATIONS.AGGREGATE_ONLY_NO_DIRECT_LINK
      : FINANCIAL_CLASSIFICATIONS.PENDING_OR_REJECTED);

  const settlement = proposeSettlementActions({
    classification: financialClassification,
    commission,
    partner,
    linkedWithdrawals: paidWithdrawals,
    balanceRebuild,
  });

  return {
    requestId,
    subscription: subscriptionRow
      ? {
          id: subscriptionRow.id,
          userEmail: subscriptionRow.user_email,
          username: subscriptionRow.username,
          status: subscriptionRow.status,
        }
      : null,
    commission: {
      commissionId: commission.id,
      requestId: commission.subscription_id || commission.source_ref,
      partnerId: commission.partner_id,
      referredUserId: commission.user_id,
      amount: Number(commission.amount || 0),
      currency: commission.currency,
      status: commission.status,
      createdAt: commission.created_at,
      approvedAt: commission.updated_at || null,
      withdrawableAt: commission.status === "withdrawable" ? commission.updated_at || commission.created_at : null,
      paidAt: commission.status === "paid" ? commission.updated_at || null : null,
      sourceRef: commission.source_ref,
      subscriptionId: commission.subscription_id,
      serviceType: commission.service_type,
    },
    linkedLedgerIds: commissionLedgerEntries.map((entry) => entry.id),
    ledgerEntries: commissionLedgerEntries.map((entry) => ({
      ledgerEntryId: entry.id,
      entryType: entry.type,
      amount: Number(entry.amount || 0),
      signedAmount: signedLedgerAmount(entry),
      balanceBefore: Number(entry.balance_before || 0),
      balanceAfter: Number(entry.balance_after || 0),
      status: entry.type,
      referenceType: entry.reference_type,
      referenceId: entry.reference_id,
      metadata: { note: entry.note || null },
      createdAt: entry.created_at,
    })),
    withdrawals: withdrawalAudits,
    linkedWithdrawalIds: paidWithdrawals.map((row) => row.withdrawalId),
    externalPayoutEvidence: primaryPaid?.externalPayoutEvidence || { hasEvidence: false, reason: null },
    financialClassification,
    currentPartnerBalances: {
      partnerId: partner?.id || commission.partner_id,
      partnerEmail: partnerProfile?.email || null,
      balanceWithdrawable: Number(partner?.balance_withdrawable || 0),
      balancePending: Number(partner?.balance_pending || 0),
      totalEarnings: Number(partner?.total_earnings || 0),
      totalWithdrawn: Number(partner?.total_withdrawn || 0),
    },
    expectedBalancesAfterSettlement:
      financialClassification === FINANCIAL_CLASSIFICATIONS.TEST_WITHDRAWAL_COMPLETED
        ? expectedBalancesAfterE2ESettlement(partner, commission)
        : null,
    balanceRebuild,
    previousBlockerAssessment,
    proposedSettlementActions: settlement.actions,
    blocker: settlement.blocker,
    canSettleAutomatically: settlement.canSettleAutomatically,
    dryRun: true,
  };
}

export function buildSettlementAuditPlan(audits = []) {
  const blockers = audits.flatMap((audit) => {
    const entries = [];
    if (audit.blocker) entries.push({ requestId: audit.requestId, code: audit.blocker });
    if (audit.previousBlockerAssessment?.wasAggregateInferenceOnly) {
      entries.push({
        requestId: audit.requestId,
        code: "PREVIOUS_BLOCKER_WAS_AGGREGATE_INFERENCE",
      });
    }
    return entries;
  });

  return {
    dryRun: true,
    executeSupported: false,
    audits,
    balanceSources: describeBalanceSources(),
    centralLogic: describeCentralFinancialLogic(),
    canSettleAllAutomatically: audits.every((audit) => audit.canSettleAutomatically),
    blockers,
  };
}

export function describeCentralFinancialLogic() {
  return {
    approveWithdrawal: {
      file: "lib/partner-admin-server.js",
      function: "approvePartnerWithdrawal",
      effect: "status pending→approved; no balance change",
    },
    markWithdrawalPaid: {
      file: "lib/partner-admin-server.js",
      function: "markPartnerWithdrawalPaid",
      effect:
        "decrements partners.balance_withdrawable, increments partners.total_withdrawn, writes withdrawal_paid ledger",
      reversesCompletedWithdrawal: false,
    },
    rejectWithdrawal: {
      file: "lib/partner-admin-server.js",
      function: "rejectPartnerWithdrawal",
      effect: "status→rejected, withdrawal_rejected ledger (balance unchanged)",
    },
    rejectCommission: {
      file: "lib/partner-commission-engine.js",
      function: "rejectCommission",
      effect: "commission→rejected, reduces balance_pending or balance_withdrawable and total_earnings",
      idempotent: false,
    },
    releaseCommission: {
      file: "lib/partner-commission-engine.js",
      function: "releaseCommissionToWithdrawable",
      effect: "pending→withdrawable, writes commission_release ledger",
    },
    markCommissionPaid: {
      file: "lib/partner-commission-engine.js",
      function: "markCommissionPaidIfNeeded",
      effect: "withdrawable→paid, reduces balance_withdrawable only (does not increment total_withdrawn)",
    },
    ledgerAdjustment: {
      exists: true,
      file: "lib/partner-wallet.js",
      type: "adjustment",
      note: "recordPartnerWalletLedger supports ADJUSTMENT but no dedicated public reverse-withdrawal helper",
    },
    rebuildBalances: {
      exists: false,
      note: "No rebuildPartnerBalancesFromLedger utility in codebase",
    },
    auditLogging: {
      file: "lib/partner-monitoring.js",
      function: "writePartnerAuditLog",
      events: ["withdrawal.requested", "withdrawal.paid"],
    },
    cleanupBlocker: {
      file: "lib/cleanup-test-payment-proof-data.js",
      function: "previewCommissionReversal",
      rule: "COMMISSION_ALREADY_WITHDRAWN when withdrawable + balance_withdrawable<amount + total_withdrawn>=amount",
      limitation: "Uses aggregate partners.total_withdrawn; does not trace ledger linkage",
    },
  };
}

export function formatSettlementAuditSummary(plan = {}) {
  return {
    dryRun: plan.dryRun,
    canSettleAllAutomatically: plan.canSettleAllAutomatically,
    blockers: plan.blockers,
    audits: (plan.audits || []).map((audit) => ({
      requestId: audit.requestId,
      commissionId: audit.commission?.commissionId || null,
      partnerId: audit.commission?.partnerId || null,
      partnerEmail: audit.currentPartnerBalances?.partnerEmail || null,
      subscriptionEmail: audit.subscription?.userEmail || null,
      financialClassification: audit.financialClassification,
      linkedWithdrawalIds: audit.linkedWithdrawalIds,
      linkedLedgerIds: audit.linkedLedgerIds,
      externalPayoutEvidence: audit.externalPayoutEvidence,
      currentPartnerBalances: audit.currentPartnerBalances,
      expectedBalancesAfterSettlement: audit.expectedBalancesAfterSettlement,
      balanceRebuild: audit.balanceRebuild,
      previousBlockerAssessment: audit.previousBlockerAssessment,
      commission: audit.commission,
      withdrawals: (audit.withdrawals || []).map((row) => ({
        withdrawalId: row.withdrawalId,
        amount: row.amount,
        status: row.status,
        paidAt: row.paidAt,
        classification: row.classification,
        hasDirectCommissionLink: row.metadata?.hasDirectCommissionLink,
        linkReason: row.metadata?.linkReason,
        walletAddress: row.walletAddress,
        adminNote: row.adminNote,
        paymentProofPresent: row.paymentProofPresent,
      })),
      ledgerEntries: audit.ledgerEntries,
      proposedSettlementActions: audit.proposedSettlementActions,
      blocker: audit.blocker,
      canSettleAutomatically: audit.canSettleAutomatically,
    })),
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

export async function runFinancialSettlementAudit(supabase, { requestIds = [] } = {}) {
  const ids = assertSettlementRequestIds(requestIds);
  const audits = [];

  const { data: subscriptions, error: subscriptionError } = await supabase
    .from("subscription_requests")
    .select("id,user_email,username,status")
    .in("id", ids);
  if (subscriptionError) throw subscriptionError;

  const subscriptionById = new Map((subscriptions || []).map((row) => [Number(row.id), row]));

  const { data: commissions, error: commissionError } = await supabase
    .from("partner_commissions")
    .select(COMMISSION_COLUMNS)
    .in("subscription_id", ids.map(String));
  if (commissionError) throw commissionError;

  const commissionByRequest = new Map(
    (commissions || []).map((row) => [Number(row.subscription_id), row])
  );

  for (const requestId of ids) {
    const subscriptionRow = subscriptionById.get(requestId) || null;
    const commission = commissionByRequest.get(requestId) || null;

    if (!commission) {
      audits.push({
        requestId,
        error: "COMMISSION_NOT_FOUND_FOR_REQUEST",
        financialClassification: FINANCIAL_CLASSIFICATIONS.NEEDS_MANUAL_REVIEW,
        canSettleAutomatically: false,
        blocker: "COMMISSION_NOT_FOUND_FOR_REQUEST",
      });
      continue;
    }

    const { data: partner, error: partnerError } = await supabase
      .from("partners")
      .select(
        "id,user_id,balance_withdrawable,balance_pending,balance_bonus_pending,total_earnings,total_withdrawn"
      )
      .eq("id", commission.partner_id)
      .single();
    if (partnerError) throw partnerError;

    const partnerProfile = await fetchPartnerProfile(supabase, partner);

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
      .order("created_at", { ascending: true })
      .limit(500);
    if (partnerLedgerError) throw partnerLedgerError;

    const { data: withdrawals, error: withdrawalError } = await supabase
      .from("partner_withdrawals")
      .select(PARTNER_WITHDRAWAL_COLUMNS)
      .eq("partner_id", commission.partner_id)
      .order("created_at", { ascending: true });
    if (withdrawalError) throw withdrawalError;

    const { data: partnerCommissions, error: allCommissionError } = await supabase
      .from("partner_commissions")
      .select(COMMISSION_COLUMNS)
      .eq("partner_id", commission.partner_id);
    if (allCommissionError) throw allCommissionError;

    const balanceRebuild = rebuildPartnerBalancesFromSources({
      partner,
      commissions: partnerCommissions || [],
      ledgerEntries: partnerLedgerEntries || [],
      withdrawals: withdrawals || [],
    });

    const previousBlockerAssessment = assessPreviousWithdrawnBlocker({
      commission,
      partner,
      commissionLedgerEntries: commissionLedgerEntries || [],
      partnerLedgerEntries: partnerLedgerEntries || [],
      withdrawals: withdrawals || [],
      partnerProfile,
    });

    audits.push(
      buildCommissionSettlementAudit({
        requestId,
        subscriptionRow,
        commission,
        partner,
        partnerProfile,
        commissionLedgerEntries: commissionLedgerEntries || [],
        partnerLedgerEntries: partnerLedgerEntries || [],
        withdrawals: withdrawals || [],
        balanceRebuild,
        previousBlockerAssessment,
      })
    );
  }

  return buildSettlementAuditPlan(audits);
}
