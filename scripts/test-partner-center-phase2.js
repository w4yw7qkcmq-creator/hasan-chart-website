#!/usr/bin/env node
/**
 * Partner Center Phase 2 — unit tests (pure logic, no DB)
 */
import assert from "node:assert/strict";
import { validateMissionDefinition } from "../lib/partner-center/mission-engine.js";
import { validateSmartLinkInput, sanitizeLandingPath } from "../lib/partner-center/smart-link-service.js";
import { validateCampaignProgramInput } from "../lib/partner-center/campaign-engine.js";
import { buildPeriodKey } from "../lib/partner-center/timezone.js";
import { resolveCampaignCommissionOverride } from "../lib/partner-center/campaign-engine.js";

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

test("1 mission definition valid", () => {
  assert.equal(
    validateMissionDefinition({
      code: "Q1",
      name: "One Qualified",
      mission_type: "qualified_referrals_count",
      target_metric: "qualified_referrals",
      target_value: 1,
      reward_amount: 10,
    }).ok,
    true
  );
});

test("2 invalid mission config rejected", () => {
  assert.equal(validateMissionDefinition({ code: "x" }).ok, false);
  assert.equal(
    validateMissionDefinition({
      code: "x",
      name: "x",
      mission_type: "qualified_referrals_count",
      target_metric: "q",
      target_value: 0,
      reward_amount: -1,
    }).ok,
    false
  );
});

test("23 campaign inactive landing rejected", () => {
  assert.equal(validateCampaignProgramInput({ code: "c", name: "C", landing_path: "https://evil.com" }).ok, false);
  assert.equal(validateCampaignProgramInput({ code: "c", name: "C", landing_path: "/pricing" }).ok, true);
});

test("26 open redirect blocked", () => {
  assert.equal(sanitizeLandingPath("/evil-external"), null);
  assert.equal(sanitizeLandingPath("/vip"), "/vip");
});

test("28 rule version preserved in override metadata", () => {
  const o = resolveCampaignCommissionOverride(
    { code: "summer", rule_version: 3, commission_override_metadata: { mode: "fixed_percent", percent: 15 } },
    10
  );
  assert.equal(o.percent, 15);
  assert.equal(o.ruleVersion, 3);
  assert.equal(o.campaignCode, "summer");
});

test("27 campaign commission override trusted rule only", () => {
  const base = resolveCampaignCommissionOverride({ commission_override_metadata: {} }, 12);
  assert.equal(base.source, "base_rule");
  assert.equal(base.percent, 12);
});

test("period key daily deterministic", () => {
  const k = buildPeriodKey("daily", new Date("2026-08-09T12:00:00Z"));
  assert.match(k, /^\d{4}-\d{2}-\d{2}$/);
});

test("period key once empty", () => {
  assert.equal(buildPeriodKey("once"), "");
});

test("smart link validates allowed destination", () => {
  const r = validateSmartLinkInput({ destinationPath: "/register", source: "telegram" });
  assert.equal(r.ok, true);
  assert.equal(r.destinationPath, "/register");
});

test("smart link blocks external redirect", () => {
  assert.equal(validateSmartLinkInput({ destinationPath: "//evil.com" }).ok, false);
});

test("streak_period disabled in Phase 2", () => {
  const r = validateMissionDefinition({
    code: "S1",
    name: "Streak",
    mission_type: "streak_period",
    target_metric: "active_days",
    target_value: 7,
    reward_amount: 5,
    status: "active",
  });
  assert.equal(r.ok, false);
  assert.equal(r.error, "streak_period_not_enabled");
});

console.log(`\nPartner Center Phase 2 unit: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
