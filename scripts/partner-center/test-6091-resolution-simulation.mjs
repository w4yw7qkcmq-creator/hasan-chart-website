#!/usr/bin/env node
/**
 * 6091ee4e resolution fixture — unified simulation (PGlite).
 */
import { createPartnerTestDb, query } from "./test-db.mjs";
import { buildBackfillLedgerRow, classifyLegacyCommission } from "./backfill-commissions-dry-run.mjs";
import { classifyLegacyWithdrawal } from "./backfill-withdrawals-dry-run.mjs";
import { sumLedgerBucket } from "../../lib/partner-center/money.js";

const PARTNER = "6091ee4e-4931-4149-b96f-71f4cf21ca9b";
const USER = "cccccccc-cccc-cccc-cccc-cccccccccccc";

async function insertLedger(db, partnerId, spec, amount, refs = {}) {
  await query(db, `
    INSERT INTO partner_financial_ledger_entries (
      partner_id, entry_type, entry_direction, lifecycle_status, amount, currency,
      balance_bucket, legacy_commission_id, legacy_withdrawal_id, idempotency_key, metadata, created_at
    ) VALUES ($1,$2,$3,$4,$5,'USD',$6,$7,$8,$9,$10::jsonb,$11)
  `, [
    partnerId, spec.entryType, spec.entryDirection, spec.lifecycleStatus, amount,
    spec.balanceBucket, refs.commissionId || null, refs.withdrawalId || null,
    spec.idempotencyKey, JSON.stringify(spec.metadata || {}), spec.createdAt,
  ]);
}

async function main() {
  const db = await createPartnerTestDb();
  await query(db, `INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT DO NOTHING`, [USER]);
  await query(db, `
    INSERT INTO partners (id,user_id,referral_code,balance_withdrawable,total_withdrawn)
    VALUES ($1,$2,'P6091',40,30) ON CONFLICT DO NOTHING
  `, [PARTNER, USER]);

  await insertLedger(db, PARTNER, {
    entryType: "manual_adjustment", entryDirection: "credit", lifecycleStatus: "payable",
    balanceBucket: "withdrawable", idempotencyKey: `legacy_opening:${PARTNER}`,
    metadata: { source: "legacy_opening_balance" }, createdAt: "2026-07-05T15:52:03.668Z",
  }, 50);

  await insertLedger(db, PARTNER, {
    entryType: "manual_adjustment", entryDirection: "credit", lifecycleStatus: "payable",
    balanceBucket: "withdrawable", idempotencyKey: `legacy_e2e_fixture:${PARTNER}`,
    metadata: { source: "legacy_e2e_balance_fixture", script: "partner-withdrawal-notifications-e2e.mjs" },
    createdAt: "2026-07-07T20:34:52.270Z",
  }, 20);

  await query(db, `
    INSERT INTO partner_withdrawals (id,partner_id,amount,currency,status,network,wallet_address,created_at) VALUES
    ('6e5c140e-21d1-40d3-ab85-51dace898e7b',$1,20,'USD','paid','TRC20','TTest', '2026-07-05T15:52:13Z'),
    ('417eb3c2-0c31-49ad-a206-a2cf5cfbe688',$1,10,'USD','paid','TRC20','TE2E', '2026-07-07T20:34:52Z')
    ON CONFLICT DO NOTHING
  `, [PARTNER]);

  for (const w of (await query(db, `SELECT * FROM partner_withdrawals WHERE partner_id=$1 AND status='paid'`, [PARTNER])).rows) {
    const cls = classifyLegacyWithdrawal(w, null);
    if (cls.status === "READY_TO_BACKFILL") {
      await insertLedger(db, PARTNER, { ...cls.suggestedRow, idempotencyKey: cls.idempotencyKey, createdAt: w.created_at }, w.amount, { withdrawalId: w.id });
    }
  }

  const partner = (await query(db, `SELECT balance_withdrawable FROM partners WHERE id=$1`, [PARTNER])).rows[0];
  const ledger = (await query(db, `SELECT entry_direction, amount, balance_bucket FROM partner_financial_ledger_entries WHERE partner_id=$1`, [PARTNER])).rows;
  const derived = sumLedgerBucket(ledger, "withdrawable");
  const legacy = Number(partner.balance_withdrawable);
  const ok = derived === legacy;
  console.log(JSON.stringify({ partner: PARTNER, legacy, derived, ok, equation: "50+20-30=40" }, null, 2));
  await db.close();
  if (!ok) process.exit(1);
}

main();
