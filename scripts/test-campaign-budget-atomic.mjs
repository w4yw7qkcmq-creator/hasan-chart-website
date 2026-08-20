#!/usr/bin/env node
/**
 * Atomic campaign budget: boundaries, concurrency, idempotency (PGlite).
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createPartnerTestDb, query } from "./partner-center/test-db.mjs";
import { createServiceSupabaseFromDb } from "./partner-center/test-supabase-mock.mjs";
import { createRewardEntitlement, creditGrowthRewardAtomic } from "../lib/partner-center/reward-engine.js";

process.env.PARTNER_GROWTH_ENGINE = "true";

async function tryCredit(supabase, entitlementId) {
  try {
    return await creditGrowthRewardAtomic(supabase, entitlementId);
  } catch (error) {
    if (String(error?.message || error).includes("campaign_budget_exhausted")) {
      return { credited: false, budgetExhausted: true, entitlementId };
    }
    throw error;
  }
}

async function seedPartner(db, partnerId, userId, referralCode) {
  await query(db, `INSERT INTO auth.users (id, email) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [
    userId,
    `${referralCode}@example.com`,
  ]);
  await query(
    db,
    `INSERT INTO partners (id, user_id, referral_code, status, tier_key)
     VALUES ($1,$2,$3,'active','partner')
     ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, referral_code = EXCLUDED.referral_code`,
    [partnerId, userId, referralCode]
  );
}

async function runScenario(db, supabase, { budget, reward, attempts, partnerId, userId, campaignId }) {
  const referralCode = `B${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  await seedPartner(db, partnerId, userId, referralCode);
  const campaignCode = `budget_${campaignId.replace(/-/g, "")}`;
  await query(
    db,
    `INSERT INTO partner_campaign_programs
      (id, code, name, status, landing_path, start_at, end_at, global_budget_amount, amount_spent, rule_version)
     VALUES ($1,$2,'Budget Test','active','/register','2020-01-01','2030-01-01',$3,0,1)
     ON CONFLICT (id) DO UPDATE SET global_budget_amount = EXCLUDED.global_budget_amount, amount_spent = 0`,
    [campaignId, campaignCode, budget]
  );

  const entitlements = await Promise.all(
    Array.from({ length: attempts }, (_, i) =>
      createRewardEntitlement(supabase, {
        partnerId,
        rewardType: "mission_reward",
        sourceType: "mission",
        sourceId: crypto.randomUUID(),
        amount: reward,
        idempotencyKey: `budget-${campaignId}-${i}-${crypto.randomUUID()}`,
        metadata: { campaignProgramId: campaignId },
      })
    )
  );

  const creditResults = await Promise.all(
    entitlements.map((a) => (a.entitlementId ? tryCredit(supabase, a.entitlementId) : { credited: false }))
  );

  const credited = creditResults.filter((r) => r.credited).length;
  const spentRow = await query(db, `SELECT amount_spent::numeric AS s FROM partner_campaign_programs WHERE id = $1`, [
    campaignId,
  ]);
  const spent = Number(spentRow.rows[0]?.s || 0);
  const remaining = Math.round((budget - spent) * 100) / 100;
  const ledgerRow = await query(
    db,
    `SELECT coalesce(sum(amount),0)::numeric s FROM partner_financial_ledger_entries
     WHERE partner_id = $1 AND entry_type = 'mission_reward'`,
    [partnerId]
  );
  return { credited, spent, remaining, entitlements, creditResults, ledgerSum: Number(ledgerRow.rows[0].s) };
}

const db = await createPartnerTestDb();
const supabase = createServiceSupabaseFromDb(db);

const s100 = await runScenario(db, supabase, {
  budget: 1.0,
  reward: 0.35,
  attempts: 10,
  partnerId: "33333333-3333-4333-8333-333333333333",
  userId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  campaignId: "44444444-4444-4444-8444-444444444444",
});
assert.equal(s100.credited, 2);
assert.equal(s100.spent, 0.7);
assert.equal(s100.remaining, 0.3);
assert.equal(s100.ledgerSum, 0.7);
const retry100 = await tryCredit(supabase, s100.entitlements[0].entitlementId);
assert.ok(retry100.duplicate || !retry100.credited);
console.log("PASS campaign $1.00 / $0.35 → 2 payouts, spent $0.70, remaining $0.30");

const s105 = await runScenario(db, supabase, {
  budget: 1.05,
  reward: 0.35,
  attempts: 10,
  partnerId: "33333333-3333-4333-8333-000000000002",
  userId: "cccccccc-cccc-4ccc-8ccc-000000000002",
  campaignId: "44444444-4444-4444-8444-444444444445",
});
assert.equal(s105.credited, 3);
assert.equal(s105.spent, 1.05);
assert.equal(s105.remaining, 0);
assert.ok(s105.creditResults.some((r) => r.budgetExhausted));
console.log("PASS campaign $1.05 / $0.35 → exactly 3 payouts, spent $1.05");

for (const n of [2, 5, 10, 50]) {
  const partnerId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const r = await runScenario(db, supabase, {
    budget: 1.0,
    reward: 0.35,
    attempts: n,
    partnerId,
    userId,
    campaignId: crypto.randomUUID(),
  });
  assert.equal(r.credited, 2, `x${n} credited`);
  assert.equal(r.spent, 0.7, `x${n} spent`);
  assert.equal(r.ledgerSum, r.spent, `x${n} ledger matches amount_spent`);
  console.log(`PASS campaign concurrency x${n} (credited=2, spent=0.70)`);
}

await db.close();
