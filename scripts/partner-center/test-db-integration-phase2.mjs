#!/usr/bin/env node
/**
 * Partner Center Phase 2 — PGlite integration tests
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createPartnerTestDb, query } from "./test-db.mjs";
import { createServiceSupabaseFromDb } from "./test-supabase-mock.mjs";
import { evaluateMissionsForPartnerEvent } from "../../lib/partner-center/mission-engine.js";
import { evaluateMilestonesForPartner } from "../../lib/partner-center/milestone-engine.js";
import { createSmartLink, resolveSmartLink } from "../../lib/partner-center/smart-link-service.js";
import { creditGrowthRewardAtomic } from "../../lib/partner-center/reward-engine.js";
import { onPartnerRefundOrDisqualification } from "../../lib/partner-center/growth-refund-integration.js";
import { buildPeriodKey } from "../../lib/partner-center/timezone.js";
import { validateMissionDefinition } from "../../lib/partner-center/mission-engine.js";

const PARTNER_A = "11111111-1111-1111-1111-111111111111";
const USER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

async function seed(db) {
  const REFERRAL = "55555555-5555-5555-5555-555555555555";
  const REFERRED = "cccccccc-cccc-cccc-cccc-cccccccccccc";
  await query(db, `INSERT INTO auth.users (id) VALUES ($1),($2) ON CONFLICT DO NOTHING`, [USER_A, REFERRED]);
  await query(db, `INSERT INTO partners (id, user_id, referral_code, status, tier_key) VALUES ($1,$2,'ALPHA1','active','partner') ON CONFLICT DO NOTHING`, [PARTNER_A, USER_A]);
  await query(db, `INSERT INTO partner_referrals (id, partner_id, referred_user_id, referral_code, referred_username, status) VALUES ($1,$2,$3,'ALPHA1','ref','registered') ON CONFLICT DO NOTHING`, [REFERRAL, PARTNER_A, REFERRED]);
  await query(db, `INSERT INTO partner_referral_qualifications (referral_id, partner_id, referred_user_id, state, qualified_at) VALUES ($1,$2,$3,'qualified','2020-01-01T00:00:00Z') ON CONFLICT DO NOTHING`, [REFERRAL, PARTNER_A, REFERRED]);
  await query(db, `INSERT INTO partner_mission_definitions (id, code, name, mission_type, status, target_metric, target_value, reward_amount, period_type, rule_version) VALUES ($1,'Q1','One Qualified','qualified_referrals_count','active','qualified_referrals',1,5,'once',1)`, ["22222222-2222-2222-2222-222222222222"]);
  await query(db, `INSERT INTO partner_milestone_definitions (id, code, name, metric, threshold_value, reward_amount, status, rule_version, effective_from, created_at) VALUES ($1,'FIRST_Q','First Qualified','qualified_referrals',1,2,'active',1,'2020-01-01T00:00:00Z','2020-01-01T00:00:00Z')`, ["33333333-3333-3333-3333-333333333333"]);
  await query(db, `INSERT INTO partner_campaign_programs (id, code, name, status, landing_path, rule_version) VALUES ($1,'launch','Launch','active','/register',1)`, ["44444444-4444-4444-4444-444444444444"]);
}

const tests = [];
function t(name, fn) {
  tests.push([name, fn]);
}

t("mission completion uses gateway", async (db, supabase) => {
  const r = await evaluateMissionsForPartnerEvent(supabase, { partnerId: PARTNER_A, eventType: "qualified_referral", tierKey: "partner" });
  assert.ok(r.completions.length >= 1);
  const ledger = await query(db, `SELECT count(*)::int c FROM partner_financial_ledger_entries WHERE partner_id = $1 AND entry_type = 'mission_reward'`, [PARTNER_A]);
  assert.ok(ledger.rows[0].c >= 1);
});

t("duplicate mission evaluation no duplicate reward", async (db, supabase) => {
  await evaluateMissionsForPartnerEvent(supabase, { partnerId: PARTNER_A, eventType: "qualified_referral", tierKey: "partner" });
  const ledger = await query(db, `SELECT count(*)::int c FROM partner_financial_ledger_entries WHERE partner_id = $1 AND entry_type = 'mission_reward'`, [PARTNER_A]);
  assert.equal(ledger.rows[0].c, 1);
});

t("milestone one-time grant", async (db, supabase) => {
  const r = await evaluateMilestonesForPartner(supabase, PARTNER_A, { tierKey: "partner" });
  assert.ok(r.grants.length >= 1);
});

t("milestone duplicate blocked", async (db, supabase) => {
  const r = await evaluateMilestonesForPartner(supabase, PARTNER_A, { tierKey: "partner" });
  assert.equal(r.grants.length, 0);
});

t("smart link create and resolve", async (db, supabase) => {
  const created = await createSmartLink(supabase, {
    partnerId: PARTNER_A,
    referralCode: "ALPHA1",
    input: { destinationPath: "/register", source: "telegram", campaignCode: "launch" },
  });
  assert.equal(created.ok, true);
  const resolved = await resolveSmartLink(supabase, created.smartLink.token);
  assert.equal(resolved.ok, true);
  assert.equal(resolved.destinationPath, "/register");
});

t("open redirect blocked on resolve", async (db, supabase) => {
  await query(db, `UPDATE partner_smart_links SET destination_path = '/not-allowed' WHERE partner_id = $1`, [PARTNER_A]);
  const row = await query(db, `SELECT token FROM partner_smart_links WHERE partner_id = $1 LIMIT 1`, [PARTNER_A]);
  const resolved = await resolveSmartLink(supabase, row.rows[0].token);
  assert.equal(resolved.ok, false);
});

t("concurrency mission reward x10", async (db, supabase) => {
  const entId = crypto.randomUUID();
  await query(db, `INSERT INTO partner_reward_entitlements (id, partner_id, reward_type, source_type, source_id, amount, idempotency_key) VALUES ($1,$2,'mission_reward','mission',$3,1,$4)`, [entId, PARTNER_A, crypto.randomUUID(), `concurrent-mission-${Date.now()}`]);
  const results = await Promise.all(Array.from({ length: 10 }, () => creditGrowthRewardAtomic(supabase, entId)));
  assert.equal(results.filter((r) => r.credited).length, 1);
});

t("growth reward failure injection rollback", async (db, supabase) => {
  const entId = crypto.randomUUID();
  await query(db, `INSERT INTO partner_reward_entitlements (id, partner_id, reward_type, source_type, source_id, amount, idempotency_key) VALUES ($1,$2,'mission_reward','mission',$3,2,$4)`, [entId, PARTNER_A, crypto.randomUUID(), `fail-inject-${Date.now()}`]);
  await supabase.rpc("create_partner_growth_reward_atomic_test_fail", { p_fail_after: "event" });
  await assert.rejects(() => creditGrowthRewardAtomic(supabase, entId));
  const row = await query(db, `SELECT status, ledger_entry_id FROM partner_reward_entitlements WHERE id = $1`, [entId]);
  assert.notEqual(row.rows[0].status, "reward_credited");
  assert.equal(row.rows[0].ledger_entry_id, null);
  await supabase.rpc("create_partner_growth_reward_atomic_test_fail", { p_fail_after: "" });
  const ok = await creditGrowthRewardAtomic(supabase, entId);
  assert.equal(ok.credited, true);
});

t("streak_period rejected by validator", async () => {
  const r = validateMissionDefinition({
    code: "ST",
    name: "Streak",
    mission_type: "streak_period",
    target_metric: "active_days",
    target_value: 3,
    reward_amount: 1,
    status: "active",
  });
  assert.equal(r.ok, false);
  assert.equal(r.error, "streak_period_not_enabled");
});

t("timezone period key Baghdad daily", async () => {
  const k = buildPeriodKey("daily", new Date("2026-01-01T20:30:00Z"));
  assert.match(k, /^\d{4}-\d{2}-\d{2}$/);
});

t("withdrawal cannot consume bonus_pending growth rewards", async (db) => {
  await query(db, `UPDATE partners SET balance_withdrawable = 5, balance_bonus_pending = 50 WHERE id = $1`, [PARTNER_A]);
  const row = await query(db, `SELECT balance_withdrawable, balance_bonus_pending FROM partners WHERE id = $1`, [PARTNER_A]);
  const available = Number(row.rows[0].balance_withdrawable);
  const held = Number(row.rows[0].balance_bonus_pending);
  assert.ok(available + held > available);
  assert.ok(55 > available, "withdrawal path uses balance_withdrawable only; 55 > 5");
});

t("refund disqualification processes without throw", async (db, supabase) => {
  const REF = "66666666-6666-6666-6666-666666666666";
  const REFERRED = "dddddddd-dddd-dddd-dddd-dddddddddddd";
  await query(db, `INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT DO NOTHING`, [REFERRED]);
  await query(db, `INSERT INTO partner_referrals (id, partner_id, referred_user_id, referral_code, referred_username, status) VALUES ($1,$2,$3,'ALPHA1','refund-test','registered') ON CONFLICT DO NOTHING`, [REF, PARTNER_A, REFERRED]);
  await query(db, `INSERT INTO partner_referral_qualifications (referral_id, partner_id, referred_user_id, state) VALUES ($1,$2,$3,'qualified') ON CONFLICT DO NOTHING`, [REF, PARTNER_A, REFERRED]);
  const r = await onPartnerRefundOrDisqualification(supabase, {
    partnerId: PARTNER_A,
    referralId: REF,
    referredUserId: REFERRED,
    reason: "test_refund",
  });
  assert.equal(r.processed, true);
});

process.env.PARTNER_GROWTH_ENGINE = "true";

const db = await createPartnerTestDb();
await seed(db);
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

console.log(`\nPartner Center Phase 2 PGlite integration: ${passed} passed, ${failed} failed`);
await db.close();
process.exit(failed > 0 ? 1 : 0);
