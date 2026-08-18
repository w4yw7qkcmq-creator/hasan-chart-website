#!/usr/bin/env node
/**
 * Regression: partner eligibility persistence on canonical profiles schema (no updated_at).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { persistPartnerRewardEligibilityState } from "../lib/partner-center/partner-reward-eligibility.js";
import { PARTNER_REWARD_ELIGIBILITY_STATUSES } from "../lib/security/human-verification.js";
import { FRAUD_RISK_LEVELS } from "../lib/partner-center/constants.js";

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

describe("partner reward eligibility persistence without updated_at", () => {
  it("persists eligibility fields without updated_at", async () => {
    const userId = "44444444-4444-4444-8444-444444444444";
    const mock = createProfilesMock({
      partner_reward_eligibility_status: PARTNER_REWARD_ELIGIBILITY_STATUSES.PENDING,
      user_classification: "unknown",
    });

    const result = await persistPartnerRewardEligibilityState(mock.supabase, userId, {
      decision: PARTNER_REWARD_ELIGIBILITY_STATUSES.RISK_HOLD,
      riskLevel: FRAUD_RISK_LEVELS.MEDIUM,
    });

    assert.equal(result.updated, true);
    assert.equal(mock.updates.length, 1);
    assert.equal(mock.updates[0].partner_reward_eligibility_status, PARTNER_REWARD_ELIGIBILITY_STATUSES.RISK_HOLD);
    assert.ok(mock.updates[0].partner_reward_eligibility_at);
    assert.equal(mock.updates[0].partner_reward_risk_level, FRAUD_RISK_LEVELS.MEDIUM);
    assert.equal("updated_at" in mock.updates[0], false);
    assert.equal(mock.state.user_classification, "unknown");
  });
});
