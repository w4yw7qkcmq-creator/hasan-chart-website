#!/usr/bin/env node
/**
 * Round 9 — attribution campaign program unit tests (pure logic)
 */
import assert from "node:assert/strict";
import {
  normalizeAttributionQuery,
  ATTRIBUTION_POLICY_SUMMARY,
} from "../lib/partner-center/attribution-engine.js";
import { canCampaignAcceptAttribution } from "../lib/partner-center/campaign-lifecycle.js";
import { PERIOD_TYPES } from "../lib/partner-center/phase2-constants.js";
import { buildPeriodKey } from "../lib/partner-center/timezone.js";
import { mapEventToMissionTypes } from "../lib/partner-center/mission-trusted-events.js";

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

const CAMPAIGN_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const now = new Date("2026-08-15T12:00:00Z");

test("normalizeAttributionQuery resolves campaignProgramId alias", () => {
  const q = normalizeAttributionQuery({
    utm_campaign: "summer-sale",
    campaign_program_id: CAMPAIGN_ID,
  });
  assert.equal(q.campaign, "summer-sale");
  assert.equal(q.campaignProgramId, CAMPAIGN_ID);
});

test("active campaign within window accepts attribution", () => {
  const r = canCampaignAcceptAttribution(
    {
      id: CAMPAIGN_ID,
      status: "active",
      start_at: "2026-08-01T00:00:00Z",
      end_at: "2026-08-31T23:59:59Z",
    },
    { at: now }
  );
  assert.equal(r.ok, true);
});

test("scheduled campaign within window accepts attribution", () => {
  const r = canCampaignAcceptAttribution(
    {
      id: CAMPAIGN_ID,
      status: "scheduled",
      start_at: "2026-08-01T00:00:00Z",
      end_at: "2026-08-31T23:59:59Z",
    },
    { at: now }
  );
  assert.equal(r.ok, true);
});

test("draft campaign rejects attribution", () => {
  const r = canCampaignAcceptAttribution(
    { id: CAMPAIGN_ID, status: "draft", start_at: null, end_at: null },
    { at: now }
  );
  assert.equal(r.ok, false);
  assert.equal(r.reason, "campaign_not_attributable");
});

test("campaign outside window rejected", () => {
  const r = canCampaignAcceptAttribution(
    {
      id: CAMPAIGN_ID,
      status: "active",
      start_at: "2026-09-01T00:00:00Z",
      end_at: "2026-09-30T23:59:59Z",
    },
    { at: now }
  );
  assert.equal(r.ok, false);
  assert.equal(r.reason, "outside_campaign_window");
});

test("attribution policy references partner_campaign_programs not partner_campaigns", () => {
  assert.match(ATTRIBUTION_POLICY_SUMMARY.campaignValidation, /partner_campaign_programs/);
  assert.match(ATTRIBUTION_POLICY_SUMMARY.campaignProgramId, /partner_campaign_programs/);
  assert.doesNotMatch(ATTRIBUTION_POLICY_SUMMARY.campaignValidation, /partner_campaigns[^_]/);
});

test("campaign_lifetime period key is campaign-scoped", () => {
  const key = buildPeriodKey(PERIOD_TYPES.CAMPAIGN_LIFETIME, now, {
    campaignProgramId: CAMPAIGN_ID,
  });
  assert.equal(key, `campaign:${CAMPAIGN_ID}`);
});

test("referral_click does not map to smart_link_conversions", () => {
  assert.deepEqual(mapEventToMissionTypes("referral_click"), []);
});

test("signup maps to smart_link_conversions", () => {
  const types = mapEventToMissionTypes("signup");
  assert.ok(types.includes("smart_link_conversions"));
});

console.log(`\nPartner attribution campaign program: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
