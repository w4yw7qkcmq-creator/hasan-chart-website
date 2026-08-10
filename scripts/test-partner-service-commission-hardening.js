import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveEffectiveCommissionPercent,
  validateCommissionPercent,
  PAYABLE_QUALIFICATION_STATES,
} from "../lib/partner-center/service-commission-policy.js";
import { TIER_POLICIES } from "../lib/partner-center/service-commission-constants.js";
import { QUALIFICATION_STATES } from "../lib/partner-center/constants.js";

function calculateCommissionAmount({ baseAmount = 0, percent = 10 }) {
  const normalizedBase = Number(baseAmount || 0);
  const normalizedPercent = Number(percent || 0);
  if (!Number.isFinite(normalizedBase) || normalizedBase <= 0) return 0;
  return Number(((normalizedBase * normalizedPercent) / 100).toFixed(2));
}

test("tier policy uses partner tier percent", () => {
  const pct = resolveEffectiveCommissionPercent(
    { tier_policy: TIER_POLICIES.USE_PARTNER_TIER, commission_percent: 10 },
    25
  );
  assert.equal(pct, 25);
});

test("fixed service rate ignores tier", () => {
  const pct = resolveEffectiveCommissionPercent(
    { tier_policy: TIER_POLICIES.FIXED_SERVICE_RATE, commission_percent: 12 },
    30
  );
  assert.equal(pct, 12);
});

test("$100 x 10% = $10", () => {
  assert.equal(calculateCommissionAmount({ baseAmount: 100, percent: 10 }), 10);
});

test("$125 x 10% = $12.50", () => {
  assert.equal(calculateCommissionAmount({ baseAmount: 125, percent: 10 }), 12.5);
});

test("$100 x 15% = $15", () => {
  assert.equal(calculateCommissionAmount({ baseAmount: 100, percent: 15 }), 15);
});

test("validate percent rejects scientific notation", () => {
  assert.equal(validateCommissionPercent("1e2").ok, false);
});

test("validate percent max 50", () => {
  assert.equal(validateCommissionPercent("51").ok, false);
  assert.equal(validateCommissionPercent("50").ok, true);
});

test("payable qualification states", () => {
  assert.ok(PAYABLE_QUALIFICATION_STATES.has(QUALIFICATION_STATES.QUALIFIED));
  assert.ok(PAYABLE_QUALIFICATION_STATES.has(QUALIFICATION_STATES.CUSTOMER));
  assert.ok(!PAYABLE_QUALIFICATION_STATES.has(QUALIFICATION_STATES.VERIFIED));
});
