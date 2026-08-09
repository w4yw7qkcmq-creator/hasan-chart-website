#!/usr/bin/env node
/**
 * Partner Smart Link UX — error mapping + form options tests
 */
import assert from "node:assert/strict";
import {
  mapSmartLinkErrorToMessage,
  isSmartLinkCampaignError,
} from "../lib/partner-center/smart-link-errors.js";
import {
  SMART_LINK_SOURCE_OPTIONS,
  buildEligibleCampaignOptions,
} from "../app/components/partner/growth/smart-link-form-options.js";

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

test("invalid_campaign maps to Arabic", () => {
  const msg = mapSmartLinkErrorToMessage("invalid_campaign");
  assert.match(msg, /الحملة/);
  assert.doesNotMatch(msg, /invalid_campaign/);
});

test("campaign_not_eligible maps to Arabic", () => {
  const msg = mapSmartLinkErrorToMessage("campaign_not_eligible");
  assert.match(msg, /غير متاحة لحسابك/);
});

test("invalid_source maps to Arabic", () => {
  const msg = mapSmartLinkErrorToMessage("invalid_source");
  assert.match(msg, /المصدر/);
});

test("unknown error maps to generic Arabic", () => {
  const msg = mapSmartLinkErrorToMessage("something_internal");
  assert.equal(msg, "تعذر إنشاء الرابط الآن. حاول مرة أخرى.");
});

test("campaign error detector", () => {
  assert.equal(isSmartLinkCampaignError("invalid_campaign"), true);
  assert.equal(isSmartLinkCampaignError("inactive_partner"), false);
});

test("source options use Arabic labels and canonical values", () => {
  assert.equal(SMART_LINK_SOURCE_OPTIONS[0].value, "telegram");
  assert.equal(SMART_LINK_SOURCE_OPTIONS[0].label, "تيليغرام");
});

test("eligible campaign options include no-campaign default", () => {
  const opts = buildEligibleCampaignOptions([
    { code: "summer", name: "حملة الصيف", eligible: true },
    { code: "old", name: "قديمة", eligible: false },
  ]);
  assert.equal(opts[0].value, "");
  assert.equal(opts[0].label, "بدون حملة");
  assert.equal(opts.length, 2);
  assert.equal(opts[1].value, "summer");
});

console.log(`\nPartner Smart Link UX tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
