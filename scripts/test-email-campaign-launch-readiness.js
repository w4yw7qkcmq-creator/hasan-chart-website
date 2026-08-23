#!/usr/bin/env node
/**
 * Regression tests — campaign launch + wizard transition readiness.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  buildCampaignSnapshotFingerprint,
  campaignPatchInvalidatesSnapshot,
  getCampaignLaunchReadiness,
  getCampaignWizardReadiness,
} from "../lib/email-campaign/launch-readiness.js";
import { CAMPAIGN_STATUS } from "../lib/email-campaign/constants.js";

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}:`, error.message);
    process.exitCode = 1;
  }
}

function readyCampaign(overrides = {}) {
  const base = {
    id: randomUUID(),
    name: "Test Campaign",
    subject: "Hello",
    preview_text: "Preview",
    html_content: "<p>Hi</p>",
    audience_type: "all_eligible",
    audience_filter: {},
    category: "marketing",
    status: CAMPAIGN_STATUS.READY,
    eligible_count: 1,
    audience_snapshot_count: 102,
    metadata: {
      snapshotAt: new Date().toISOString(),
      audienceStats: { eligible: 1, excluded: 101, initial: 102 },
      audienceSnapshotStale: false,
    },
  };
  base.metadata.snapshotContentFingerprint = buildCampaignSnapshotFingerprint(base);
  return { ...base, ...overrides };
}

test("ready campaign passes launch readiness", () => {
  const campaign = readyCampaign();
  const readiness = getCampaignLaunchReadiness(campaign);
  assert.equal(readiness.ready, true);
  assert.equal(readiness.eligibleCount, 1);
  assert.equal(readiness.blockers.length, 0);
});

test("unprepared campaign is blocked", () => {
  const campaign = readyCampaign({
    status: CAMPAIGN_STATUS.DRAFT,
    eligible_count: 0,
    metadata: { audienceSnapshotStale: false },
  });
  const readiness = getCampaignLaunchReadiness(campaign);
  assert.equal(readiness.ready, false);
  assert.ok(readiness.blockers.some((b) => b.code === "audience_not_prepared"));
});

test("zero eligible after prepare blocks launch", () => {
  const campaign = readyCampaign({
    eligible_count: 0,
    metadata: {
      snapshotAt: new Date().toISOString(),
      audienceStats: { eligible: 0, excluded: 102, initial: 102 },
      audienceSnapshotStale: false,
      snapshotContentFingerprint: buildCampaignSnapshotFingerprint(
        readyCampaign({ eligible_count: 0 })
      ),
    },
  });
  const readiness = getCampaignLaunchReadiness(campaign);
  assert.equal(readiness.ready, false);
  assert.ok(readiness.blockers.some((b) => b.code === "zero_eligible"));
});

test("missing subject blocks launch with field hint", () => {
  const campaign = readyCampaign({ subject: "" });
  const readiness = getCampaignLaunchReadiness(campaign);
  assert.equal(readiness.ready, false);
  const blocker = readiness.blockers.find((b) => b.code === "missing_subject");
  assert.ok(blocker);
  assert.equal(blocker.field, "subject");
});

test("audience type change invalidates snapshot", () => {
  const campaign = readyCampaign();
  const stale = campaignPatchInvalidatesSnapshot(campaign, { audienceType: "active_subscribers" });
  assert.equal(stale, true);
});

test("message-only patch does not invalidate audience snapshot", () => {
  const campaign = readyCampaign();
  assert.equal(campaignPatchInvalidatesSnapshot(campaign, { subject: "Changed subject" }), false);
  assert.equal(campaignPatchInvalidatesSnapshot(campaign, { htmlContent: "<p>New</p>" }), false);
});

test("equivalent audience filter shapes do not invalidate snapshot", () => {
  const campaign = readyCampaign({ audience_filter: {} });
  const stale = campaignPatchInvalidatesSnapshot(campaign, {
    audienceFilter: { userIds: [] },
  });
  assert.equal(stale, false);
});

test("legacy snapshot without fingerprint is accepted", () => {
  const campaign = readyCampaign({
    metadata: {
      snapshotAt: new Date().toISOString(),
      audienceStats: { eligible: 1, excluded: 101, initial: 102 },
      audienceSnapshotStale: false,
      snapshotContentFingerprint: null,
    },
  });
  const readiness = getCampaignLaunchReadiness(campaign);
  assert.equal(readiness.ready, true);
});

test("prepared audience + complete message => confirmationReady", () => {
  const campaign = readyCampaign();
  const wizard = getCampaignWizardReadiness(campaign);
  assert.equal(wizard.confirmationReady, true);
  assert.equal(wizard.steps.audience, "complete");
  assert.equal(wizard.steps.message, "complete");
  assert.equal(wizard.launchReady, true);
});

test("prepared audience without message blocks confirmation", () => {
  const campaign = readyCampaign({ subject: "", html_content: "" });
  const wizard = getCampaignWizardReadiness(campaign);
  assert.equal(wizard.confirmationReady, false);
  assert.ok(wizard.confirmationBlockers.some((b) => b.code === "message_incomplete"));
  assert.equal(wizard.steps.audience, "complete");
  assert.equal(wizard.steps.message, "incomplete");
});

test("no prepared audience blocks confirmation", () => {
  const campaign = readyCampaign({
    status: CAMPAIGN_STATUS.DRAFT,
    metadata: { audienceSnapshotStale: false },
  });
  const wizard = getCampaignWizardReadiness(campaign);
  assert.equal(wizard.confirmationReady, false);
  assert.ok(wizard.confirmationBlockers.some((b) => b.code === "audience_not_prepared"));
});

test("wizard step states derived from canonical readiness", () => {
  const campaign = readyCampaign();
  const wizard = getCampaignWizardReadiness(campaign);
  assert.deepEqual(wizard.steps, {
    audience: "complete",
    message: "complete",
    preview: "complete",
    confirmation: "available",
  });
});

if (process.exitCode) {
  console.error("\nSome launch readiness tests failed.");
  process.exit(process.exitCode);
}

console.log("\nAll launch readiness regression tests passed.");
