#!/usr/bin/env node
/** Partner Center Phase 3 — PGlite integration (UI service layer) */
import assert from "node:assert/strict";
import { createPartnerTestDb, query } from "./test-db.mjs";
import { createServiceSupabaseFromDb } from "./test-supabase-mock.mjs";
import {
  getPartnerGrowthOverview,
  getPartnerMissionsView,
  getPartnerWalletDetail,
} from "../../lib/partner-center/partner-ui-service.js";

const PARTNER = "11111111-1111-1111-1111-111111111111";
const USER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const db = await createPartnerTestDb();
await query(db, `INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT DO NOTHING`, [USER]);
await query(db, `INSERT INTO partners (id, user_id, referral_code, status, tier_key, balance_withdrawable, balance_pending) VALUES ($1,$2,'P3TEST','active','partner',10,5) ON CONFLICT DO NOTHING`, [PARTNER, USER]);
await query(db, `INSERT INTO partner_mission_definitions (id, code, name, mission_type, status, target_metric, target_value, reward_amount, period_type, rule_version) VALUES ($1,'P3','Mission','qualified_referrals_count','active','qualified_referrals',2,10,'once',1)`, ["22222222-2222-2222-2222-222222222222"]);

const supabase = createServiceSupabaseFromDb(db);

const overview = await getPartnerGrowthOverview(supabase, PARTNER, { tierKey: "partner" });
assert.equal(overview.metrics.withdrawable, 10);
assert.equal(overview.metrics.pending, 5);
console.log("PASS overview metrics from server");

const missions = await getPartnerMissionsView(supabase, PARTNER, { tierKey: "partner" });
assert.ok(missions.length >= 1);
console.log("PASS missions view");

const wallet = await getPartnerWalletDetail(supabase, PARTNER);
assert.equal(wallet.balances.withdrawable, 10);
console.log("PASS wallet detail");

await db.close();
console.log("\nPartner Center Phase 3 PGlite integration: 3 passed, 0 failed");
