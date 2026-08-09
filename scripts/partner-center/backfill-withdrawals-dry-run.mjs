#!/usr/bin/env node
/**
 * Historical partner_withdrawals (paid) backfill — DRY RUN only.
 */
import { createPartnerTestDb, query } from "./test-db.mjs";

export function buildWithdrawalBackfillIdempotencyKey(withdrawalId) {
  return `legacy_withdrawal:${withdrawalId}`;
}

export function classifyLegacyWithdrawal(withdrawal, existingLedger) {
  const idempotencyKey = buildWithdrawalBackfillIdempotencyKey(withdrawal.id);

  if (existingLedger) {
    const ledgerAmount = Number(existingLedger.amount || 0);
    const legacyAmount = Number(withdrawal.amount || 0);
    if (Math.abs(ledgerAmount - legacyAmount) > 0.001) {
      return { status: "CONFLICT", reason: "amount_mismatch", idempotencyKey };
    }
    return { status: "ALREADY_MAPPED", idempotencyKey, ledgerEntryId: existingLedger.id };
  }

  if (!withdrawal.partner_id || !withdrawal.id) {
    return { status: "INVALID", reason: "missing_ids", idempotencyKey };
  }

  if (withdrawal.status !== "paid") {
    return { status: "AMBIGUOUS", reason: "not_paid_status", idempotencyKey };
  }

  if (withdrawal.amount == null || Number(withdrawal.amount) <= 0) {
    return { status: "INVALID", reason: "invalid_amount", idempotencyKey };
  }

  return {
    status: "READY_TO_BACKFILL",
    idempotencyKey,
    suggestedRow: {
      entryType: "payout",
      entryDirection: "debit",
      balanceBucket: "withdrawable",
      lifecycleStatus: "paid",
      legacyWithdrawalId: withdrawal.id,
      metadata: {
        source: "legacy_backfill",
        legacy_withdrawal_id: withdrawal.id,
        original_status: withdrawal.status,
        original_created_at: withdrawal.created_at,
        paid_at: withdrawal.paid_at || null,
        backfill_version: "20260811",
      },
    },
  };
}

export async function dryRunBackfillWithdrawals(db) {
  const withdrawals = await query(db, `
    SELECT id, partner_id, amount, currency, status, created_at, paid_at
    FROM partner_withdrawals ORDER BY created_at ASC, id ASC
  `);

  const ledger = await query(db, `
    SELECT id, legacy_withdrawal_id, amount, idempotency_key
    FROM partner_financial_ledger_entries
    WHERE legacy_withdrawal_id IS NOT NULL
  `);

  const ledgerByWithdrawal = new Map(
    ledger.rows.map((row) => [String(row.legacy_withdrawal_id), row])
  );

  const report = {
    mode: "dry_run",
    total: withdrawals.rows.length,
    counts: { ALREADY_MAPPED: 0, READY_TO_BACKFILL: 0, INVALID: 0, AMBIGUOUS: 0, CONFLICT: 0 },
    items: [],
  };

  for (const withdrawal of withdrawals.rows) {
    const existing = ledgerByWithdrawal.get(String(withdrawal.id));
    const classification = classifyLegacyWithdrawal(withdrawal, existing);
    report.counts[classification.status] = (report.counts[classification.status] || 0) + 1;
    report.items.push({ withdrawalId: withdrawal.id, ...classification });
  }

  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--execute")) {
    console.error("ABORT: --execute not supported. Use backfill-withdrawals-execute.mjs when approved.");
    process.exit(2);
  }
  const db = await createPartnerTestDb();
  const report = await dryRunBackfillWithdrawals(db);
  console.log(JSON.stringify(report, null, 2));
  await db.close();
}
