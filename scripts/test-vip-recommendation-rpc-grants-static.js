#!/usr/bin/env node
/**
 * Static grant-hardening tests for VIP status RPC follow-up migration.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const FN_SIG = "public.update_vip_signal_status_event(bigint, text, uuid, text, text)";
const grantsSql = readFileSync(
  join(ROOT, "supabase/migrations/20260806_vip_signal_status_rpc_grants_hardening.sql"),
  "utf8"
);

describe("VIP status RPC grants hardening migration", () => {
  it("wraps in transaction", () => {
    assert.match(grantsSql, /BEGIN;/);
    assert.match(grantsSql, /COMMIT;/);
  });

  it("uses exact function signature", () => {
    const matches = grantsSql.match(/update_vip_signal_status_event\(bigint, text, uuid, text, text\)/g);
    assert.ok(matches && matches.length >= 4, "expected signature on all grant statements");
    assert.doesNotMatch(grantsSql, /update_vip_signal_status_event\(\s*bigint\s*,\s*text\s*\)/);
  });

  it("revokes PUBLIC execute", () => {
    assert.match(grantsSql, new RegExp(`REVOKE ALL ON FUNCTION ${FN_SIG.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} FROM PUBLIC`, "i"));
  });

  it("revokes anon and authenticated execute", () => {
    assert.match(grantsSql, /REVOKE EXECUTE ON FUNCTION public\.update_vip_signal_status_event\(bigint, text, uuid, text, text\) FROM anon;/);
    assert.match(grantsSql, /REVOKE EXECUTE ON FUNCTION public\.update_vip_signal_status_event\(bigint, text, uuid, text, text\) FROM authenticated;/);
  });

  it("grants execute to service_role only", () => {
    assert.match(grantsSql, /GRANT EXECUTE ON FUNCTION public\.update_vip_signal_status_event\(bigint, text, uuid, text, text\)\s+TO service_role;/);
    assert.doesNotMatch(grantsSql, /TO authenticated/);
    assert.doesNotMatch(grantsSql, /TO anon/);
    assert.doesNotMatch(grantsSql, /TO PUBLIC/);
  });

  it("locks search_path to public", () => {
    assert.match(grantsSql, /ALTER FUNCTION public\.update_vip_signal_status_event\(bigint, text, uuid, text, text\)\s+SET search_path = public;/);
  });

  it("does not alter function body or business logic", () => {
    assert.doesNotMatch(grantsSql, /CREATE OR REPLACE FUNCTION/i);
    assert.doesNotMatch(grantsSql, /INSERT INTO public\.vip_signal_status_events/i);
    assert.doesNotMatch(grantsSql, /UPDATE public\.vip_signals/i);
    assert.doesNotMatch(grantsSql, /DROP FUNCTION/i);
  });
});

console.log("test-vip-recommendation-rpc-grants-static: loaded");
