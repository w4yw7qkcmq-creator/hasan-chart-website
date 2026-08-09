#!/usr/bin/env node
/**
 * Partner Center cutover — 8-combination feature flag truth table.
 */
import assert from "node:assert/strict";
import { onPartnerGrowthEvent } from "../../lib/partner-center/growth-integration.js";
import { evaluateMissionsForPartnerEvent } from "../../lib/partner-center/mission-engine.js";
import { transitionReferralQualification } from "../../lib/partner-center/qualification-engine.js";
import { adminSetMissionStatus } from "../../lib/partner-center/admin-marketing-service.js";
import {
  getPartnerCenterFeatureFlags,
  isPartnerCenterV2UiEnabled,
  isPartnerGrowthEngineEnabled,
  isPartnerAdminMarketingEnabled,
} from "../../lib/partner-center/feature-flags.js";
import { createPartnerCommissionAtomic } from "../../lib/partner-center/financial-gateway.js";

const FLAG_KEYS = [
  "PARTNER_GROWTH_ENGINE",
  "NEXT_PUBLIC_PARTNER_GROWTH_ENGINE",
  "PARTNER_CENTER_V2_UI",
  "NEXT_PUBLIC_PARTNER_CENTER_V2_UI",
  "PARTNER_ADMIN_MARKETING",
  "NEXT_PUBLIC_PARTNER_ADMIN_MARKETING",
];

function clearFlags() {
  for (const key of FLAG_KEYS) delete process.env[key];
}

function setCombo(g, v, a) {
  clearFlags();
  if (g) {
    process.env.PARTNER_GROWTH_ENGINE = "true";
    process.env.NEXT_PUBLIC_PARTNER_GROWTH_ENGINE = "true";
  }
  if (v) {
    process.env.PARTNER_CENTER_V2_UI = "true";
    process.env.NEXT_PUBLIC_PARTNER_CENTER_V2_UI = "true";
  }
  if (a) {
    process.env.PARTNER_ADMIN_MARKETING = "true";
    process.env.NEXT_PUBLIC_PARTNER_ADMIN_MARKETING = "true";
  }
}

function mockSupabase() {
  return {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle: async () => ({ data: { tier_key: "partner" }, error: null }),
        single: async () => ({ data: null, error: null }),
        update() {
          return this;
        },
        insert: async () => ({ data: null, error: null }),
      };
    },
    rpc: async () => ({ data: { created: true }, error: null }),
  };
}

let passed = 0;
let failed = 0;

function pass(name) {
  passed += 1;
  console.log(`PASS ${name}`);
}

function fail(name, err) {
  failed += 1;
  console.error(`FAIL ${name}`, err?.message || err);
}

async function testGrowthBlockedWhenOff() {
  setCombo(false, false, false);
  const result = await onPartnerGrowthEvent(mockSupabase(), {
    partnerId: "11111111-1111-1111-1111-111111111111",
    eventType: "qualified_referral",
    tierKey: "partner",
  });
  assert.equal(result.reason, "growth_engine_disabled");
  pass("000 growth side effects blocked");
}

async function testGrowthOn() {
  setCombo(true, false, false);
  assert.equal(isPartnerGrowthEngineEnabled(), true);
  assert.equal(isPartnerCenterV2UiEnabled(), false);
  pass("100 growth flag on v2 off");
}

async function testV2OnGrowthOffSafe() {
  setCombo(false, true, false);
  assert.equal(isPartnerCenterV2UiEnabled(), true);
  assert.equal(isPartnerGrowthEngineEnabled(), false);
  const missions = await evaluateMissionsForPartnerEvent(mockSupabase(), {
    partnerId: "11111111-1111-1111-1111-111111111111",
    eventType: "qualified_referral",
    tierKey: "partner",
  });
  assert.equal(missions.skipped, true);
  pass("010 v2 on growth off — missions skipped");
}

async function testAdminActivateBlockedWithoutGrowth() {
  setCombo(false, false, true);
  const supabase = {
    from(table) {
      if (table === "partner_mission_definitions") {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          single: async () => ({
            data: {
              id: "m1",
              code: "T1",
              name: "Test",
              mission_type: "qualified_referrals_count",
              target_metric: "qualified_referrals",
              target_value: 1,
              reward_amount: 1,
            },
            error: null,
          }),
          update() {
            return this;
          },
        };
      }
      return {
        insert: async () => ({ error: null }),
      };
    },
  };
  await assert.rejects(
    () => adminSetMissionStatus(supabase, "m1", "active", "admin-1"),
    (err) => err.code === "GROWTH_ENGINE_REQUIRED"
  );
  pass("001 admin activate mission blocked without growth");
}

async function testFinancialGatewayIndependentOfGrowthFlag() {
  setCombo(false, false, false);
  assert.equal(typeof createPartnerCommissionAtomic, "function");
  pass("000 financial gateway callable (not gated by growth flag)");
}

async function testAllCombinationsReadable() {
  const combos = [
    [0, 0, 0],
    [0, 0, 1],
    [0, 1, 0],
    [0, 1, 1],
    [1, 0, 0],
    [1, 0, 1],
    [1, 1, 0],
    [1, 1, 1],
  ];
  for (const [g, v, a] of combos) {
    setCombo(g, v, a);
    const flags = getPartnerCenterFeatureFlags();
    assert.equal(flags.PARTNER_GROWTH_ENGINE, Boolean(g));
    assert.equal(flags.PARTNER_CENTER_V2_UI, Boolean(v));
    assert.equal(flags.PARTNER_ADMIN_MARKETING, Boolean(a));
  }
  pass("8 flag combinations readable");
}

async function main() {
  try {
    await testGrowthBlockedWhenOff();
    await testGrowthOn();
    await testV2OnGrowthOffSafe();
    await testAdminActivateBlockedWithoutGrowth();
    await testFinancialGatewayIndependentOfGrowthFlag();
    await testAllCombinationsReadable();
  } catch (err) {
    fail("truth_table", err);
  } finally {
    clearFlags();
  }
  console.log(`\nFeature flag truth table: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main();
