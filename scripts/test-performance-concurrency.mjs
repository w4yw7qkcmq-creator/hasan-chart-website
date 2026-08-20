#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createPartnerTestDb, query } from "./partner-center/test-db.mjs";
import { createServiceSupabaseFromDb } from "./partner-center/test-supabase-mock.mjs";
import { evaluatePerformanceBonusesForPartner } from "../lib/partner-center/performance-bonus-engine.js";

process.env.PARTNER_GROWTH_ENGINE = "true";
process.env.PARTNER_ANTI_ABUSE_GATE_ENABLED = "true";
process.env.HUMAN_VERIFICATION_ENABLED = "true";

const EFFECTIVE_FROM = "2026-08-19T18:35:00.000Z";
const AFTER = "2026-08-19T19:00:00.000Z";
const PARTNER = "55555555-5555-4555-8555-555555555555";
const USER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const RULE = "66666666-6666-4666-8666-666666666666";

async function seed(db) {
  await query(
    db,
    `INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ($1,'conc@example.com',now()) ON CONFLICT DO NOTHING`,
    [USER]
  );
  await query(
    db,
    `INSERT INTO partners (id, user_id, referral_code, status, tier_key) VALUES ($1,$2,'CONC1','active','partner') ON CONFLICT DO NOTHING`,
    [PARTNER, USER]
  );
  await query(
    db,
    `INSERT INTO profiles (id, user_classification, effective_user_classification, human_verification_status)
     VALUES ($1,'real','real','verified') ON CONFLICT (id) DO UPDATE SET human_verification_status = 'verified'`,
    [USER]
  );
  await query(
    db,
    `INSERT INTO partner_performance_bonus_rules
      (id, code, name, metric, period_type, threshold_value, minimum_sample_size, reward_amount, status, rule_version, effective_from, created_at)
     VALUES ($1,'conc_rule','Conc','confirmed_revenue','monthly',50,1,2,'active',1,$2,$2)`,
    [RULE, EFFECTIVE_FROM]
  );
  await query(
    db,
    `INSERT INTO partner_financial_ledger_entries
      (id, partner_id, entry_type, entry_direction, amount, currency, lifecycle_status, balance_bucket, idempotency_key, created_at)
     VALUES ($1,$2,'commission','credit',50,'USD','approved','withdrawable',$3,$4)`,
    [crypto.randomUUID(), PARTNER, `conc-rev-${crypto.randomUUID()}`, AFTER]
  );
}

async function runConcurrency(db, supabase, n) {
  const partnerId = `55555555-5555-4555-8555-${String(n).padStart(12, "0")}`;
  const userId = `dddddddd-dddd-4ddd-8ddd-${String(n).padStart(12, "0")}`;
  await query(db, `DELETE FROM partner_performance_bonus_grants WHERE partner_id = $1`, [partnerId]);
  await query(db, `DELETE FROM partner_reward_entitlements WHERE partner_id = $1`, [partnerId]);
  await query(
    db,
    `INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ($1,$2,now()) ON CONFLICT (id) DO UPDATE SET email_confirmed_at = now()`,
    [userId, `conc${n}@example.com`]
  );
  await query(
    db,
    `INSERT INTO partners (id, user_id, referral_code, status, tier_key) VALUES ($1,$2,$3,'active','partner') ON CONFLICT (id) DO NOTHING`,
    [partnerId, userId, `C${n}`]
  );
  await query(
    db,
    `INSERT INTO profiles (id, email, user_classification, effective_user_classification, human_verification_status)
     VALUES ($1,$2,'real','real','verified') ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, human_verification_status = 'verified'`,
    [userId, `conc${n}@example.com`]
  );
  await query(
    db,
    `INSERT INTO partner_financial_ledger_entries
      (id, partner_id, entry_type, entry_direction, amount, currency, lifecycle_status, balance_bucket, idempotency_key, created_at)
     VALUES ($1,$2,'commission','credit',50,'USD','approved','withdrawable',$3,$4)`,
    [crypto.randomUUID(), partnerId, `conc-rev-${n}-${crypto.randomUUID()}`, AFTER]
  );
  const results = await Promise.all(
    Array.from({ length: n }, () =>
      evaluatePerformanceBonusesForPartner(supabase, partnerId, { tierKey: "partner", at: new Date(AFTER) })
    )
  );
  const c = await counts(db, partnerId);
  return { ...c, partnerId, evaluations: results.length };
}

async function counts(db, partnerId) {
  const [grants, ents, ledger] = await Promise.all([
    query(db, `SELECT count(*)::int c FROM partner_performance_bonus_grants WHERE partner_id = $1`, [partnerId]),
    query(
      db,
      `SELECT count(*)::int c FROM partner_reward_entitlements WHERE partner_id = $1 AND reward_type = 'performance_bonus'`,
      [partnerId]
    ),
    query(
      db,
      `SELECT count(*)::int c FROM partner_financial_ledger_entries WHERE partner_id = $1 AND entry_type = 'performance_bonus'`,
      [partnerId]
    ),
  ]);
  return { grants: grants.rows[0].c, ents: ents.rows[0].c, ledger: ledger.rows[0].c };
}

const db = await createPartnerTestDb();
await seed(db);
const supabase = createServiceSupabaseFromDb(db);

for (const n of [2, 5, 10]) {
  const r = await runConcurrency(db, supabase, n);
  assert.equal(r.grants, 1, `x${n} grants`);
  assert.equal(r.ents, 1, `x${n} entitlements`);
  console.log(`PASS performance concurrency x${n} (grants=1, ents=1)`);
}

const retryPartnerId = `55555555-5555-4555-8555-${String(2).padStart(12, "0")}`;
const retry = await evaluatePerformanceBonusesForPartner(supabase, retryPartnerId, {
  tierKey: "partner",
  at: new Date(AFTER),
});
assert.equal(retry.grants.length, 0);
const after = await counts(db, retryPartnerId);
assert.equal(after.grants, 1);
assert.equal(after.ents, 1);
console.log("PASS performance concurrency idempotent retry");

await db.close();
