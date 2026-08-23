#!/usr/bin/env node
/**
 * E3.5 — batch eligibility + post-launch runtime readiness tests.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  evaluateMarketingProfileEligibility,
  evaluateRecipientRowEligibility,
  marketingEvaluationToRecipientResult,
} from "../lib/email-campaign/batch-eligibility.js";
import {
  buildPostLaunchWizardReadiness,
  getCampaignWizardReadiness,
  isPostLaunchCampaignStatus,
} from "../lib/email-campaign/launch-readiness.js";
import { CAMPAIGN_STATUS } from "../lib/email-campaign/constants.js";
import { EXCLUSION_REASONS } from "../lib/email-policy/constants.js";
import { evaluateMarketingEligibleInMemory } from "../lib/email-policy/audience-metrics.js";

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}:`, error.message);
    process.exitCode = 1;
  }
}

function buildContext({ optedIn = true, unsubscribed = false, suppressed = false } = {}) {
  const userId = randomUUID();
  const email = "qa@example.com";
  const prefsByUser = new Map([
    [
      userId,
      {
        user_id: userId,
        marketing_opt_in: optedIn,
        global_unsubscribed_at: unsubscribed ? new Date().toISOString() : null,
      },
    ],
  ]);
  const hardSuppressedEmails = suppressed ? new Set([email]) : new Set();
  return { userId, email, prefsByUser, hardSuppressedEmails };
}

test("batch evaluator matches in-memory policy for eligible user", () => {
  const { userId, email, prefsByUser, hardSuppressedEmails } = buildContext({ optedIn: true });
  const profile = { id: userId, email };
  const context = { prefsByUser, hardSuppressedEmails };

  const batch = evaluateMarketingProfileEligibility(profile, context);
  const direct = evaluateMarketingEligibleInMemory(profile, prefsByUser, hardSuppressedEmails);

  assert.deepEqual(batch, direct);
  assert.equal(marketingEvaluationToRecipientResult(batch).eligible, true);
});

test("batch evaluator excludes unsubscribed and suppressed users", () => {
  const unsub = buildContext({ optedIn: true, unsubscribed: true });
  const unsubEval = evaluateMarketingProfileEligibility(
    { id: unsub.userId, email: unsub.email },
    unsub
  );
  assert.equal(unsubEval.allowed, false);
  assert.equal(unsubEval.reason, EXCLUSION_REASONS.GLOBAL_UNSUBSCRIBED);

  const supp = buildContext({ optedIn: true, suppressed: true });
  const suppEval = evaluateMarketingProfileEligibility(
    { id: supp.userId, email: supp.email },
    supp
  );
  assert.equal(suppEval.allowed, false);
  assert.equal(suppEval.reason, EXCLUSION_REASONS.HARD_SUPPRESSED);
});

test("recipient row evaluation uses same batch semantics", () => {
  const { userId, email, prefsByUser, hardSuppressedEmails } = buildContext({ optedIn: false });
  const context = { prefsByUser, hardSuppressedEmails };
  const result = evaluateRecipientRowEligibility(
    { user_id: userId, normalized_email: email },
    context
  );
  assert.equal(result.eligible, false);
  assert.equal(result.reason, EXCLUSION_REASONS.MARKETING_NOT_OPTED_IN);
});

test("post-launch sending status does not expose invalid_status blocker", () => {
  assert.equal(isPostLaunchCampaignStatus(CAMPAIGN_STATUS.SENDING), true);
  const readiness = getCampaignWizardReadiness({
    id: randomUUID(),
    name: "QA",
    subject: "Hi",
    html_content: "<p>Hi</p>",
    category: "marketing",
    status: CAMPAIGN_STATUS.SENDING,
    eligible_count: 1,
    audience_snapshot_count: 102,
    queued_count: 1,
    delivered_count: 0,
    metadata: {
      snapshotAt: new Date().toISOString(),
      audienceStats: { eligible: 1, excluded: 101, initial: 102 },
    },
  });

  assert.equal(readiness.runtimeActive, true);
  assert.equal(readiness.runtimePhase, CAMPAIGN_STATUS.SENDING);
  assert.equal(readiness.launchReady, false);
  assert.equal(readiness.blockers.length, 0);
  assert.ok(!readiness.blockers.some((b) => b.code === "invalid_status"));
});

test("completed runtime panel readiness uses metrics", () => {
  const readiness = buildPostLaunchWizardReadiness({
    id: randomUUID(),
    status: CAMPAIGN_STATUS.COMPLETED,
    eligible_count: 1,
    queued_count: 1,
    delivered_count: 1,
    failed_count: 0,
    metadata: { audienceStats: { eligible: 1, excluded: 101, initial: 102 } },
  });

  assert.equal(readiness.runtimePhase, CAMPAIGN_STATUS.COMPLETED);
  assert.equal(readiness.metrics.delivered, 1);
  assert.equal(readiness.showPreLaunchReadiness, false);
});

test("ready campaign still uses pre-launch readiness", () => {
  const readiness = getCampaignWizardReadiness({
    id: randomUUID(),
    name: "QA",
    subject: "Hi",
    html_content: "<p>Hi</p>",
    category: "marketing",
    status: CAMPAIGN_STATUS.READY,
    eligible_count: 1,
    audience_snapshot_count: 102,
    audience_type: "all_eligible",
    audience_filter: {},
    metadata: {
      snapshotAt: new Date().toISOString(),
      audienceStats: { eligible: 1, excluded: 101, initial: 102 },
      audienceSnapshotStale: false,
      snapshotContentFingerprint: JSON.stringify({
        audienceType: "all_eligible",
        audienceFilter: {},
      }),
    },
  });

  assert.equal(readiness.runtimeActive, undefined);
  assert.equal(readiness.launchReady, true);
});

console.log("Done.");
