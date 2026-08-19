#!/usr/bin/env node
/**
 * Performance bonus effective window tests (PGlite).
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

process.env.PARTNER_GROWTH_ENGINE = "true";

const EFFECTIVE_FROM = "2026-08-19T18:35:00.000Z";
const BEFORE = "2026-08-19T10:00:00.000Z";
const AFTER = "2026-08-19T19:00:00.000Z";

const ctx = { partnerId: null };

async function setupPartner(db, seq) {
  const partnerId = `22222222-2222-4222-8222-${String(seq).padStart(12, "0")}`;
  const userId = `bbbbbbbb-bbbb-4bbb-8bbb-${String(seq).padStart(12, "0")}`;
  ctx.partnerId = partnerId;
  await query(db, `INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT DO NOTHING`, [userId]);
  await query(
    db,
    `INSERT INTO partners (id, user_id, referral_code, status, tier_key, signup_count)
     VALUES ($1,$2,$3,'active','partner',0) ON CONFLICT DO NOTHING`,
    [partnerId, userId, `PB${seq}`]
  );
}

async function insertRule(db, { id, code, metric, threshold, effectiveFrom, effectiveTo, status = "active", minimumSample = 1 }) {
  await query(
    db,
    `INSERT INTO partner_performance_bonus_rules
      (id, code, name, metric, period_type, threshold_value, minimum_sample_size, reward_amount, status, rule_version, effective_from, effective_to, created_at)
     VALUES ($1,$2,$3,$4,'monthly',$5,$6,1,$7,1,$8,$9,$8)`,
    [id, code, code, metric, threshold, minimumSample, status, effectiveFrom, effectiveTo || null]
  );
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

async function resetRules(db) {
  await query(db, `DELETE FROM partner_performance_bonus_grants`);
  await query(db, `DELETE FROM partner_performance_bonus_rules`);
  await query(db, `DELETE FROM partner_financial_ledger_entries WHERE partner_id = $1`, [ctx.partnerId]);
}

const tests = [];
function t(name, fn) {
  tests.push([name, fn]);
}

t("1 historical revenue before effective_from ignored", async (db, supabase) => {
  await setupPartner(db, 1);
  await resetRules(db);
  await insertRevenue(db, 100, BEFORE);
  const ruleId = crypto.randomUUID();
  await insertRule(db, { id: ruleId, code: "rev50", metric: "confirmed_revenue", threshold: 50, effectiveFrom: EFFECTIVE_FROM });
  const r = await evaluatePerformanceBonusesForPartner(supabase, ctx.partnerId, { tierKey: "partner", at: new Date(AFTER) });
  assert.equal(r.grants.length, 0);
});

t("2 post-effective_from revenue counted once", async (db, supabase) => {
  await setupPartner(db, 2);
  await resetRules(db);
  await insertRevenue(db, 50, AFTER);
  const ruleId = crypto.randomUUID();
  await insertRule(db, { id: ruleId, code: "rev50b", metric: "confirmed_revenue", threshold: 50, effectiveFrom: EFFECTIVE_FROM });
  const r = await evaluatePerformanceBonusesForPartner(supabase, ctx.partnerId, { tierKey: "partner", at: new Date(AFTER) });
  assert.equal(r.grants.length, 1);
  const dup = await evaluatePerformanceBonusesForPartner(supabase, ctx.partnerId, { tierKey: "partner", at: new Date(AFTER) });
  assert.equal(dup.grants.length, 0);
});

t("3 conversion_rate requires minimum sample size", async (db, supabase) => {
  await setupPartner(db, 3);
  await resetRules(db);
  const ruleId = crypto.randomUUID();
  await insertRule(db, {
    id: ruleId,
    code: "conv",
    metric: "conversion_rate",
    threshold: 50,
    effectiveFrom: EFFECTIVE_FROM,
    minimumSample: 5,
  });
  const window = resolvePerformanceMetricWindow(
    { effective_from: EFFECTIVE_FROM, period_type: "monthly", created_at: EFFECTIVE_FROM },
    new Date(AFTER)
  );
  const metric = await computePerformanceMetricValue(supabase, ctx.partnerId, "conversion_rate", window);
  assert.equal(metric.denominator, 0);
  assert.equal(metric.value, 0);
  const r = await evaluatePerformanceBonusesForPartner(supabase, ctx.partnerId, { tierKey: "partner", at: new Date(AFTER) });
  assert.equal(r.grants.length, 0);
});

t("4 draft rule does not grant", async (db, supabase) => {
  await setupPartner(db, 4);
  await resetRules(db);
  await insertRevenue(db, 100, AFTER);
  await insertRule(db, {
    id: crypto.randomUUID(),
    code: "draft",
    metric: "confirmed_revenue",
    threshold: 10,
    effectiveFrom: EFFECTIVE_FROM,
    status: "draft",
  });
  const r = await evaluatePerformanceBonusesForPartner(supabase, ctx.partnerId, { tierKey: "partner", at: new Date(AFTER) });
  assert.equal(r.grants.length, 0);
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
console.log(`\nPerformance effective window: ${passed} passed, ${failed} failed`);
await db.close();
process.exit(failed > 0 ? 1 : 0);
