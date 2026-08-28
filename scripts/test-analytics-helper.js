#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  buildAnalyticsPagePath,
  getAnalyticsMeasurementId,
  isAnalyticsRouteAllowed,
  sanitizeAnalyticsProperties,
  sanitizePageLocation,
} from "../lib/analytics.js";
import { ANALYTICS_EVENTS } from "../lib/analytics-events.js";

assert.equal(getAnalyticsMeasurementId(), "");
process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = "G-TEST1234";
assert.equal(getAnalyticsMeasurementId(), "G-TEST1234");

assert.equal(isAnalyticsRouteAllowed("/news"), true);
assert.equal(isAnalyticsRouteAllowed("/admin/news"), false);

const sanitized = sanitizeAnalyticsProperties({
  plan: "spot-month",
  email: "secret@example.com",
  user_id: "abc",
  placement: "news",
});
assert.equal(sanitized.plan, "spot-month");
assert.equal(sanitized.placement, "news");
assert.equal(sanitized.email, undefined);
assert.equal(sanitized.user_id, undefined);

const params = new URLSearchParams("utm_source=telegram&token=abc&next=/admin");
assert.equal(buildAnalyticsPagePath("/subscriptions", params), "/subscriptions?utm_source=telegram");
assert.equal(sanitizePageLocation("/login", params), "/login?utm_source=telegram");

assert.equal(ANALYTICS_EVENTS.REGISTRATION_COMPLETED, "registration_completed");

console.log("analytics helper PASS");
