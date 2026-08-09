#!/usr/bin/env node
/** Partner Center Phase 3 — PGlite smart link analytics reconciliation */
import assert from "node:assert/strict";
import { createPartnerTestDb, query } from "./test-db.mjs";
import { createServiceSupabaseFromDb } from "./test-supabase-mock.mjs";
import { computeSmartLinkMetricsForPartner } from "../../lib/partner-center/smart-link-analytics.js";

const PARTNER = "11111111-1111-1111-1111-111111111111";
const USER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const LINK_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1";
const LINK_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2";

const db = await createPartnerTestDb();
await query(db, `INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT DO NOTHING`, [USER]);
await query(
  db,
  `INSERT INTO partners (id, user_id, referral_code, status, tier_key) VALUES ($1,$2,'P3SL','active','partner') ON CONFLICT DO NOTHING`,
  [PARTNER, USER]
);
await query(
  db,
  `INSERT INTO partner_smart_links (id, partner_id, token, destination_path, status) VALUES ($1,$2,'toka','/','active'), ($3,$2,'tokb','/','active')`,
  [LINK_A, PARTNER, LINK_B]
);

for (let i = 0; i < 10; i++) {
  await query(
    db,
    `INSERT INTO partner_attribution_sessions (partner_id, referral_code, visitor_key, expires_at, idempotency_key, smart_link_id, status)
     VALUES ($1,'P3SL',$2, now() + interval '1 day', $3, $4, 'open')`,
    [PARTNER, `va${i}`, `idemp-a-${i}`, LINK_A]
  );
}
for (let i = 0; i < 5; i++) {
  await query(
    db,
    `INSERT INTO partner_attribution_sessions (partner_id, referral_code, visitor_key, expires_at, idempotency_key, smart_link_id, status)
     VALUES ($1,'P3SL',$2, now() + interval '1 day', $3, $4, 'open')`,
    [PARTNER, `vb${i}`, `idemp-b-${i}`, LINK_B]
  );
}

const supabase = createServiceSupabaseFromDb(db);
const metrics = await computeSmartLinkMetricsForPartner(supabase, PARTNER, [LINK_A, LINK_B]);
assert.equal(metrics.get(LINK_A).clicks, 10);
assert.equal(metrics.get(LINK_B).clicks, 5);
console.log("PASS per-link click isolation");

await db.close();
console.log("\nPartner Center Phase 3 smart link analytics: 1 passed, 0 failed");
