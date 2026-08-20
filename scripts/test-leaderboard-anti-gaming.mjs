#!/usr/bin/env node
/**
 * Leaderboard anti-gaming integration (PGlite).
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createPartnerTestDb, query } from "./partner-center/test-db.mjs";
import { createServiceSupabaseFromDb } from "./partner-center/test-supabase-mock.mjs";
import { buildLeaderboardSnapshot } from "../lib/partner-center/leaderboard-engine.js";
import { assertPublicLeaderboardPayload } from "../lib/partner-center/leaderboard-dto.js";
import { LEADERBOARD_FORBIDDEN_PUBLIC_FIELDS } from "../lib/partner-center/leaderboard-public.js";
import { getPeriodBounds } from "../lib/partner-center/timezone.js";

const AT = new Date("2026-08-19T19:00:00.000Z");
const IN_WINDOW = "2026-08-19T18:00:00.000Z";
const OUT_WINDOW = "2026-07-01T10:00:00.000Z";
const { startAt, endAt } = getPeriodBounds("monthly", AT);

async function upsertPartner(db, { partnerId, userId, code }) {
  await query(db, `INSERT INTO auth.users (id, email) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [
    userId,
    `${code}@example.com`,
  ]);
  await query(
    db,
    `INSERT INTO partners (id, user_id, referral_code, status, tier_key)
     VALUES ($1,$2,$3,'active','partner') ON CONFLICT DO NOTHING`,
    [partnerId, userId, code]
  );
}

async function upsertProfile(db, userId, opts = {}) {
  const { classification = "real", hv = "verified" } = opts;
  await query(db, `INSERT INTO auth.users (id, email) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [
    userId,
    `${String(userId).slice(0, 8)}@example.com`,
  ]);
  await query(
    db,
    `INSERT INTO profiles (id, user_classification, effective_user_classification, human_verification_status)
     VALUES ($1,$2,$2,$3)
     ON CONFLICT (id) DO UPDATE SET user_classification = EXCLUDED.user_classification,
       effective_user_classification = EXCLUDED.effective_user_classification,
       human_verification_status = EXCLUDED.human_verification_status`,
    [userId, classification, hv]
  );
}

async function insertQual(db, { partnerId, partnerUserId, referralCode, referredId, qualifiedAt, state = "qualified" }) {
  const referralId = crypto.randomUUID();
  await query(db, `INSERT INTO auth.users (id, email) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [
    referredId,
    `${referredId}@example.com`,
  ]);
  await query(
    db,
    `INSERT INTO partner_referrals (id, partner_id, referred_user_id, referral_code, referred_username, status, registered_at)
     VALUES ($1,$2,$3,$4,'r','registered',$5)`,
    [referralId, partnerId, referredId, referralCode, qualifiedAt]
  );
  await query(
    db,
    `INSERT INTO partner_referral_qualifications (referral_id, partner_id, referred_user_id, state, qualified_at)
     VALUES ($1,$2,$3,$4,$5)`,
    [referralId, partnerId, referredId, state, qualifiedAt]
  );
  return { referralId, referredId };
}

const PARTNER_GOOD = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
const USER_GOOD = "11111111-1111-4111-8111-000000000001";

const db = await createPartnerTestDb();
const supabase = createServiceSupabaseFromDb(db);

await upsertPartner(db, { partnerId: PARTNER_GOOD, userId: USER_GOOD, code: "GOOD1" });
await upsertProfile(db, USER_GOOD);

const referredReal = crypto.randomUUID();
await upsertProfile(db, referredReal, { classification: "real", hv: "verified" });
await insertQual(db, {
  partnerId: PARTNER_GOOD,
  partnerUserId: USER_GOOD,
  referralCode: "GOOD1",
  referredId: referredReal,
  qualifiedAt: IN_WINDOW,
});

const fixtures = [
  ["TEST", "test", "verified"],
  ["E2E", "e2e", "verified"],
  ["INTERNAL", "internal", "verified"],
  ["UNVERIFIED", "real", "unverified"],
  ["SUSPECTED", "suspected", "verified"],
  ["UNKNOWN", "unknown", "verified"],
];

for (const [label, classification, hv] of fixtures) {
  const pid = crypto.randomUUID();
  const uid = crypto.randomUUID();
  const rid = crypto.randomUUID();
  await upsertPartner(db, { partnerId: pid, userId: uid, code: label.slice(0, 4) });
  await upsertProfile(db, uid);
  await upsertProfile(db, rid, { classification, hv });
  await insertQual(db, {
    partnerId: pid,
    partnerUserId: uid,
    referralCode: label.slice(0, 4),
    referredId: rid,
    qualifiedAt: IN_WINDOW,
  });
}

const selfPid = crypto.randomUUID();
const selfUid = crypto.randomUUID();
await upsertPartner(db, { partnerId: selfPid, userId: selfUid, code: "SELF" });
await upsertProfile(db, selfUid);
await insertQual(db, {
  partnerId: selfPid,
  partnerUserId: selfUid,
  referralCode: "SELF",
  referredId: selfUid,
  qualifiedAt: IN_WINDOW,
});

const disqPid = crypto.randomUUID();
const disqUid = crypto.randomUUID();
const disqRef = crypto.randomUUID();
await upsertPartner(db, { partnerId: disqPid, userId: disqUid, code: "DISQ" });
await upsertProfile(db, disqUid);
await upsertProfile(db, disqRef, { classification: "real", hv: "verified" });
await insertQual(db, {
  partnerId: disqPid,
  partnerUserId: disqUid,
  referralCode: "DISQ",
  referredId: disqRef,
  qualifiedAt: IN_WINDOW,
  state: "disqualified",
});

const histPid = crypto.randomUUID();
const histUid = crypto.randomUUID();
const histRef = crypto.randomUUID();
await upsertPartner(db, { partnerId: histPid, userId: histUid, code: "HIST" });
await upsertProfile(db, histUid);
await upsertProfile(db, histRef, { classification: "real", hv: "verified" });
await insertQual(db, {
  partnerId: histPid,
  partnerUserId: histUid,
  referralCode: "HIST",
  referredId: histRef,
  qualifiedAt: OUT_WINDOW,
});

await query(
  db,
  `INSERT INTO partner_unique_visits (id, partner_id, visitor_hash, first_seen_at, last_seen_at)
   VALUES ($1,$2,'click-only',now(),now())`,
  [crypto.randomUUID(), PARTNER_GOOD]
).catch(() => null);

const snapshot = await buildLeaderboardSnapshot(supabase, { periodType: "monthly", at: AT, limit: 50 });
assertPublicLeaderboardPayload(snapshot.entries);

const goodEntry = snapshot.entries.find((e) => String(e.displayLabel).includes("GOOD"));
assert.ok(goodEntry, "REAL verified in-window referral counted");
assert.equal(goodEntry.publicScore, 1);

for (const label of ["TEST", "E2E", "INTE", "SELF", "DISQ", "HIST"]) {
  const bad = snapshot.entries.find((e) => String(e.displayLabel).includes(label));
  if (bad) assert.equal(bad.publicScore, 0, `${label} should not rank`);
}

for (const row of snapshot.entries) {
  for (const key of LEADERBOARD_FORBIDDEN_PUBLIC_FIELDS) {
    assert.equal(key in row, false, `forbidden ${key}`);
  }
}

assert.ok(snapshot.window.startAt);
assert.ok(snapshot.window.endAt);
assert.equal(new Date(IN_WINDOW) >= new Date(startAt), true);
assert.equal(new Date(IN_WINDOW) <= new Date(endAt), true);

console.log("PASS leaderboard anti-gaming integration (trusted qualified-only, public DTO)");
await db.close();
