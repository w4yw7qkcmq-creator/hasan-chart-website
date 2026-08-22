#!/usr/bin/env node

import { EMAIL_CATEGORIES } from "../lib/email-categories.js";
import { EXCLUSION_REASONS } from "../lib/email-policy/constants.js";
import {
  countEligibleFromSnapshot,
  evaluateMarketingEligibleInMemory,
} from "../lib/email-policy/audience-metrics.js";
import { evaluateEmailSendPolicy } from "../lib/email-policy/evaluate.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const profiles = [
  { id: "u1", email: "opted-in@example.com" },
  { id: "u2", email: "never@example.com" },
  { id: "u3", email: "unsub@example.com" },
  { id: "u4", email: "bad-email" },
];

const prefsByUser = new Map([
  ["u1", { marketing_opt_in: true, global_unsubscribed_at: null }],
  ["u2", { marketing_opt_in: false, global_unsubscribed_at: null }],
  ["u3", { marketing_opt_in: false, global_unsubscribed_at: "2026-01-01T00:00:00.000Z" }],
]);

const hardSuppressedEmails = new Set(["blocked@example.com"]);

const batch = countEligibleFromSnapshot(profiles, prefsByUser, hardSuppressedEmails);
assert(batch.eligible === 1, "batch eligible count");
assert(batch.exclusionBreakdown[EXCLUSION_REASONS.MARKETING_NOT_OPTED_IN] === 1, "never opted");
assert(batch.exclusionBreakdown[EXCLUSION_REASONS.GLOBAL_UNSUBSCRIBED] === 1, "unsubscribed");
assert(batch.exclusionBreakdown[EXCLUSION_REASONS.INVALID_EMAIL_FORMAT] === 1, "invalid format");

const inMemory = evaluateMarketingEligibleInMemory(
  profiles[0],
  prefsByUser,
  hardSuppressedEmails
);
assert(inMemory.allowed === true, "in-memory opted-in allowed");

console.log("AUDIENCE METRICS BATCH TESTS PASS");
