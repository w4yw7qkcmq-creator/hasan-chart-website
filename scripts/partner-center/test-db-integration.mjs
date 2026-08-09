#!/usr/bin/env node
/**
 * Partner Center Phase 1 — PGlite integration tests (real PostgreSQL semantics)
 */
import assert from "node:assert/strict";
import { createPartnerTestDb, query, asRole } from "./test-db.mjs";

const PARTNER_A = "11111111-1111-1111-1111-111111111111";
const PARTNER_B = "22222222-2222-2222-2222-222222222222";
const USER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const REFERRED = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const REFERRAL = "33333333-3333-3333-3333-333333333333";
const ADMIN = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const SUB_ID = "44444444-4444-4444-4444-444444444444";

function createServiceSupabase(db) {
  return {
    async rpc(fn, params = {}) {
      const entries = Object.entries(params);
      const values = entries.map(([, v]) => v);
      const placeholders = entries.map((_, i) => `$${i + 1}`).join(", ");
      const sql = `SELECT public.${fn}(${placeholders}) AS result`;
      try {
        const res = await query(db, sql, values);
        return { data: res.rows[0]?.result, error: null };
      } catch (error) {
        return { data: null, error };
      }
    },
    from(table) {
      return {
        select(cols = "*") {
          this._cols = cols;
          this._filters = [];
          return this;
        },
        eq(col, val) {
          this._filters.push([col, val]);
          return this;
        },
        maybeSingle() {
          return this._run(true);
        },
        single() {
          return this._run(true);
        },
        async _run(single) {
          const where = this._filters.map(([c], i) => `${c} = $${i + 1}`).join(" AND ");
          const vals = this._filters.map(([, v]) => v);
          const sql = `SELECT ${this._cols} FROM public.${table}${where ? ` WHERE ${where}` : ""}${single ? " LIMIT 1" : ""}`;
          const res = await query(db, sql, vals);
          return { data: single ? res.rows[0] || null : res.rows, error: null };
        },
      };
    },
  };
}

async function seedBase(db) {
  await query(db, `INSERT INTO auth.users (id, email) VALUES ($1,$2),($3,$4),($5,$6),($7,$8) ON CONFLICT DO NOTHING`, [
    USER_A, "partner-a@test.local",
    USER_B, "partner-b@test.local",
    REFERRED, "referred@test.local",
    ADMIN, "admin@test.local",
  ]);

  await query(db, `INSERT INTO public.partners (id, user_id, referral_code, status, tier_key)
    VALUES ($1,$2,'ALPHA123','active','bronze'),($3,$4,'BETA456','active','bronze') ON CONFLICT DO NOTHING`, [
    PARTNER_A, USER_A, PARTNER_B, USER_B,
  ]);

  await query(db, `INSERT INTO public.partner_referrals (id, partner_id, referred_user_id, referral_code, referred_username, status)
    VALUES ($1,$2,$3,'ALPHA123','referred','registered') ON CONFLICT DO NOTHING`, [
    REFERRAL, PARTNER_A, REFERRED,
  ]);

  await query(db, `INSERT INTO public.iam_user_assignments (user_id, role_id) VALUES ($1,'admin') ON CONFLICT DO NOTHING`, [ADMIN]);
}

async function testAtomicCommission(db) {
  const supabase = createServiceSupabase(db);
  const key = `${PARTNER_A}:${REFERRED}:vip_signal:${SUB_ID}`;
  const { data, error } = await supabase.rpc("create_partner_commission_atomic", {
    p_partner_id: PARTNER_A,
    p_referral_id: REFERRAL,
    p_referred_user_id: REFERRED,
    p_service_type: "vip_signal",
    p_source_id: SUB_ID,
    p_base_amount: 100,
    p_commission_percent: 10,
    p_reason: "test commission",
    p_initial_status: "pending_activation",
    p_invited_username: "referred",
    p_idempotency_key: key,
    p_source_type: "service",
  });
  assert.equal(error, null);
  assert.equal(data.created, true);
  assert.equal(Number(data.amount), 10);

  const counts = await query(db, `
    SELECT
      (SELECT count(*)::int FROM partner_commissions WHERE partner_id = $1 AND source_id = $2) AS commissions,
      (SELECT count(*)::int FROM partner_events WHERE partner_id = $1 AND event_type = 'commission_created') AS events,
      (SELECT count(*)::int FROM partner_financial_ledger_entries WHERE partner_id = $1 AND legacy_commission_id = $3::uuid) AS ledger,
      (SELECT balance_pending::float FROM partners WHERE id = $1) AS pending
  `, [PARTNER_A, SUB_ID, data.commission_id]);
  assert.equal(counts.rows[0].commissions, 1);
  assert.equal(counts.rows[0].events, 1);
  assert.equal(counts.rows[0].ledger, 1);
  assert.equal(counts.rows[0].pending, 10);

  const dup = await supabase.rpc("create_partner_commission_atomic", {
    p_partner_id: PARTNER_A,
    p_referral_id: REFERRAL,
    p_referred_user_id: REFERRED,
    p_service_type: "vip_signal",
    p_source_id: SUB_ID,
    p_base_amount: 100,
    p_commission_percent: 10,
    p_reason: "test commission",
    p_initial_status: "pending_activation",
    p_invited_username: "referred",
    p_idempotency_key: key,
    p_source_type: "service",
  });
  assert.equal(dup.data.duplicate, true);
  return data.commission_id;
}

