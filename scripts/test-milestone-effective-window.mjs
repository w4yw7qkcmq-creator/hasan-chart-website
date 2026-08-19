#!/usr/bin/env node
/**
 * Milestone effective_from / effective_to retroactivity tests (PGlite).
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createPartnerTestDb, query } from "./partner-center/test-db.mjs";
import { createServiceSupabaseFromDb } from "./partner-center/test-supabase-mock.mjs";
import {
  evaluateMilestonesForPartner,
  resolveMilestoneMetricWindow,
} from "../lib/partner-center/milestone-engine.js";
import { computeMilestoneMetricValue, computePartnerMetrics } from "../lib/partner-center/partner-metrics.js";

const EFFECTIVE_FROM = "2026-08-19T17:45:51.162Z";
const BEFORE = "2026-08-19T10:00:00.000Z";
const AFTER = "2026-08-19T18:00:00.000Z";
const AFTER2 = "2026-08-19T19:00:00.000Z";

process.env.PARTNER_GROWTH_ENGINE = "true";

const ctx = { partnerId: null, referralCode: null };

async function setupPartner(db, seq) {
  const partnerId = `11111111-1111-4111-8111-${String(seq).padStart(12, "0")}`;
  const userId = `aaaaaaaa-aaaa-4aaa-8aaa-${String(seq).padStart(12, "0")}`;
  ctx.partnerId = partnerId;
  ctx.referralCode = `MS${String(seq).padStart(4, "0")}`;
  await query(db, `DELETE FROM partner_milestone_grants`);
  await query(db, `DELETE FROM partner_milestone_definitions`);
  await query(db, `DELETE FROM partner_mission_definitions`);
  await query(db, `INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT DO NOTHING`, [userId]);
  await query(
    db,
    `INSERT INTO partners (id, user_id, referral_code, status, tier_key)
     VALUES ($1,$2,$3,'active','partner') ON CONFLICT DO NOTHING`,
    [partnerId, userId, ctx.referralCode]
  );
  return partnerId;
}

async function insertQualified(db, { referralId, referredId, qualifiedAt }) {
  await query(db, `INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT DO NOTHING`, [referredId]);
  await query(
    db,
    `INSERT INTO partner_referrals (id, partner_id, referred_user_id, referral_code, referred_username, status)
     VALUES ($1,$2,$3,$4,'ref','registered') ON CONFLICT DO NOTHING`,
    [referralId, ctx.partnerId, referredId, ctx.referralCode]
  );
  await query(
    db,
    `INSERT INTO partner_referral_qualifications (referral_id, partner_id, referred_user_id, state, qualified_at)
     VALUES ($1,$2,$3,'qualified',$4)
     ON CONFLICT (referral_id) DO UPDATE SET state = EXCLUDED.state, qualified_at = EXCLUDED.qualified_at`,
    [referralId, ctx.partnerId, referredId, qualifiedAt]
  );
}

async function insertCustomer(db, { referralId, referredId, customerAt }) {
  await query(db, `INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT DO NOTHING`, [referredId]);
  await query(
    db,
    `INSERT INTO partner_referrals (id, partner_id, referred_user_id, referral_code, referred_username, status)
     VALUES ($1,$2,$3,$4,'cust','registered') ON CONFLICT DO NOTHING`,
    [referralId, ctx.partnerId, referredId, ctx.referralCode]
  );
  await query(
    db,
    `INSERT INTO partner_referral_qualifications (referral_id, partner_id, referred_user_id, state, qualified_at)
     VALUES ($1,$2,$3,'customer',$4)
     ON CONFLICT (referral_id) DO UPDATE SET state = EXCLUDED.state, qualified_at = EXCLUDED.qualified_at`,
    [referralId, ctx.partnerId, referredId, customerAt]
  );
  await query(
    db,
    `INSERT INTO partner_qualification_transitions (referral_id, partner_id, from_state, to_state, reason, created_at)
     VALUES ($1,$2,'qualified','customer','service_purchase',$3)`,
    [referralId, ctx.partnerId, customerAt]
  );
}

async function insertMilestone(db, { id, code, metric, threshold, effectiveFrom, effectiveTo, status = "active" }) {
  await query(
    db,
    `INSERT INTO partner_milestone_definitions
      (id, code, name, metric, threshold_value, reward_amount, status, rule_version, effective_from, effective_to, created_at)
     VALUES ($1,$2,$3,$4,$5,2,$6,1,$7,$8,$7)`,
    [id, code, code, metric, threshold, status, effectiveFrom, effectiveTo || null]
  );
}

async function grantCount(db) {
  const r = await query(
    db,
    `SELECT count(*)::int c FROM partner_milestone_grants WHERE partner_id = $1`,
    [ctx.partnerId]
  );
  return r.rows[0].c;
}

async function entitlementCount(db) {
  const r = await query(
    db,
    `SELECT count(*)::int c FROM partner_reward_entitlements WHERE partner_id = $1 AND reward_type = 'milestone_reward'`,
    [ctx.partnerId]
  );
  return r.rows[0].c;
}

const tests = [];
function t(name, fn) {
  tests.push([name, fn]);
}

t("1 historical qualified referrals before effective_from do not complete", async (db, supabase) => {
  await setupPartner(db, 1);
  const msId = crypto.randomUUID();
  for (let i = 0; i < 20; i += 1) {
    await insertQualified(db, {
      referralId: crypto.randomUUID(),
      referredId: crypto.randomUUID(),
      qualifiedAt: BEFORE,
    });
  }
  await insertMilestone(db, {
    id: msId,
    code: "retro10",
    metric: "qualified_referrals",
    threshold: 10,
    effectiveFrom: EFFECTIVE_FROM,
  });
  const r = await evaluateMilestonesForPartner(supabase, ctx.partnerId, { tierKey: "partner" });
  assert.equal(r.grants.length, 0);
  assert.equal(await grantCount(db), 0);
  assert.equal(await entitlementCount(db), 0);
});

t("2-4 post-effective_from threshold progression and duplicate guard", async (db, supabase) => {
  await setupPartner(db, 2);
  const msId = crypto.randomUUID();
  await insertMilestone(db, {
    id: msId,
    code: "post10",
    metric: "qualified_referrals",
    threshold: 10,
    effectiveFrom: EFFECTIVE_FROM,
  });
  for (let i = 0; i < 9; i += 1) {
    await insertQualified(db, {
      referralId: crypto.randomUUID(),
      referredId: crypto.randomUUID(),
      qualifiedAt: AFTER,
    });
  }
  assert.equal(
    await computeMilestoneMetricValue(supabase, ctx.partnerId, "qualified_referrals", {
      startAt: EFFECTIVE_FROM,
    }),
    9
  );
  assert.equal((await evaluateMilestonesForPartner(supabase, ctx.partnerId, { tierKey: "partner" })).grants.length, 0);

  await insertQualified(db, {
    referralId: crypto.randomUUID(),
    referredId: crypto.randomUUID(),
    qualifiedAt: AFTER2,
  });
  const first = await evaluateMilestonesForPartner(supabase, ctx.partnerId, { tierKey: "partner" });
  assert.equal(first.grants.length, 1);
  assert.equal(await grantCount(db), 1);
  assert.equal(await entitlementCount(db), 1);

  const second = await evaluateMilestonesForPartner(supabase, ctx.partnerId, { tierKey: "partner" });
  assert.equal(second.grants.length, 0);
  assert.equal(await grantCount(db), 1);
  assert.equal(await entitlementCount(db), 1);
});

t("5 threshold 25 with 30 historical referrals does not complete", async (db, supabase) => {
  await setupPartner(db, 5);
  const msId = crypto.randomUUID();
  for (let i = 0; i < 30; i += 1) {
    await insertQualified(db, {
      referralId: crypto.randomUUID(),
      referredId: crypto.randomUUID(),
      qualifiedAt: BEFORE,
    });
  }
  await insertMilestone(db, {
    id: msId,
    code: "ms25hist",
    metric: "qualified_referrals",
    threshold: 25,
    effectiveFrom: EFFECTIVE_FROM,
  });
  const r = await evaluateMilestonesForPartner(supabase, ctx.partnerId, { tierKey: "partner" });
  assert.equal(r.grants.length, 0);
});

t("6 first_customer historical before effective_from ignored", async (db, supabase) => {
  await setupPartner(db, 6);
  const msId = crypto.randomUUID();
  await insertCustomer(db, {
    referralId: crypto.randomUUID(),
    referredId: crypto.randomUUID(),
    customerAt: BEFORE,
  });
  await insertMilestone(db, {
    id: msId,
    code: "fc_hist",
    metric: "first_customer",
    threshold: 1,
    effectiveFrom: EFFECTIVE_FROM,
  });
  const r = await evaluateMilestonesForPartner(supabase, ctx.partnerId, { tierKey: "partner" });
  assert.equal(r.grants.length, 0);
});

t("7 first_customer after effective_from completes", async (db, supabase) => {
  await setupPartner(db, 7);
  const msId = crypto.randomUUID();
  await insertCustomer(db, {
    referralId: crypto.randomUUID(),
    referredId: crypto.randomUUID(),
    customerAt: AFTER,
  });
  await insertMilestone(db, {
    id: msId,
    code: "fc_new",
    metric: "first_customer",
    threshold: 1,
    effectiveFrom: EFFECTIVE_FROM,
  });
  const r = await evaluateMilestonesForPartner(supabase, ctx.partnerId, { tierKey: "partner" });
  assert.equal(r.grants.length, 1);
});

t("8 confirmed_revenue ignores historical ledger credits", async (db, supabase) => {
  await setupPartner(db, 8);
  const msId = crypto.randomUUID();
  await query(
    db,
    `INSERT INTO partner_financial_ledger_entries
      (id, partner_id, entry_type, entry_direction, amount, currency, lifecycle_status, balance_bucket, idempotency_key, created_at)
     VALUES ($1,$2,'commission','credit',100,'USD','approved','withdrawable',$4,$3)`,
    [crypto.randomUUID(), ctx.partnerId, BEFORE, `hist-rev-${crypto.randomUUID()}`]
  );
  await insertMilestone(db, {
    id: msId,
    code: "rev50",
    metric: "confirmed_revenue",
    threshold: 50,
    effectiveFrom: EFFECTIVE_FROM,
  });
  let r = await evaluateMilestonesForPartner(supabase, ctx.partnerId, { tierKey: "partner" });
  assert.equal(r.grants.length, 0);
  await query(
    db,
    `INSERT INTO partner_financial_ledger_entries
      (id, partner_id, entry_type, entry_direction, amount, currency, lifecycle_status, balance_bucket, idempotency_key, created_at)
     VALUES ($1,$2,'commission','credit',50,'USD','approved','withdrawable',$4,$3)`,
    [crypto.randomUUID(), ctx.partnerId, AFTER, `new-rev-${crypto.randomUUID()}`]
  );
  r = await evaluateMilestonesForPartner(supabase, ctx.partnerId, { tierKey: "partner" });
  assert.equal(r.grants.length, 1);
});

t("9 effective_to blocks post-window qualification", async (db, supabase) => {
  await setupPartner(db, 9);
  const msId = crypto.randomUUID();
  const effectiveTo = "2026-08-19T18:30:00.000Z";
  await insertMilestone(db, {
    id: msId,
    code: "win_close",
    metric: "qualified_referrals",
    threshold: 1,
    effectiveFrom: EFFECTIVE_FROM,
    effectiveTo,
  });
  await insertQualified(db, {
    referralId: crypto.randomUUID(),
    referredId: crypto.randomUUID(),
    qualifiedAt: "2026-08-19T19:30:00.000Z",
  });
  const value = await computeMilestoneMetricValue(supabase, ctx.partnerId, "qualified_referrals", {
    startAt: EFFECTIVE_FROM,
    endAt: effectiveTo,
  });
  assert.equal(value, 0);
  const r = await evaluateMilestonesForPartner(supabase, ctx.partnerId, { tierKey: "partner" });
  assert.equal(r.grants.filter((g) => g.milestoneId === msId).length, 0);
});

t("10 paused milestone does not grant", async (db, supabase) => {
  await setupPartner(db, 10);
  const msId = crypto.randomUUID();
  await insertQualified(db, {
    referralId: crypto.randomUUID(),
    referredId: crypto.randomUUID(),
    qualifiedAt: AFTER,
  });
  await insertMilestone(db, {
    id: msId,
    code: "paused_ms",
    metric: "qualified_referrals",
    threshold: 1,
    effectiveFrom: EFFECTIVE_FROM,
    status: "paused",
  });
  const r = await evaluateMilestonesForPartner(supabase, ctx.partnerId, { tierKey: "partner" });
  assert.equal(r.grants.filter((g) => g.milestoneId === msId).length, 0);
});

t("11 draft milestone does not grant", async (db, supabase) => {
  await setupPartner(db, 11);
  const msId = crypto.randomUUID();
  await insertMilestone(db, {
    id: msId,
    code: "draft_ms",
    metric: "qualified_referrals",
    threshold: 1,
    effectiveFrom: EFFECTIVE_FROM,
    status: "draft",
  });
  const r = await evaluateMilestonesForPartner(supabase, ctx.partnerId, { tierKey: "partner" });
  assert.equal(r.grants.filter((g) => g.milestoneId === msId).length, 0);
});

t("12 resolveMilestoneMetricWindow uses effective_from over created_at", async () => {
  const w = resolveMilestoneMetricWindow({
    effective_from: EFFECTIVE_FROM,
    created_at: "2020-01-01T00:00:00Z",
  });
  assert.equal(w.startAt, EFFECTIVE_FROM);
});

t("13 concurrency x10 milestone evaluation grants once", async (db, supabase) => {
  await setupPartner(db, 13);
  const msId = crypto.randomUUID();
  await insertMilestone(db, {
    id: msId,
    code: "conc_ms",
    metric: "qualified_referrals",
    threshold: 1,
    effectiveFrom: EFFECTIVE_FROM,
  });
  await insertQualified(db, {
    referralId: crypto.randomUUID(),
    referredId: crypto.randomUUID(),
    qualifiedAt: AFTER,
  });
  const results = await Promise.all(
    Array.from({ length: 10 }, () =>
      evaluateMilestonesForPartner(supabase, ctx.partnerId, { tierKey: "partner" })
    )
  );
  const newGrants = results.reduce(
    (sum, r) => sum + r.grants.filter((g) => g.milestoneId === msId).length,
    0
  );
  assert.ok(newGrants >= 1);
  assert.equal(await grantCount(db), 1);
});

t("14 mission metrics remain all-time while milestone metrics are windowed", async (db, supabase) => {
  await setupPartner(db, 14);
  await insertQualified(db, {
    referralId: crypto.randomUUID(),
    referredId: crypto.randomUUID(),
    qualifiedAt: BEFORE,
  });
  await insertQualified(db, {
    referralId: crypto.randomUUID(),
    referredId: crypto.randomUUID(),
    qualifiedAt: AFTER,
  });
  const allTime = await computePartnerMetrics(supabase, ctx.partnerId);
  const windowed = await computeMilestoneMetricValue(supabase, ctx.partnerId, "qualified_referrals", {
    startAt: EFFECTIVE_FROM,
  });
  assert.equal(allTime.qualifiedReferrals, 2);
  assert.equal(windowed, 1);
});

const db = await createPartnerTestDb();
const supabase = createServiceSupabaseFromDb(db);

let passed = 0;
let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn(db, supabase);
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`FAIL ${name}`, e.message);
  }
}

console.log(`\nMilestone effective window tests: ${passed} passed, ${failed} failed`);
await db.close();
process.exit(failed > 0 ? 1 : 0);
