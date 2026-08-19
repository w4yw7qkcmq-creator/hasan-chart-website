#!/usr/bin/env node
/**
 * Atomic campaign budget concurrency tests (PGlite).
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createPartnerTestDb, query } from "./partner-center/test-db.mjs";
import { createServiceSupabaseFromDb } from "./partner-center/test-supabase-mock.mjs";
import {
  createRewardEntitlement,
  creditGrowthRewardAtomic,
} from "../lib/partner-center/reward-engine.js";

process.env.PARTNER_GROWTH_ENGINE = "true";

const PARTNER = "33333333-3333-4333-8333-333333333333";
const USER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CAMPAIGN = "44444444-4444-4444-8444-444444444444";

async function seed(db) {
  await query(db, `INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT DO NOTHING`, [USER]);
  await query(
    db,
    `INSERT INTO partners (id, user_id, referral_code, status, tier_key)
     VALUES ($1,$2,'BUD1','active','partner') ON CONFLICT DO NOTHING`,
    [PARTNER, USER]
  );
  await query(
    db,
    `INSERT INTO partner_campaign_programs
      (id, code, name, status, landing_path, start_at, end_at, global_budget_amount, amount_spent, rule_version)
     VALUES ($1,'budget_test','Budget Test','active','/register', '2020-01-01', '2030-01-01', 1.00, 0, 1)`,
    [CAMPAIGN]
  );
}

async function createEntitlement(supabase, suffix) {
  return createRewardEntitlement(supabase, {
    partnerId: PARTNER,
    rewardType: "mission_reward",
    sourceType: "mission",
    sourceId: crypto.randomUUID(),
    amount: 0.35,
    idempotencyKey: `budget-test-${suffix}-${Date.now()}-${Math.random()}`,
    metadata: { campaignProgramId: CAMPAIGN },
  });
}

const db = await createPartnerTestDb();
await seed(db);
const supabase = createServiceSupabaseFromDb(db);

const attempts = await Promise.all(
  Array.from({ length: 10 }, (_, i) => createEntitlement(supabase, i))
);

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

const creditResults = await Promise.all(
  attempts.map((a) => (a.entitlementId ? tryCredit(supabase, a.entitlementId) : Promise.resolve({ credited: false })))
);

const credited = creditResults.filter((r) => r.credited).length;
const spent = await query(
  db,
  `SELECT amount_spent::numeric FROM partner_campaign_programs WHERE id = $1`,
  [CAMPAIGN]
);

assert.equal(credited, 2, `expected 2 credits, got ${credited}`);
assert.equal(Number(spent.rows[0].amount_spent), 0.7);

const retry = await tryCredit(supabase, attempts[0].entitlementId);
assert.ok(retry.duplicate || !retry.credited);

console.log(`PASS campaign budget concurrency x10 (credited=${credited}, spent=0.70)`);

await db.close();