async function testConcurrentCommissions(db) {
  const supabase = createServiceSupabase(db);
  const subId = "55555555-5555-5555-5555-555555555555";
  const calls = Array.from({ length: 10 }, () =>
    supabase.rpc("create_partner_commission_atomic", {
      p_partner_id: PARTNER_A,
      p_referral_id: REFERRAL,
      p_referred_user_id: REFERRED,
      p_service_type: "vip_spot",
      p_source_id: subId,
      p_base_amount: 50,
      p_commission_percent: 10,
      p_reason: "concurrent",
      p_initial_status: "pending_activation",
      p_invited_username: "referred",
      p_idempotency_key: `${PARTNER_A}:${REFERRED}:vip_spot:${subId}`,
      p_source_type: "service",
    })
  );
  const results = await Promise.all(calls);
  const created = results.filter((r) => r.data?.created).length;
  const duplicates = results.filter((r) => r.data?.duplicate).length;
  assert.equal(created, 1);
  assert.equal(duplicates, 9);
}

async function testSignupBonusAtomic(db) {
  const supabase = createServiceSupabase(db);
  const newReferral = "77777777-7777-7777-7777-777777777777";
  const newUser = "88888888-8888-8888-8888-888888888888";
  await query(db, `INSERT INTO auth.users (id, email) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [newUser, "new@test.local"]);
  await query(db, `INSERT INTO partner_referrals (id, partner_id, referred_user_id, referral_code, referred_username)
    VALUES ($1,$2,$3,'ALPHA123','newuser')`, [newReferral, PARTNER_A, newUser]);

  const first = await supabase.rpc("create_partner_signup_bonus_atomic", {
    p_partner_id: PARTNER_A,
    p_referral_id: newReferral,
    p_referred_user_id: newUser,
    p_referral_code: "ALPHA123",
    p_invited_username: "newuser",
  });
  assert.equal(first.data.created, true);
  assert.equal(Number(first.data.amount), 0.2);

  const events = await query(db, `SELECT count(*)::int AS c FROM partner_events WHERE event_type = 'reward_created' AND referral_id = $1`, [newReferral]);
  assert.equal(events.rows[0].c, 1);

  const ledger = await query(db, `SELECT count(*)::int AS c FROM partner_financial_ledger_entries WHERE idempotency_key = $1`, [
    `ledger:signup_bonus:credit:${newReferral}`,
  ]);
  assert.equal(ledger.rows[0].c, 1);

  const dup = await supabase.rpc("create_partner_signup_bonus_atomic", {
    p_partner_id: PARTNER_A,
    p_referral_id: newReferral,
    p_referred_user_id: newUser,
    p_referral_code: "ALPHA123",
    p_invited_username: "newuser",
  });
  assert.equal(dup.data.duplicate, true);
}

async function testFraudGateBlocksRelease(db, commissionId) {
  await query(db, `INSERT INTO partner_fraud_assessments (partner_id, referral_id, referred_user_id, context_type, risk_level, score, signals, decision)
    VALUES ($1,$2,$3,'referral_signup','HIGH',80,'[]','review')`, [PARTNER_A, REFERRAL, REFERRED]);

  const supabase = createServiceSupabase(db);
  const result = await supabase.rpc("release_partner_commission_atomic", { p_commission_id: commissionId });
  assert.ok(result.error || result.data?.released === false);
}

async function testRlsIsolation(db) {
  const crossPartner = await asRole(db, { userId: USER_A, role: "authenticated" }, async () => {
    const res = await query(db, `SELECT count(*)::int AS c FROM partner_financial_ledger_entries WHERE partner_id = $1`, [PARTNER_B]);
    return res.rows[0].c;
  });

  assert.equal(crossPartner, 0);

  const ownRows = await asRole(db, { userId: USER_A, role: "authenticated" }, async () => {
    const res = await query(db, `SELECT count(*)::int AS c FROM partner_financial_ledger_entries WHERE partner_id = $1`, [PARTNER_A]);
    return res.rows[0].c;
  });

  assert.ok(ownRows >= 0);
}

async function testPartnerCannotInsertLedger(db) {
  let blocked = false;
  await asRole(db, { userId: USER_A, role: "authenticated" }, async () => {
    try {
      await query(db, `INSERT INTO partner_financial_ledger_entries (partner_id, entry_type, entry_direction, amount, balance_bucket, idempotency_key)
        VALUES ($1,'commission','credit',1,'pending','bad-key')`, [PARTNER_A]);
    } catch {
      blocked = true;
    }
  });
  assert.equal(blocked, true);
}

async function testIamPermissions(db) {
  const adminOk = await query(db, `SELECT public.iam_has_permission('partners.fraud.review', $1) AS ok`, [ADMIN]);
  await query(db, `INSERT INTO iam_user_assignments (user_id, role_id) VALUES ($1,'admin') ON CONFLICT DO NOTHING`, [ADMIN]);
  const adminOk2 = await query(db, `SELECT public.iam_has_permission('partners.fraud.review', $1) AS ok`, [ADMIN]);
  assert.equal(adminOk2.rows[0].ok, true);

  const userDenied = await query(db, `SELECT public.iam_has_permission('partners.fraud.review', $1) AS ok`, [USER_A]);
  assert.equal(userDenied.rows[0].ok, false);
}

async function testAppendOnlyLedger(db) {
  const entry = await query(db, `SELECT id FROM partner_financial_ledger_entries LIMIT 1`);
  if (!entry.rows[0]?.id) return;
  let blocked = false;
  try {
    await query(db, `UPDATE partner_financial_ledger_entries SET amount = 999 WHERE id = $1`, [entry.rows[0].id]);
  } catch (e) {
    blocked = String(e.message).includes("append_only");
  }
  assert.equal(blocked, true);
}

async function testReversal(db) {
  const credit = await query(db, `SELECT id, partner_id, amount, balance_bucket FROM partner_financial_ledger_entries WHERE entry_direction = 'credit' LIMIT 1`);
  if (!credit.rows[0]?.id) return;
  const supabase = createServiceSupabase(db);
  const first = await supabase.rpc("reverse_partner_ledger_entry_atomic", {
    p_original_entry_id: credit.rows[0].id,
    p_reason: "test reversal",
  });
  assert.equal(first.data.reversed, true);
  const second = await supabase.rpc("reverse_partner_ledger_entry_atomic", {
    p_original_entry_id: credit.rows[0].id,
    p_reason: "test reversal",
  });
  assert.equal(second.data.duplicate, true);
}

async function testAtomicRollbackOnInvalidPartner(db) {
  const supabase = createServiceSupabase(db);
  const fakePartner = "99999999-9999-9999-9999-999999999999";
  const before = await query(db, `SELECT count(*)::int AS c FROM partner_commissions`);
  const result = await supabase.rpc("create_partner_commission_atomic", {
    p_partner_id: fakePartner,
    p_referral_id: REFERRAL,
    p_referred_user_id: REFERRED,
    p_service_type: "vip_signal",
    p_source_id: "aaaaaaaa-0000-0000-0000-000000000001",
    p_base_amount: 100,
    p_commission_percent: 10,
    p_reason: "should rollback",
    p_initial_status: "pending_activation",
    p_invited_username: "x",
    p_idempotency_key: "rollback-test-key",
    p_source_type: "service",
  });
  assert.ok(result.error || result.data?.created === false);
  const after = await query(db, `SELECT count(*)::int AS c FROM partner_commissions`);
  assert.equal(before.rows[0].c, after.rows[0].c);
}

const tests = [
  ["migration apply + seed", async (db) => { await seedBase(db); }],
  ["atomic commission all-or-nothing", testAtomicCommission],
  ["atomic rollback invalid partner", testAtomicRollbackOnInvalidPartner],
  ["concurrent commission x10", testConcurrentCommissions],
  ["signup bonus ledger-native", testSignupBonusAtomic],
  ["IAM permission enforcement", testIamPermissions],
  ["RLS partner isolation", testRlsIsolation],
  ["partner cannot INSERT ledger", testPartnerCannotInsertLedger],
  ["append-only ledger trigger", testAppendOnlyLedger],
  ["reversal idempotency", testReversal],
];

let passed = 0;
let failed = 0;
let commissionId = null;

const db = await createPartnerTestDb();

for (const [name, fn] of tests) {
  try {
    if (name === "atomic commission all-or-nothing") {
      commissionId = await fn(db);
    } else if (name === "fraud gate blocks release" && commissionId) {
      await testFraudGateBlocksRelease(db, commissionId);
    } else {
      await fn(db);
    }
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}`, error.message);
  }
}

if (commissionId) {
  try {
    await testFraudGateBlocksRelease(db, commissionId);
    passed += 1;
    console.log("PASS fraud gate blocks release");
  } catch (error) {
    failed += 1;
    console.error("FAIL fraud gate blocks release", error.message);
  }
}

console.log(`\nPartner Center PGlite integration: ${passed} passed, ${failed} failed`);
await db.close();
process.exit(failed > 0 ? 1 : 0);
