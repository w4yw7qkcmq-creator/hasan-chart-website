#!/usr/bin/env node
import assert from "node:assert/strict";
import { createPartnerTestDb, query } from "./test-db.mjs";
import {
  buildBackfillIdempotencyKey,
  buildBackfillLedgerRow,
  classifyLegacyCommission,
  mapLegacyBucket,
} from "./backfill-commissions-dry-run.mjs";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`FAIL ${name}`, e.message);
  }
}

test("signup_bonus maps bonus_pending", () => {
  assert.equal(
    mapLegacyBucket({ source_type: "signup_bonus", status: "pending" }),
    "bonus_pending"
  );
});

test("withdrawable maps withdrawable bucket", () => {
  assert.equal(
    mapLegacyBucket({ source_type: "vip_subscription", status: "withdrawable" }),
    "withdrawable"
  );
});

test("idempotency key convention", () => {
  const id = "11111111-1111-1111-1111-111111111111";
  assert.equal(buildBackfillIdempotencyKey(id), `legacy_commission:${id}`);
});

test("metadata tags legacy backfill", () => {
  const row = buildBackfillLedgerRow({
    id: "11111111-1111-1111-1111-111111111111",
    source_type: "signup_bonus",
    service_type: "registration",
    status: "pending",
    created_at: "2026-07-05T00:00:00Z",
  });
  assert.equal(row.metadata.source, "legacy_backfill");
  assert.equal(row.balanceBucket, "bonus_pending");
});

test("duplicate insert idempotent on PGlite", async () => {
  const db = await createPartnerTestDb();
  await query(db, `
    INSERT INTO auth.users (id) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') ON CONFLICT DO NOTHING
  `);
  await query(db, `
    INSERT INTO partners (id, user_id, referral_code) VALUES
    ('11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','T1')
    ON CONFLICT DO NOTHING
  `);
  await query(db, `
    INSERT INTO partner_commissions (id, partner_id, amount, currency, status, source_type, service_type)
    VALUES ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111',0.20,'USD','pending','signup_bonus','registration')
    ON CONFLICT DO NOTHING
  `);

  const commission = {
    id: "22222222-2222-2222-2222-222222222222",
    partner_id: "11111111-1111-1111-1111-111111111111",
    source_type: "signup_bonus",
    service_type: "registration",
    status: "pending",
    amount: 0.2,
    currency: "USD",
    created_at: "2026-07-05T00:00:00Z",
  };
  const row = buildBackfillLedgerRow(commission);
  const insertSql = `
    INSERT INTO partner_financial_ledger_entries (
      partner_id, entry_type, entry_direction, lifecycle_status, amount, currency,
      balance_bucket, legacy_commission_id, idempotency_key, metadata
    ) VALUES ($1,'commission','credit','pending',0.20,'USD',$2,$3,$4,$5::jsonb)
  `;
  await query(db, insertSql, [
    commission.partner_id,
    row.balanceBucket,
    commission.id,
    row.idempotencyKey,
    JSON.stringify(row.metadata),
  ]);

  let duplicate = false;
  try {
    await query(db, insertSql, [
      commission.partner_id,
      row.balanceBucket,
      commission.id,
      row.idempotencyKey,
      JSON.stringify(row.metadata),
    ]);
  } catch (e) {
    duplicate = String(e.message || e).includes("duplicate") || String(e.code) === "23505";
  }
  assert.equal(duplicate, true);

  const mapped = classifyLegacyCommission(commission, { id: "x", amount: 0.2 });
  assert.equal(mapped.status, "ALREADY_MAPPED");
  await db.close();
});

console.log(`\nBackfill mapping tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
