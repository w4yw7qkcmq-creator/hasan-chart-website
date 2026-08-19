#!/usr/bin/env node
/**
 * Wave 3 pilot campaign isolated proof: $25 global / $2 per-partner / $0.25 reward.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createPartnerTestDb, query } from "./partner-center/test-db.mjs";
import { createServiceSupabaseFromDb } from "./partner-center/test-supabase-mock.mjs";
import { createRewardEntitlement, creditGrowthRewardAtomic } from "../lib/partner-center/reward-engine.js";

process.env.PARTNER_GROWTH_ENGINE = "true";

const REWARD = 0.25;
const GLOBAL = 25;
const PARTNER_CAP = 2;

async function tryCredit(supabase, entitlementId) {
  try {
    return await creditGrowthRewardAtomic(supabase, entitlementId);
  } catch (error) {
    if (String(error?.message || error).includes("campaign_budget_exhausted")) {
      return { credited: false, budgetExhausted: true };
    }
    if (String(error?.message || error).includes("campaign_partner_cap_exceeded")) {
      return { credited: false, partnerCapExceeded: true };
    }
    throw error;
  }
}

async function seedPartner(db, partnerId, userId) {
  const code = `P${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
  await query(db, `INSERT INTO auth.users (id, email) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [
    userId,
    `${code}@example.com`,
  ]);
  await query(
    db,
    `INSERT INTO partners (id, user_id, referral_code, status, tier_key)
     VALUES ($1,$2,$3,'active','partner') ON CONFLICT (id) DO NOTHING`,
    [partnerId, userId, code]
  );
}

async function seedCampaign(db, campaignId) {
  const code = `pilot_${campaignId.replace(/-/g, "").slice(0, 20)}`;
  await query(
    db,
    `INSERT INTO partner_campaign_programs
      (id, code, name, status, landing_path, start_at, end_at,
       global_budget_amount, budget_currency, amount_spent, amount_reversed,
       per_partner_reward_cap, max_participants, rule_version)
     VALUES ($1,$2,'Pilot','active','/register','2020-01-01','2030-01-01',$3,'USD',0,0,$4,50,1)`,
    [campaignId, code, GLOBAL, PARTNER_CAP]
  );
  return code;
}

async function creditN(supabase, db, { campaignId, partnerId, attempts }) {
  const results = [];
  for (let i = 0; i < attempts; i++) {
    const ent = await createRewardEntitlement(supabase, {
      partnerId,
      rewardType: "mission_reward",
      sourceType: "mission",
      sourceId: crypto.randomUUID(),
      amount: REWARD,
      idempotencyKey: `pilot-${campaignId}-${partnerId}-${i}-${crypto.randomUUID()}`,
      metadata: { campaignProgramId: campaignId },
    });
    results.push(await tryCredit(supabase, ent.entitlementId));
  }
  const spentRow = await query(db, `SELECT amount_spent::numeric s FROM partner_campaign_programs WHERE id=$1`, [
    campaignId,
  ]);
  const credited = results.filter((r) => r.credited).length;
  return { credited, spent: Number(spentRow.rows[0]?.s || 0), results };
}

const db = await createPartnerTestDb();
const fixMigration = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../supabase/migrations/20260825_partner_campaign_partner_cap_fix.sql"),
  "utf8"
);
await db.exec(fixMigration);
const supabase = createServiceSupabaseFromDb(db);

{
  const campaignId = crypto.randomUUID();
  const partnerId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  await seedPartner(db, partnerId, userId);
  await seedCampaign(db, campaignId);
  const r = await creditN(supabase, db, { campaignId, partnerId, attempts: 9 });
  assert.equal(r.credited, 8, "partner cap allows 8 x $0.25");
  assert.equal(r.spent, PARTNER_CAP);
  assert.ok(r.results[8]?.partnerCapExceeded || r.results[8]?.budgetExhausted === false);
  console.log("PASS pilot per-partner cap 8 x $0.25 = $2.00, 9th rejected");
}

{
  const campaignId = crypto.randomUUID();
  await seedCampaign(db, campaignId);
  let totalCredited = 0;
  for (let i = 0; i < 101; i++) {
    const partnerId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    await seedPartner(db, partnerId, userId);
    const ent = await createRewardEntitlement(supabase, {
      partnerId,
      rewardType: "mission_reward",
      sourceType: "mission",
      sourceId: crypto.randomUUID(),
      amount: REWARD,
      idempotencyKey: `pilot-global-${campaignId}-${i}-${crypto.randomUUID()}`,
      metadata: { campaignProgramId: campaignId },
    });
    const cr = await tryCredit(supabase, ent.entitlementId);
    if (cr.credited) totalCredited += 1;
  }
  const spentRow = await query(db, `SELECT amount_spent::numeric s FROM partner_campaign_programs WHERE id=$1`, [
    campaignId,
  ]);
  assert.equal(totalCredited, 100);
  assert.equal(Number(spentRow.rows[0]?.s), GLOBAL);
  console.log("PASS pilot global budget 100 x $0.25 = $25.00, 101st rejected");
}

for (const n of [2, 5]) {
  const campaignId = crypto.randomUUID();
  const partnerId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  await seedPartner(db, partnerId, userId);
  await seedCampaign(db, campaignId);
  const ents = await Promise.all(
    Array.from({ length: n }, (_, i) =>
      createRewardEntitlement(supabase, {
        partnerId,
        rewardType: "mission_reward",
        sourceType: "mission",
        sourceId: crypto.randomUUID(),
        amount: REWARD,
        idempotencyKey: `pilot-conc-${campaignId}-${i}-${crypto.randomUUID()}`,
        metadata: { campaignProgramId: campaignId },
      })
    )
  );
  const credits = await Promise.all(ents.map((e) => tryCredit(supabase, e.entitlementId)));
  const credited = credits.filter((c) => c.credited).length;
  assert.equal(credited, n, `x${n} partner cap concurrency`);
  const spentRow = await query(db, `SELECT amount_spent::numeric s FROM partner_campaign_programs WHERE id=$1`, [
    campaignId,
  ]);
  assert.equal(Number(spentRow.rows[0]?.s), n * REWARD, `x${n} spent`);
  console.log(`PASS pilot concurrency x${n} (credited=${n}, spent=$${(n * REWARD).toFixed(2)})`);
}

{
  const campaignId = crypto.randomUUID();
  await seedCampaign(db, campaignId);
  const batch = 50;
  const ents = await Promise.all(
    Array.from({ length: batch }, async (_, i) => {
      const partnerId = crypto.randomUUID();
      const userId = crypto.randomUUID();
      await seedPartner(db, partnerId, userId);
      return createRewardEntitlement(supabase, {
        partnerId,
        rewardType: "mission_reward",
        sourceType: "mission",
        sourceId: crypto.randomUUID(),
        amount: REWARD,
        idempotencyKey: `pilot-conc50-${campaignId}-${i}-${crypto.randomUUID()}`,
        metadata: { campaignProgramId: campaignId },
      });
    })
  );
  const credits = await Promise.all(ents.map((e) => tryCredit(supabase, e.entitlementId)));
  const credited = credits.filter((c) => c.credited).length;
  assert.equal(credited, 50, "x50 global concurrency within budget");
  const spentRow = await query(db, `SELECT amount_spent::numeric s FROM partner_campaign_programs WHERE id=$1`, [
    campaignId,
  ]);
  assert.equal(Number(spentRow.rows[0]?.s), 12.5);
  console.log("PASS pilot concurrency x50 distinct partners (credited=50, spent=$12.50)");
}

await db.close();
console.log("Wave 3 pilot campaign isolated tests: ALL PASS");
