#!/usr/bin/env node
/**
 * Unified historical backfill reconciliation simulation (PGlite).
 */
import { createPartnerTestDb, query } from "./test-db.mjs";
import {
  buildBackfillLedgerRow,
  classifyLegacyCommission,
} from "./backfill-commissions-dry-run.mjs";
import {
  buildWithdrawalBackfillIdempotencyKey,
  classifyLegacyWithdrawal,
} from "./backfill-withdrawals-dry-run.mjs";
import { sumLedgerBucket } from "../../lib/partner-center/money.js";

async function insertLedger(db, partnerId, row, amount, legacyCommissionId = null, legacyWithdrawalId = null, createdAt = null) {
  await query(db, `
    INSERT INTO partner_financial_ledger_entries (
      partner_id, entry_type, entry_direction, lifecycle_status, amount, currency,
      balance_bucket, legacy_commission_id, legacy_withdrawal_id, idempotency_key, metadata, created_at
    ) VALUES ($1,$2,$3,$4,$5,'USD',$6,$7,$8,$9,$10::jsonb, COALESCE($11, now()))
  `, [
    partnerId,
    row.entryType,
    row.entryDirection,
    row.lifecycleStatus,
    amount,
    row.balanceBucket,
    legacyCommissionId,
    legacyWithdrawalId,
    row.idempotencyKey || buildWithdrawalBackfillIdempotencyKey(legacyWithdrawalId),
    JSON.stringify(row.metadata || {}),
    createdAt,
  ]);
}

async function simulatePartner(db, partnerId, { openingWithdrawable = 0 } = {}) {
  if (openingWithdrawable > 0) {
    await insertLedger(db, partnerId, {
      entryType: "manual_adjustment",
      entryDirection: "credit",
      balanceBucket: "withdrawable",
      lifecycleStatus: "payable",
      metadata: { source: "legacy_opening_balance", evidence: "simulation_fixture" },
      idempotencyKey: `legacy_opening:${partnerId}`,
    }, openingWithdrawable);
  }

  const commissions = await query(db, `SELECT * FROM partner_commissions WHERE partner_id=$1`, [partnerId]);
  for (const c of commissions.rows) {
    const cls = classifyLegacyCommission(c, null);
    if (cls.status === "READY_TO_BACKFILL") {
      const row = buildBackfillLedgerRow(c);
      await insertLedger(db, partnerId, { ...row, idempotencyKey: cls.idempotencyKey }, c.amount, c.id, null, c.created_at);
    }
  }

  const withdrawals = await query(db, `SELECT * FROM partner_withdrawals WHERE partner_id=$1 AND status='paid'`, [partnerId]);
  for (const w of withdrawals.rows) {
    const cls = classifyLegacyWithdrawal(w, null);
    if (cls.status === "READY_TO_BACKFILL") {
      await insertLedger(db, partnerId, cls.suggestedRow, w.amount, null, w.id, w.paid_at || w.created_at);
    }
  }

  const partner = await query(db, `SELECT balance_pending, balance_bonus_pending, balance_withdrawable FROM partners WHERE id=$1`, [partnerId]);
  const ledger = await query(db, `SELECT entry_direction, amount, balance_bucket FROM partner_financial_ledger_entries WHERE partner_id=$1`, [partnerId]);

  const derived = {
    pending: sumLedgerBucket(ledger.rows, "pending"),
    bonusPending: sumLedgerBucket(ledger.rows, "bonus_pending"),
    withdrawable: sumLedgerBucket(ledger.rows, "withdrawable"),
  };

  const legacy = {
    pending: Number(partner.rows[0]?.balance_pending || 0),
    bonusPending: Number(partner.rows[0]?.balance_bonus_pending || 0),
    withdrawable: Number(partner.rows[0]?.balance_withdrawable || 0),
  };

  const match =
    derived.pending === legacy.pending &&
    derived.bonusPending === legacy.bonusPending &&
    derived.withdrawable === legacy.withdrawable;

  return { partnerId, match, legacy, derived };
}

async function main() {
  const db = await createPartnerTestDb();
  await query(db, `INSERT INTO auth.users (id) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') ON CONFLICT DO NOTHING`);
  await query(db, `INSERT INTO auth.users (id) VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') ON CONFLICT DO NOTHING`);

  const partnerA = "11111111-1111-1111-1111-111111111111";
  const partnerB = "22222222-2222-2222-2222-222222222222";

  await query(db, `INSERT INTO partners (id,user_id,referral_code,balance_bonus_pending,balance_withdrawable) VALUES
    ($1,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','PA',0.20,61.50)
  ON CONFLICT DO NOTHING`, [partnerA]);
  await query(db, `INSERT INTO partners (id,user_id,referral_code,balance_bonus_pending,balance_withdrawable) VALUES
    ($1,'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','PB',0.20,40.00)
  ON CONFLICT DO NOTHING`, [partnerB]);

  await query(db, `INSERT INTO partner_commissions (id,partner_id,amount,currency,status,source_type,service_type) VALUES
    ('33333333-3333-3333-3333-333333333331',$1,0.20,'USD','pending','signup_bonus','registration'),
    ('33333333-3333-3333-3333-333333333332',$1,97.50,'USD','withdrawable','vip_subscription','vip_spot'),
    ('33333333-3333-3333-3333-333333333333',$2,0.20,'USD','pending','signup_bonus','registration')
  ON CONFLICT DO NOTHING`, [partnerA, partnerB]);

  await query(db, `INSERT INTO partner_withdrawals (id,partner_id,amount,currency,status,network,wallet_address) VALUES
    ('44444444-4444-4444-4444-444444444441',$1,36,'USD','paid','TRC20','T123456789012345678901234567'),
    ('44444444-4444-4444-4444-444444444442',$2,10,'USD','paid','TRC20','T123456789012345678901234567')
  ON CONFLICT DO NOTHING`, [partnerA, partnerB]);

  const rA = await simulatePartner(db, partnerA);
  const rB = await simulatePartner(db, partnerB, { openingWithdrawable: 50 });

  console.log(JSON.stringify({ e8684d14_shaped: rA, a703a506_shaped: rB }, null, 2));
  await db.close();
  if (!rA.match || !rB.match) process.exit(1);
}

main();
