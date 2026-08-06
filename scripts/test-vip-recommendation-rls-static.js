#!/usr/bin/env node
/**
 * Static SQL/RLS tests for VIP status migration files.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const statusSql = readFileSync(
  join(ROOT, "supabase/migrations/20260806_vip_signal_status_updates.sql"),
  "utf8"
);
const iamSql = readFileSync(
  join(ROOT, "supabase/migrations/20260806_vip_recommendations_iam_permissions.sql"),
  "utf8"
);

describe("VIP status migration static review", () => {
  it("wraps in transaction", () => {
    assert.match(statusSql, /BEGIN;/);
    assert.match(statusSql, /COMMIT;/);
  });

  it("defines trade_status check constraint", () => {
    assert.match(statusSql, /vip_signals_trade_status_check/);
    assert.match(statusSql, /closed_immediately/);
    assert.match(statusSql, /cancelled/);
  });

  it("defines atomic RPC with FOR UPDATE", () => {
    assert.match(statusSql, /update_vip_signal_status_event/);
    assert.match(statusSql, /FOR UPDATE/);
  });

  it("enables RLS without authenticated open policies", () => {
    assert.match(statusSql, /ENABLE ROW LEVEL SECURITY/);
    assert.match(statusSql, /vip_signal_status_events_service_all/);
    assert.match(statusSql, /TO service_role/);
    assert.doesNotMatch(statusSql, /TO authenticated/);
    assert.doesNotMatch(statusSql, /using \(true\).*authenticated/i);
  });

  it("delivery table supports state machine statuses", () => {
    assert.match(statusSql, /pending/);
    assert.match(statusSql, /delivered/);
    assert.match(statusSql, /unavailable/);
    assert.match(statusSql, /attempt_count/);
    assert.match(statusSql, /vip_signal_status_deliveries_signal_event_user_channel_unique/);
  });

  it("indexes recent list and status queries", () => {
    assert.match(statusSql, /vip_signals_created_at_desc_idx/);
    assert.match(statusSql, /vip_signals_trade_status_idx/);
  });
});

describe("VIP IAM permissions migration", () => {
  it("seeds three recommendation permissions", () => {
    assert.match(iamSql, /recommendations\.status\.read/);
    assert.match(iamSql, /recommendations\.status\.update/);
    assert.match(iamSql, /recommendations\.notifications\.send/);
  });

  it("grants admin role only required permissions", () => {
    assert.match(iamSql, /\('admin', 'recommendations\.status\.read'/);
    assert.doesNotMatch(iamSql, /analyst.*recommendations\.status\.update/);
    assert.doesNotMatch(iamSql, /support.*recommendations\.notifications\.send/);
  });
});

console.log("test-vip-recommendation-rls-static: loaded");
