#!/usr/bin/env node
/**
 * Performance bonus effective window matrix E.1–E.15 (PGlite).
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createPartnerTestDb, query } from "./partner-center/test-db.mjs";
import { createServiceSupabaseFromDb } from "./partner-center/test-supabase-mock.mjs";
import {
  evaluatePerformanceBonusesForPartner,
  resolvePerformanceMetricWindow,
} from "../lib/partner-center/performance-bonus-engine.js";
import { computePerformanceMetricValue } from "../lib/partner-center/partner-metrics.js";
import { buildPeriodKey } from "../lib/partner-center/timezone.js";
import { evaluatePartnerRewardEligibility, REWARD_TYPES } from "../lib/partner-center/partner-reward-eligibility.js";
import { USER_CLASSIFICATION } from "../lib/user-classification.js";

process.env.PARTNER_GROWTH_ENGINE = "true";
process.env.PARTNER_ANTI_ABUSE_GATE_ENABLED = "true";
process.env.HUMAN_VERIFICATION_ENABLED = "true";

const EFFECTIVE_FROM = "2026-08-19T18:35:00.000Z";
const EFFECTIVE_TO = "2026-08-19T20:00:00.000Z";
const BEFORE = "2026-07-01T10:00:00.000Z";
const AFTER = "2026-08-19T19:00:00.000Z";
const AFTER_WINDOW = "2026-08-19T21:00:00.000Z";

const ctx = { partnerId: null, userId: null };

async function setupPartner(db, seq, { classification = "real", hv = "verified" } = {}) {
  const partnerId = `22222222-2222-4222-8222-${String(seq).padStart(12, "0")}`;
  const userId = `bbbbbbbb-bbbb-4bbb-8bbb-${String(seq).padStart(12, "0")}`;
  ctx.partnerId = partnerId;
  ctx.userId = userId;
  await query(db, `DELETE FROM partner_performance_bonus_grants WHERE partner_id = $1`, [partnerId]);
  await query(db, `DELETE FROM partner_reward_entitlements WHERE partner_id = $1`, [partnerId]);
  await query(db, `DELETE FROM partner_financial_ledger_entries WHERE partner_id = $1`, [partnerId]);
  await query(
    db,
    `INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ($1,$2,now()) ON CONFLICT (id) DO UPDATE SET email_confirmed_at = now()`,
    [userId, `perf${seq}@example.com`]
  );
  await query(
    db,
    `INSERT INTO partners (id, user_id, referral_code, status, tier_key, signup_count)
     VALUES ($1,$2,$3,'active','partner',0) ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id`,
    [partnerId, userId, `PB${seq}`]
  );
  await query(
    db,
    `INSERT INTO profiles (id, email, user_classification, effective_user_classification, human_verification_status)
     VALUES ($1,$2,$3,$3,$4)
     ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email,
       user_classification = EXCLUDED.user_classification,
       effective_user_classification = EXCLUDED.effective_user_classification,
       human_verification_status = EXCLUDED.human_verification_status`,
    [userId, `perf${seq}@example.com`, classification, hv]
  );
}

async function resetRules(db) {
  await query(db, `DELETE FROM partner_performance_bonus_grants`);
  await query(db, `DELETE FROM partner_performance_bonus_rules`);
}

async function insertRule(db, opts) {
  const {
    id = crypto.randomUUID(),
    code,
    metric,
    threshold,
    effectiveFrom = EFFECTIVE_FROM,
    effectiveTo = null,
    status = "active",
    minimumSample = 1,
    periodType = "monthly",
    rewardAmount = 1,
  } = opts;
  await query(
    db,
    `INSERT INTO partner_performance_bonus_rules
      (id, code, name, metric, period_type, threshold_value, minimum_sample_size, reward_amount, status, rule_version, effective_from, effective_to, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10,$11,$10)`,
    [id, code, code, metric, periodType, threshold, minimumSample, rewardAmount, status, effectiveFrom, effectiveTo]
  );
  return id;
}

async function insertRevenue(db, amount, createdAt) {
  await query(
    db,
    `INSERT INTO partner_financial_ledger_entries
      (id, partner_id, entry_type, entry_direction, amount, currency, lifecycle_status, balance_bucket, idempotency_key, created_at)
     VALUES ($1,$2,'commission','credit',$3,'USD','approved','withdrawable',$4,$5)`,
    [crypto.randomUUID(), ctx.partnerId, amount, `rev-${crypto.randomUUID()}`, createdAt]
  );
}

async function insertQualified(db, { referralId, referredId, qualifiedAt, state = "qualified" }) {
  await query(db, `INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ($1,$2,now()) ON CONFLICT DO NOTHING`, [
    referredId,
    `${referredId}@example.com`,
  ]);
  await query(
    db,
    `INSERT INTO partner_referrals (id, partner_id, referred_user_id, referral_code, referred_username, status, registered_at)
     VALUES ($1,$2,$3,'PBREF','ref','registered',$4) ON CONFLICT DO NOTHING`,
    [referralId, ctx.partnerId, referredId, qualifiedAt]
  );
  await query(
    db,
    `INSERT INTO partner_referral_qualifications (referral_id, partner_id, referred_user_id, state, qualified_at)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (referral_id) DO UPDATE SET state = EXCLUDED.state, qualified_at = EXCLUDED.qualified_at`,
    [referralId, ctx.partnerId, referredId, state, qualifiedAt]
  );
}

async function insertCustomer(db, { referralId, referredId, customerAt }) {
  await insertQualified(db, { referralId, referredId, qualifiedAt: customerAt, state: "customer" });
  await query(
    db,
    `INSERT INTO partner_qualification_transitions (referral_id, partner_id, from_state, to_state, reason, created_at)
     VALUES ($1,$2,'qualified','customer','service_purchase',$3)`,
    [referralId, ctx.partnerId, customerAt]
  );
}

async function grantCount(db) {
  const r = await query(db, `SELECT count(*)::int c FROM partner_performance_bonus_grants WHERE partner_id = $1`, [
    ctx.partnerId,
  ]);
  return r.rows[0].c;
}

async function entitlementCount(db) {
  const r = await query(
    db,
    `SELECT count(*)::int c FROM partner_reward_entitlements WHERE partner_id = $1 AND reward_type = 'performance_bonus'`,
    [ctx.partnerId]
  );
  return r.rows[0].c;
}

async function creditedLedgerCount(db) {
  const r = await query(
    db,
    `SELECT count(*)::int c FROM partner_financial_ledger_entries WHERE partner_id = $1 AND entry_type = 'performance_bonus'`,
    [ctx.partnerId]
  );
  return r.rows[0].c;
}

const tests = [];
function t(id, name, fn) {
  tests.push([id, name, fn]);
}

t("E.1", "historical revenue before effective_from ignored", async (db, supabase) => {
  await resetRules(db);
  await setupPartner(db, 1);
  await insertRevenue(db, 100, BEFORE);
  await insertRule(db, { code: "e1", metric: "confirmed_revenue", threshold: 50 });
  const r = await evaluatePerformanceBonusesForPartner(supabase, ctx.partnerId, { tierKey: "partner", at: new Date(AFTER) });
  assert.equal(r.grants.length, 0);
});

t("E.2", "post-effective_from revenue counted", async (db, supabase) => {
  await resetRules(db);
  await setupPartner(db, 2);
  await insertRevenue(db, 50, AFTER);
  await insertRule(db, { code: "e2", metric: "confirmed_revenue", threshold: 50 });
  const r = await evaluatePerformanceBonusesForPartner(supabase, ctx.partnerId, { tierKey: "partner", at: new Date(AFTER) });
  assert.equal(r.grants.length, 1);
});

t("E.3", "post-effective_to revenue ignored", async (db, supabase) => {
  await resetRules(db);
  await setupPartner(db, 3);
  await insertRule(db, { code: "e3", metric: "confirmed_revenue", threshold: 10, effectiveTo: EFFECTIVE_TO });
  await insertRevenue(db, 100, AFTER_WINDOW);
  const window = resolvePerformanceMetricWindow(
    { effective_from: EFFECTIVE_FROM, effective_to: EFFECTIVE_TO, period_type: "monthly", created_at: EFFECTIVE_FROM },
    new Date(AFTER_WINDOW)
  );
  const metric = await computePerformanceMetricValue(supabase, ctx.partnerId, "confirmed_revenue", window);
  assert.equal(metric.value, 0);
  const r = await evaluatePerformanceBonusesForPartner(supabase, ctx.partnerId, { tierKey: "partner", at: new Date(AFTER_WINDOW) });
  assert.equal(r.grants.length, 0);
});

t("E.4", "historical qualified referrals ignored", async (db, supabase) => {
  await resetRules(db);
  await setupPartner(db, 4);
  for (let i = 0; i < 5; i += 1) {
    await insertQualified(db, { referralId: crypto.randomUUID(), referredId: crypto.randomUUID(), qualifiedAt: BEFORE });
  }
  await insertRule(db, { code: "e4", metric: "qualified_referrals", threshold: 3 });
  const r = await evaluatePerformanceBonusesForPartner(supabase, ctx.partnerId, { tierKey: "partner", at: new Date(AFTER) });
  assert.equal(r.grants.length, 0);
});

t("E.5", "historical customers ignored", async (db, supabase) => {
  await resetRules(db);
  await setupPartner(db, 5);
  await insertCustomer(db, { referralId: crypto.randomUUID(), referredId: crypto.randomUUID(), customerAt: BEFORE });
  await insertRule(db, { code: "e5", metric: "customers", threshold: 1 });
  const r = await evaluatePerformanceBonusesForPartner(supabase, ctx.partnerId, { tierKey: "partner", at: new Date(AFTER) });
  assert.equal(r.grants.length, 0);
});

t("E.6", "threshold completion exactly once", async (db, supabase) => {
  await resetRules(db);
  await setupPartner(db, 6);
  await insertRevenue(db, 49, AFTER);
  await insertRule(db, { code: "e6", metric: "confirmed_revenue", threshold: 50 });
  assert.equal((await evaluatePerformanceBonusesForPartner(supabase, ctx.partnerId, { tierKey: "partner", at: new Date(AFTER) })).grants.length, 0);
  await insertRevenue(db, 1, AFTER);
  assert.equal((await evaluatePerformanceBonusesForPartner(supabase, ctx.partnerId, { tierKey: "partner", at: new Date(AFTER) })).grants.length, 1);
  assert.equal(await grantCount(db), 1);
});

t("E.7", "duplicate evaluation creates no second payout", async (db, supabase) => {
  await resetRules(db);
  await setupPartner(db, 7);
  await insertRevenue(db, 50, AFTER);
  await insertRule(db, { code: "e7", metric: "confirmed_revenue", threshold: 50 });
  await evaluatePerformanceBonusesForPartner(supabase, ctx.partnerId, { tierKey: "partner", at: new Date(AFTER) });
  await evaluatePerformanceBonusesForPartner(supabase, ctx.partnerId, { tierKey: "partner", at: new Date(AFTER) });
  assert.equal(await grantCount(db), 1);
  assert.equal(await entitlementCount(db), 1);
  const ledgerCount = await creditedLedgerCount(db);
  assert.ok(ledgerCount <= 1, "at most one ledger credit");
  assert.equal((await query(db, `SELECT count(*)::int c FROM partner_reward_entitlements WHERE partner_id = $1 AND reward_type = 'performance_bonus'`, [ctx.partnerId])).rows[0].c, 1);
});

t("E.8", "period rollover keys differ by period type", async () => {
  const at = new Date("2026-08-19T12:00:00.000Z");
  const daily = buildPeriodKey("daily", at);
  const weekly = buildPeriodKey("weekly", at);
  const monthly = buildPeriodKey("monthly", at);
  assert.notEqual(daily, weekly);
  assert.notEqual(weekly, monthly);
  assert.match(daily, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(monthly, /^\d{4}-\d{2}$/);
});

t("E.9", "paused rule no payout", async (db, supabase) => {
  await resetRules(db);
  await setupPartner(db, 9);
  await insertRevenue(db, 100, AFTER);
  await insertRule(db, { code: "e9", metric: "confirmed_revenue", threshold: 10, status: "paused" });
  const r = await evaluatePerformanceBonusesForPartner(supabase, ctx.partnerId, { tierKey: "partner", at: new Date(AFTER) });
  assert.equal(r.grants.length, 0);
});

t("E.10", "draft rule no payout", async (db, supabase) => {
  await resetRules(db);
  await setupPartner(db, 10);
  await insertRevenue(db, 100, AFTER);
  await insertRule(db, { code: "e10", metric: "confirmed_revenue", threshold: 10, status: "draft" });
  const r = await evaluatePerformanceBonusesForPartner(supabase, ctx.partnerId, { tierKey: "partner", at: new Date(AFTER) });
  assert.equal(r.grants.length, 0);
});

t("E.11", "reactivation does not retroactively catch up", async (db, supabase) => {
  await resetRules(db);
  await setupPartner(db, 11);
  await insertRevenue(db, 100, BEFORE);
  const ruleId = await insertRule(db, { code: "e11", metric: "confirmed_revenue", threshold: 50, status: "paused" });
  await query(db, `UPDATE partner_performance_bonus_rules SET status = 'active' WHERE id = $1`, [ruleId]);
  const r = await evaluatePerformanceBonusesForPartner(supabase, ctx.partnerId, { tierKey: "partner", at: new Date(AFTER) });
  assert.equal(r.grants.length, 0);
});

t("E.12", "conversion_rate numerator/denominator windowed", async (db, supabase) => {
  await resetRules(db);
  await setupPartner(db, 12);
  await query(db, `DELETE FROM partner_qualification_transitions WHERE partner_id = $1`, [ctx.partnerId]);
  await query(db, `DELETE FROM partner_referral_qualifications WHERE partner_id = $1`, [ctx.partnerId]);
  await query(db, `DELETE FROM partner_referrals WHERE partner_id = $1`, [ctx.partnerId]);
  const refId = crypto.randomUUID();
  const referredId = crypto.randomUUID();
  await query(db, `INSERT INTO auth.users (id, email) VALUES ($1,'cust12@e.com') ON CONFLICT DO NOTHING`, [referredId]);
  await query(
    db,
    `INSERT INTO partner_referrals (id, partner_id, referred_user_id, referral_code, referred_username, status, registered_at)
     VALUES ($1,$2,$3,'PB12','cust','registered',$4)`,
    [refId, ctx.partnerId, referredId, AFTER]
  );
  await query(
    db,
    `INSERT INTO partner_referral_qualifications (referral_id, partner_id, referred_user_id, state, qualified_at)
     VALUES ($1,$2,$3,'customer',$4)`,
    [refId, ctx.partnerId, referredId, AFTER]
  );
  await query(
    db,
    `INSERT INTO partner_qualification_transitions (referral_id, partner_id, from_state, to_state, reason, created_at)
     VALUES ($1,$2,'qualified','customer','service_purchase',$3)`,
    [refId, ctx.partnerId, AFTER]
  );
  const window = resolvePerformanceMetricWindow(
    { effective_from: EFFECTIVE_FROM, period_type: "monthly", created_at: EFFECTIVE_FROM },
    new Date(AFTER)
  );
  const metric = await computePerformanceMetricValue(supabase, ctx.partnerId, "conversion_rate", window);
  assert.equal(metric.numerator, 1);
  assert.ok(metric.denominator >= 1);
  assert.equal(metric.value, Math.round((metric.numerator / metric.denominator) * 100));
});

t("E.13", "minimum_sample_size enforced", async (db, supabase) => {
  await resetRules(db);
  await setupPartner(db, 13);
  await insertCustomer(db, { referralId: crypto.randomUUID(), referredId: crypto.randomUUID(), customerAt: AFTER });
  const signupId = crypto.randomUUID();
  await query(db, `INSERT INTO auth.users (id, email) VALUES ($1,'s13@e.com') ON CONFLICT DO NOTHING`, [signupId]);
  await query(
    db,
    `INSERT INTO partner_referrals (id, partner_id, referred_user_id, referral_code, referred_username, status, registered_at)
     VALUES ($1,$2,$3,'PB13','s1','registered',$4)`,
    [crypto.randomUUID(), ctx.partnerId, signupId, AFTER]
  );
  await insertRule(db, { code: "e13", metric: "conversion_rate", threshold: 50, minimumSample: 5 });
  const r = await evaluatePerformanceBonusesForPartner(supabase, ctx.partnerId, { tierKey: "partner", at: new Date(AFTER) });
  assert.equal(r.grants.length, 0);
});

t("E.14", "TEST/E2E/INTERNAL/UNVERIFIED blocked from payout", async (db, supabase) => {
  for (const [seq, classification] of [
    [141, USER_CLASSIFICATION.TEST],
    [142, USER_CLASSIFICATION.E2E],
    [143, USER_CLASSIFICATION.INTERNAL],
  ]) {
    await resetRules(db);
    await setupPartner(db, seq, { classification, hv: "verified" });
    await insertRevenue(db, 100, AFTER);
    await insertRule(db, { code: `e14-${classification}`, metric: "confirmed_revenue", threshold: 10 });
    const r = await evaluatePerformanceBonusesForPartner(supabase, ctx.partnerId, { tierKey: "partner", at: new Date(AFTER) });
    assert.equal(r.grants.filter((g) => g.reward?.credited).length, 0, classification);
    assert.equal(await creditedLedgerCount(db), 0, classification);
  }
  await setupPartner(db, 144, { classification: "real", hv: "unverified" });
  await resetRules(db);
  const elig = await evaluatePartnerRewardEligibility(supabase, {
    partnerId: ctx.partnerId,
    rewardType: REWARD_TYPES.MISSION,
    sourceId: crypto.randomUUID(),
    amount: 1,
  });
  assert.equal(elig.eligible, false);
});

t("E.15", "SUSPECTED/UNKNOWN fail closed to manual review", async (db, supabase) => {
  for (const [seq, classification] of [
    [151, USER_CLASSIFICATION.SUSPECTED],
    [152, USER_CLASSIFICATION.UNKNOWN],
  ]) {
    await resetRules(db);
    await setupPartner(db, seq, { classification, hv: "verified" });
    const elig = await evaluatePartnerRewardEligibility(supabase, {
      partnerId: ctx.partnerId,
      rewardType: REWARD_TYPES.MISSION,
      sourceId: crypto.randomUUID(),
      amount: 1,
    });
    assert.equal(elig.eligible, false);
    assert.ok(elig.holdRequired);
    await insertRevenue(db, 100, AFTER);
    await insertRule(db, { code: `e15-${classification}`, metric: "confirmed_revenue", threshold: 10 });
    const r = await evaluatePerformanceBonusesForPartner(supabase, ctx.partnerId, { tierKey: "partner", at: new Date(AFTER) });
    assert.equal(await creditedLedgerCount(db), 0, classification);
    assert.ok(r.grants.length === 0 || !r.grants[0]?.reward?.credited, classification);
  }
});

const db = await createPartnerTestDb();
const supabase = createServiceSupabaseFromDb(db);
let passed = 0;
let failed = 0;
const results = [];
for (const [id, name, fn] of tests) {
  try {
    await fn(db, supabase);
    passed += 1;
    results.push({ id, status: "PASS" });
    console.log(`PASS ${id} ${name}`);
  } catch (e) {
    failed += 1;
    results.push({ id, status: "FAIL", error: e.message });
    console.error(`FAIL ${id} ${name}`, e.message);
  }
}
console.log(`\nPerformance effective window E.1–E.15: ${passed} passed, ${failed} failed`);
await db.close();
process.exit(failed > 0 ? 1 : 0);
