#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

const root = join(import.meta.dirname, "..");
const read = (p) => readFileSync(join(root, p), "utf8");

const campaignToml = read("worker/railway.email-campaign.toml");
const campaignNix = read("worker/nixpacks.email-campaign.toml");
const workerPkg = read("worker/package.json");
const processor = read("worker/email-campaign-processor.js");

assert.match(campaignToml, /email-campaign-processor/);
assert.match(campaignNix, /email-campaign-processor/);
assert.match(workerPkg, /email-campaign-processor/);
assert.match(processor, /process-email-campaigns/);
assert.match(processor, /CRON_SECRET/);
assert.match(processor, /NEXT_PUBLIC_SITE_URL|SITE_URL/);
assert.match(processor, /EMAIL_CAMPAIGN_PROCESSOR_ENABLED/);
assert.match(processor, /oneshot-cron-bridge/);
assert.match(campaignToml, /cronSchedule = "\*\/5 \* \* \* \*"/);
assert.match(campaignToml, /restartPolicyType = "NEVER"/);
assert.doesNotMatch(campaignToml, /restartPolicyType = "ON_FAILURE"/);

console.log("email campaign processor railway config PASS");
