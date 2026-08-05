#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "worker/price-alert-email.js"), "utf8");
assert.match(source, /claimPriceAlertEmailSend/);
assert.match(source, /email_sent_at/);
assert.match(source, /PRICE_ALERT_EMAIL_DUPLICATE_SKIPPED/);

console.log("price alert email outbox PASS");
