#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createPartnerTestDb, query } from "./partner-center/test-db.mjs";
import { createServiceSupabaseFromDb } from "./partner-center/test-supabase-mock.mjs";
import { createRewardEntitlement, creditGrowthRewardAtomic } from "../lib/partner-center/reward-engine.js";
import { reverseGrowthRewardEntitlement } from "../lib/partner-center/growth-refund-integration.js";

process.env.PARTNER_GROWTH_ENGINE = "true";

const PARTNER = "77777777-7777-4777-8777-777777777777";
const USER = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const CAMPAIGN = "88888888-8888-4888-8888-888888888888";

async function seed(db) {
  await query(db, `INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT DO NOTHING`, [USER]);
  await query(
    db,
    `INSERT INTO partners (id, user_id, referral_code, status, tier_key, balance_bonus_pending, total_earnings)
     VALUES ($1,$2,'REV1','active','partner',0,0) ON CONFLICT DO NOTHING`,
    [PARTNER, USER]
  );
  await query(
    db,
    `INSERT INTO partner_campaign_programs
      (id, code, name, status, landing_path, start_at, end_at, global_budget_amount, amount_spent, amount_reversed, rule_version)
     VALUES ($1,'rev_test','Reversal','active','/register','2020-01-01','2030-01-01',10,0,0,1)`,
    [CAMPAIGN]
  );
}

const db = await createPartnerTestDb();
await seed(db);
const supabase = createServiceSupabaseFromDb(db);

const ent = await createRewardEntitlement(supabase, {
  partnerId: PARTNER,
  rewardType: "mission_reward",
  sourceType: "mission",
  sourceId: crypto.randomUUID(),
  amount: 0.35,
  idempotencyKey: `rev-${crypto.randomUUID()}`,
  metadata: { campaignProgramId: CAMPAIGN },
});
const credit = await creditGrowthRewardAtomic(supabase, ent.entitlementId);
assert.equal(credit.credited, true);

const afterCredit = await query(
  db,
  `SELECT amount_spent::numeric s, amount_reversed::numeric r FROM partner_campaign_programs WHERE id = $1`,
  [CAMPAIGN]
);
assert.equal(Number(afterCredit.rows[0].s), 0.35);
assert.equal(Number(afterCredit.rows[0].r), 0);

const rev1 = await reverseGrowthRewardEntitlement(supabase, ent.entitlementId, { reason: "test_reversal" });
assert.equal(rev1.reversed, true);

const afterRev = await query(
  db,
  `SELECT amount_spent::numeric s, amount_reversed::numeric r FROM partner_campaign_programs WHERE id = $1`,
  [CAMPAIGN]
);
assert.equal(Number(afterRev.rows[0].s), 0.35, "amount_spent unchanged on reversal");
assert.equal(Number(afterRev.rows[0].r), 0.35, "amount_reversed incremented once");

const rev2 = await reverseGrowthRewardEntitlement(supabase, ent.entitlementId, { reason: "test_reversal_dup" });
assert.equal(rev2.duplicate, true);

const afterDup = await query(
  db,
  `SELECT amount_reversed::numeric r FROM partner_campaign_programs WHERE id = $1`,
  [CAMPAIGN]
);
assert.equal(Number(afterDup.rows[0].r), 0.35, "duplicate reversal does not double-count");

const ledgerRev = await query(
  db,
  `SELECT count(*)::int c FROM partner_financial_ledger_entries WHERE partner_id = $1 AND lifecycle_status = 'reversed'`,
  [PARTNER]
);
assert.equal(ledgerRev.rows[0].c, 1, "single ledger reversal");

console.log("PASS campaign reversal accounting (gross spend preserved, amount_reversed idempotent)");
await db.close();
