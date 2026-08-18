#!/usr/bin/env node
/**
 * Regression: Production profiles table has no updated_at column.
 * HV persistence must not require or write profiles.updated_at.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyHumanVerificationUpdate,
  markTurnstileVerified,
  HUMAN_VERIFICATION_STATUSES,
} from "../lib/security/human-verification.js";

function createProfilesMock(initial = {}) {
  let state = { ...initial };
  const updates = [];

  return {
    state,
    updates,
    supabase: {
      from(table) {
        assert.equal(table, "profiles");
        return {
          update(payload) {
            updates.push({ ...payload });
            return {
              eq(_col, id) {
                Object.assign(state, payload, { id });
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      },
    },
  };
}

describe("profiles HV persistence without updated_at", () => {
  it("markTurnstileVerified persists turnstile_verified without updated_at", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const mock = createProfilesMock({
      human_verification_status: HUMAN_VERIFICATION_STATUSES.UNVERIFIED,
      partner_reward_eligibility_status: "pending",
      user_classification: "unknown",
    });

    const result = await markTurnstileVerified(mock.supabase, userId);
    assert.equal(result.updated, true);
    assert.equal(mock.updates.length, 1);
    assert.equal(mock.updates[0].human_verification_status, HUMAN_VERIFICATION_STATUSES.TURNSTILE_VERIFIED);
    assert.ok(mock.updates[0].human_verified_at);
    assert.equal("updated_at" in mock.updates[0], false);
    assert.equal(mock.state.partner_reward_eligibility_status, "pending");
    assert.equal(mock.state.user_classification, "unknown");
  });

  it("applyHumanVerificationUpdate never injects updated_at", async () => {
    const userId = "22222222-2222-4222-8222-222222222222";
    const mock = createProfilesMock({
      partner_reward_eligibility_status: "pending",
    });

    await applyHumanVerificationUpdate(mock.supabase, userId, {
      human_verification_status: HUMAN_VERIFICATION_STATUSES.EMAIL_VERIFIED,
      human_verified_at: "2026-08-18T20:00:00.000Z",
    });

    assert.equal(mock.updates[0].human_verification_status, HUMAN_VERIFICATION_STATUSES.EMAIL_VERIFIED);
    assert.equal("updated_at" in mock.updates[0], false);
    assert.equal(mock.state.partner_reward_eligibility_status, "pending");
  });

  it("hv persistence is not rolled back by a separate downstream failure", async () => {
    const userId = "33333333-3333-4333-8333-333333333333";
    const mock = createProfilesMock({
      human_verification_status: HUMAN_VERIFICATION_STATUSES.UNVERIFIED,
      partner_reward_eligibility_status: "pending",
    });

    await markTurnstileVerified(mock.supabase, userId);
    assert.equal(mock.state.human_verification_status, HUMAN_VERIFICATION_STATUSES.TURNSTILE_VERIFIED);
    assert.ok(mock.state.human_verified_at);

    const failingSupabase = {
      from(table) {
        assert.equal(table, "account_risk_signals");
        return {
          upsert() {
            throw new Error("signal capture failed");
          },
        };
      },
    };

    assert.throws(
      () => failingSupabase.from("account_risk_signals").upsert({}),
      /signal capture failed/
    );
    assert.equal(mock.state.human_verification_status, HUMAN_VERIFICATION_STATUSES.TURNSTILE_VERIFIED);
    assert.equal(mock.state.partner_reward_eligibility_status, "pending");
  });
});
