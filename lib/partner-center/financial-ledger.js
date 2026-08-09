import {
  LEDGER_BALANCE_BUCKETS,
  LEDGER_ENTRY_DIRECTIONS,
  LEDGER_ENTRY_TYPES,
  LEDGER_LIFECYCLE_STATUSES,
  PARTNER_EVENT_TYPES,
} from "./constants.js";
import { buildPartnerEventIdempotencyKey, recordPartnerEvent } from "./event-model.js";
import { assertPositiveMoney, roundMoney, sumLedgerBucket } from "./money.js";
import { logPartnerCenterEvent, logPartnerCenterFailure } from "./observability.js";

export function buildLedgerIdempotencyKey(parts = []) {
  return ["ledger", ...parts.map((part) => String(part || "").trim())].filter(Boolean).join(":");
}

export async function appendFinancialLedgerEntry(
  supabase,
  {
    partnerId,
    entryType,
    entryDirection,
    amount,
    currency = "USD",
    balanceBucket,
    lifecycleStatus = LEDGER_LIFECYCLE_STATUSES.PENDING,
    partnerEventId = null,
    referenceType = null,
    referenceId = null,
    legacyCommissionId = null,
    legacyWithdrawalId = null,
    reversesEntryId = null,
    idempotencyKey,
    createdBy = null,
    metadata = {},
  }
) {
  const normalizedKey = String(idempotencyKey || "").trim();
  const normalizedAmount = assertPositiveMoney(amount);

  if (!partnerId || !entryType || !entryDirection || !balanceBucket || !normalizedKey) {
    throw new Error("INVALID_LEDGER_ENTRY");
  }

  const row = {
    partner_id: partnerId,
    entry_type: entryType,
    entry_direction: entryDirection,
    lifecycle_status: lifecycleStatus,
    amount: normalizedAmount,
    currency,
    balance_bucket: balanceBucket,
    partner_event_id: partnerEventId,
    reference_type: referenceType,
    reference_id: referenceId ? String(referenceId) : null,
    legacy_commission_id: legacyCommissionId,
    legacy_withdrawal_id: legacyWithdrawalId,
    reverses_entry_id: reversesEntryId,
    idempotency_key: normalizedKey,
    created_by: createdBy,
    metadata: metadata || {},
  };

  const { data, error } = await supabase
    .from("partner_financial_ledger_entries")
    .insert(row)
    .select("id, entry_type, entry_direction, amount, balance_bucket, lifecycle_status, idempotency_key")
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: existing } = await supabase
        .from("partner_financial_ledger_entries")
        .select("id, entry_type, amount, balance_bucket, lifecycle_status")
        .eq("idempotency_key", normalizedKey)
        .maybeSingle();

      logPartnerCenterEvent("ledger.duplicate_rejected", {
        partnerId,
        idempotencyKey: normalizedKey,
        existingEntryId: existing?.id || null,
      });

      return { appended: false, duplicate: true, entry: existing };
    }

    logPartnerCenterFailure("ledger.insert_failed", {
      partnerId,
      entryType,
      reason: error.message,
    });
    throw error;
  }

  logPartnerCenterEvent("ledger.entry_appended", {
    partnerId,
    entryId: data.id,
    entryType,
    amount: normalizedAmount,
    balanceBucket,
  });

  return { appended: true, duplicate: false, entry: data };
}

export async function recordCommissionLedgerCredit(
  supabase,
  {
    partnerId,
    commissionId,
    amount,
    lifecycleStatus = LEDGER_LIFECYCLE_STATUSES.PENDING,
    balanceBucket = LEDGER_BALANCE_BUCKETS.PENDING,
    partnerEventId = null,
    metadata = {},
  }
) {
  const normalizedAmount = assertPositiveMoney(amount);
  const idempotencyKey = buildLedgerIdempotencyKey([
    LEDGER_ENTRY_TYPES.COMMISSION,
    "credit",
    commissionId,
  ]);

  const ledgerResult = await appendFinancialLedgerEntry(supabase, {
    partnerId,
    entryType: LEDGER_ENTRY_TYPES.COMMISSION,
    entryDirection: LEDGER_ENTRY_DIRECTIONS.CREDIT,
    amount: normalizedAmount,
    balanceBucket,
    lifecycleStatus,
    partnerEventId,
    referenceType: "commission",
    referenceId: commissionId,
    legacyCommissionId: commissionId,
    idempotencyKey,
    metadata,
  });

  if (!ledgerResult.duplicate) {
    await recordPartnerEvent(supabase, {
      eventType: PARTNER_EVENT_TYPES.COMMISSION_CREATED,
      idempotencyKey: buildPartnerEventIdempotencyKey(PARTNER_EVENT_TYPES.COMMISSION_CREATED, [
        commissionId,
      ]),
      partnerId,
      payload: {
        commissionId,
        amount: normalizedAmount,
        ledgerEntryId: ledgerResult.entry?.id || null,
      },
    });
  }

  return ledgerResult;
}

