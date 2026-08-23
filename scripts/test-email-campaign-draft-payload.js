#!/usr/bin/env node
/**
 * Regression tests — campaign name persistence in draft payloads.
 */
import assert from "node:assert/strict";
import {
  buildAudienceDraftPatch,
  buildMessageDraftPatch,
  localizeCampaignApiError,
  resolveCampaignNamePatch,
  resolveEffectiveCampaignName,
} from "../lib/email-campaign/draft-payload.js";

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}:`, error.message);
    process.exitCode = 1;
  }
}

test("resolveEffectiveCampaignName prefers form then campaign", () => {
  assert.equal(resolveEffectiveCampaignName({ formName: "A", campaignName: "B" }), "A");
  assert.equal(resolveEffectiveCampaignName({ formName: "", campaignName: "B" }), "B");
  assert.equal(resolveEffectiveCampaignName({ formName: "  ", campaignName: "B" }), "B");
});

test("message patch omits name when unchanged on server", () => {
  const patch = buildMessageDraftPatch({
    subject: "Hi",
    previewText: "Preview",
    htmlContent: "<p>Body</p>",
    formName: "",
    campaignName: "QA Campaign",
  });
  assert.equal(patch.name, undefined);
  assert.equal(patch.subject, "Hi");
});

test("message patch includes name only when edited", () => {
  const patch = buildMessageDraftPatch({
    subject: "Hi",
    previewText: "",
    htmlContent: "<p>Body</p>",
    formName: "Updated Name",
    campaignName: "QA Campaign",
  });
  assert.equal(patch.name, "Updated Name");
});

test("message patch without name does not send empty string", () => {
  const patch = buildMessageDraftPatch({
    subject: "Hi",
    previewText: "",
    htmlContent: "<p>Body</p>",
    formName: "",
    campaignName: "",
  });
  assert.equal("name" in patch, false);
});

test("resolveCampaignNamePatch preserves stored name on empty patch value", () => {
  const result = resolveCampaignNamePatch("QA Campaign", "");
  assert.equal(result.action, "preserve");
  assert.equal(result.value, "QA Campaign");
});

test("resolveCampaignNamePatch omits when name not in patch", () => {
  assert.equal(resolveCampaignNamePatch("QA Campaign", undefined).action, "omit");
});

test("resolveCampaignNamePatch rejects empty name when none stored", () => {
  const result = resolveCampaignNamePatch("", "");
  assert.equal(result.action, "reject");
  assert.equal(result.error, "اسم الحملة مطلوب");
});

test("audience patch requires name", () => {
  assert.throws(() => buildAudienceDraftPatch({ name: "" }), /اسم الحملة مطلوب/);
  const patch = buildAudienceDraftPatch({
    name: "QA Campaign",
    subject: "",
    previewText: "",
    htmlContent: "",
    audienceType: "all_eligible",
    audienceFilter: {},
  });
  assert.equal(patch.name, "QA Campaign");
});

test("localizeCampaignApiError maps legacy English message", () => {
  const localized = localizeCampaignApiError("Campaign name is required");
  assert.match(localized, /اسم الحملة مطلوب/);
});

if (process.exitCode) {
  console.error("\nSome campaign draft payload tests failed.");
  process.exit(process.exitCode);
}

console.log("\nAll campaign draft payload tests passed.");
