#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { classifyHistoricalIntegrity, FINDING } = require("../worker/lib/price-alert-integrity-classifier.js");

const result = classifyHistoricalIntegrity({
  triggeredAlerts: [
    { id: 1, triggered_at: "2026-01-01T00:00:00Z", email_sent_at: "2026-01-01T00:01:00Z" },
    { id: 2, triggered_at: "2026-01-01T00:00:00Z", status: "triggered" },
    { id: 3, triggered_at: null },
  ],
  deliveryAttempts: [{ alert_id: 1, channel: "email", status: "sent" }],
  notificationsByAlert: new Map([["1", [{ id: "n1" }]]]),
});

assert.equal(result.unknownCount, 0);
assert.ok(result.findings.some((f) => f.classification === FINDING.VALID_LEGACY_DELIVERED));
assert.ok(result.findings.some((f) => f.classification === FINDING.VALID_LEGACY_UNKNOWN_CHANNELS));
assert.ok(result.findings.some((f) => f.classification === FINDING.INVALID));

console.log("price alert legacy integrity PASS");
