#!/usr/bin/env node
/**
 * Phase E2 — Email campaigns test suite (mocked provider, no real sends).
 */
import assert from "node:assert/strict";
import {
  CAMPAIGN_STATUS,
  CAMPAIGN_AUDIENCE_TYPES,
  buildCampaignOutboxIdempotencyKey,
  canEditCampaignContent,
  canLaunchCampaign,
  canPauseCampaign,
  canResumeCampaign,
  canCancelCampaign,
  canPrepareAudience,
  canTransitionCampaignStatus,
  CAMPAIGN_OUTBOX_PRIORITY,
  TRANSACTIONAL_OUTBOX_PRIORITY,
} from "../lib/email-campaign/constants.js";
import { normalizeAudienceFilter } from "../lib/email-campaign/audience.js";
import { IAM_PERMISSIONS } from "../lib/iam/constants.js";
import { ROUTE_PERMISSIONS } from "../lib/iam/route-permissions.js";
import {
  createEmailUnsubscribeToken,
  verifyEmailUnsubscribeToken,
} from "../lib/email-campaign/unsubscribe-token.js";
import { sanitizeCampaignHtml } from "../lib/email-campaign/renderer.js";

process.env.EMAIL_UNSUBSCRIBE_SECRET = "test-unsubscribe-secret-32chars-min";

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}:`, error.message);
    process.exitCode = 1;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}:`, error.message);
    process.exitCode = 1;
  }
}

test("state machine draft -> ready", () => {
  assert.equal(canTransitionCampaignStatus(CAMPAIGN_STATUS.DRAFT, CAMPAIGN_STATUS.READY), true);
  assert.equal(canTransitionCampaignStatus(CAMPAIGN_STATUS.COMPLETED, CAMPAIGN_STATUS.SENDING), false);
});

test("edit locked after sending", () => {
  assert.equal(canEditCampaignContent(CAMPAIGN_STATUS.DRAFT), true);
  assert.equal(canEditCampaignContent(CAMPAIGN_STATUS.SENDING), false);
});

test("launch only from ready", () => {
  assert.equal(canLaunchCampaign(CAMPAIGN_STATUS.READY), true);
  assert.equal(canLaunchCampaign(CAMPAIGN_STATUS.DRAFT), false);
});

test("deterministic outbox idempotency key", () => {
  const key = buildCampaignOutboxIdempotencyKey("camp-1", "rec-1");
  assert.equal(key, "campaign/camp-1/recipient/rec-1");
});

test("sanitize strips script tags", () => {
  const out = sanitizeCampaignHtml("<p>Hi</p><script>alert(1)</script>");
  assert.match(out, /<p>Hi<\/p>/);
  assert.doesNotMatch(out, /script/i);
});

test("unsubscribe token roundtrip", () => {
  const token = createEmailUnsubscribeToken({
    userId: "11111111-1111-1111-1111-111111111111",
    normalizedEmail: "user@example.com",
    campaignId: "22222222-2222-2222-2222-222222222222",
  });
  const verified = verifyEmailUnsubscribeToken(token);
  assert.equal(verified.valid, true);
  assert.equal(verified.normalizedEmail, "user@example.com");
});

test("tampered unsubscribe token rejected", () => {
  const token = createEmailUnsubscribeToken({
    userId: "11111111-1111-1111-1111-111111111111",
    normalizedEmail: "user@example.com",
  });
  const verified = verifyEmailUnsubscribeToken(`${token}x`);
  assert.equal(verified.valid, false);
});

test("pause only while sending", () => {
  assert.equal(canPauseCampaign(CAMPAIGN_STATUS.SENDING), true);
  assert.equal(canPauseCampaign(CAMPAIGN_STATUS.READY), false);
});

test("resume only while paused", () => {
  assert.equal(canResumeCampaign(CAMPAIGN_STATUS.PAUSED), true);
  assert.equal(canResumeCampaign(CAMPAIGN_STATUS.SENDING), false);
});

test("cancel allowed from active states", () => {
  assert.equal(canCancelCampaign(CAMPAIGN_STATUS.DRAFT), true);
  assert.equal(canCancelCampaign(CAMPAIGN_STATUS.SENDING), true);
  assert.equal(canCancelCampaign(CAMPAIGN_STATUS.COMPLETED), false);
});

test("audience prepare only draft/ready", () => {
  assert.equal(canPrepareAudience(CAMPAIGN_STATUS.DRAFT), true);
  assert.equal(canPrepareAudience(CAMPAIGN_STATUS.SENDING), false);
});

test("selected users audience dedupes ids", () => {
  const filter = normalizeAudienceFilter(CAMPAIGN_AUDIENCE_TYPES.SELECTED_USERS, {
    userIds: ["a", "a", "b", ""],
  });
  assert.deepEqual(filter.userIds, ["a", "b"]);
});

test("bulk priority lower than transactional", () => {
  assert.ok(CAMPAIGN_OUTBOX_PRIORITY > TRANSACTIONAL_OUTBOX_PRIORITY);
});

test("launch route requires send permission", () => {
  assert.equal(
    ROUTE_PERMISSIONS["POST /api/admin/email-campaigns/[id]/launch"],
    IAM_PERMISSIONS.EMAIL_CAMPAIGN_SEND
  );
  assert.equal(
    ROUTE_PERMISSIONS["GET /api/admin/email-campaigns"],
    IAM_PERMISSIONS.EMAIL_CAMPAIGN_READ
  );
});

test("read permission does not grant send", () => {
  assert.notEqual(IAM_PERMISSIONS.EMAIL_CAMPAIGN_READ, IAM_PERMISSIONS.EMAIL_CAMPAIGN_SEND);
});

await testAsync("duplicate idempotency keys stable", async () => {
  const a = buildCampaignOutboxIdempotencyKey("c", "r");
  const b = buildCampaignOutboxIdempotencyKey("c", "r");
  assert.equal(a, b);
});

if (process.exitCode) {
  console.error("\nSome E2 tests failed.");
  process.exit(process.exitCode);
}

console.log("\nAll Phase E2 campaign tests passed.");