export async function recordCommissionReleaseLedgerMove(
  supabase,
  { partnerId, commissionId, amount, partnerEventId = null }
) {
  const normalizedAmount = assertPositiveMoney(amount);

  const debitPending = await appendFinancialLedgerEntry(supabase, {
    partnerId,
    entryType: LEDGER_ENTRY_TYPES.COMMISSION,
    entryDirection: LEDGER_ENTRY_DIRECTIONS.DEBIT,
    amount: normalizedAmount,
    balanceBucket: LEDGER_BALANCE_BUCKETS.PENDING,
    lifecycleStatus: LEDGER_LIFECYCLE_STATUSES.PAYABLE,
    partnerEventId,
    referenceType: "commission_release",
    referenceId: commissionId,
    legacyCommissionId: commissionId,
    idempotencyKey: buildLedgerIdempotencyKey(["release", "debit_pending", commissionId]),
    metadata: { phase: "release_from_pending" },
  });

  const creditWithdrawable = await appendFinancialLedgerEntry(supabase, {
    partnerId,
    entryType: LEDGER_ENTRY_TYPES.COMMISSION,
    entryDirection: LEDGER_ENTRY_DIRECTIONS.CREDIT,
    amount: normalizedAmount,
    balanceBucket: LEDGER_BALANCE_BUCKETS.WITHDRAWABLE,
    lifecycleStatus: LEDGER_LIFECYCLE_STATUSES.PAYABLE,
    partnerEventId,
    referenceType: "commission_release",
    referenceId: commissionId,
    legacyCommissionId: commissionId,
    idempotencyKey: buildLedgerIdempotencyKey(["release", "credit_withdrawable", commissionId]),
    metadata: { phase: "release_to_withdrawable" },
  });

  return { debitPending, creditWithdrawable };
}

export async function recordFinancialReversalEntry(
  supabase,
  {
    partnerId,
    originalEntryId,
    amount,
    balanceBucket,
    reason,
    createdBy = null,
    partnerEventId = null,
  }
) {
  const normalizedAmount = assertPositiveMoney(amount);
  const idempotencyKey = buildLedgerIdempotencyKey(["reversal", originalEntryId]);

  return appendFinancialLedgerEntry(supabase, {
    partnerId,
    entryType: LEDGER_ENTRY_TYPES.REVERSAL,
    entryDirection: LEDGER_ENTRY_DIRECTIONS.DEBIT,
    amount: normalizedAmount,
    balanceBucket,
    lifecycleStatus: LEDGER_LIFECYCLE_STATUSES.REVERSED,
    reversesEntryId: originalEntryId,
    partnerEventId,
    referenceType: "reversal",
    referenceId: originalEntryId,
    idempotencyKey,
    createdBy,
    metadata: { reason: reason || "reversal" },
  });
}

export async function derivePartnerBucketBalances(supabase, partnerId) {
  const { data, error } = await supabase
    .from("partner_financial_ledger_entries")
    .select("entry_direction, amount, balance_bucket, lifecycle_status")
    .eq("partner_id", partnerId);

  if (error) {
    throw error;
  }

  return {
    pending: sumLedgerBucket(data || [], LEDGER_BALANCE_BUCKETS.PENDING),
    withdrawable: sumLedgerBucket(data || [], LEDGER_BALANCE_BUCKETS.WITHDRAWABLE),
    bonusPending: sumLedgerBucket(data || [], LEDGER_BALANCE_BUCKETS.BONUS_PENDING),
    paidOut: sumLedgerBucket(data || [], LEDGER_BALANCE_BUCKETS.PAID_OUT),
    earningsTotal: sumLedgerBucket(data || [], LEDGER_BALANCE_BUCKETS.EARNINGS_TOTAL),
  };
}

export async function reconcilePartnerLegacyBalances(supabase, partnerId) {
  const { data: partner, error: partnerError } = await supabase
    .from("partners")
    .select("balance_pending, balance_withdrawable, balance_bonus_pending, total_earnings, total_withdrawn")
    .eq("id", partnerId)
    .single();

  if (partnerError) {
    throw partnerError;
  }

  const derived = await derivePartnerBucketBalances(supabase, partnerId);

  return {
    partnerId,
    legacy: {
      pending: roundMoney(partner.balance_pending),
      withdrawable: roundMoney(partner.balance_withdrawable),
      bonusPending: roundMoney(partner.balance_bonus_pending),
      earningsTotal: roundMoney(partner.total_earnings),
      paidOut: roundMoney(partner.total_withdrawn),
    },
    derived,
    matched:
      roundMoney(partner.balance_pending) === derived.pending &&
      roundMoney(partner.balance_withdrawable) === derived.withdrawable,
  };
}
