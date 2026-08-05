#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const env = require("../worker/alerts/price-alerts-env.js");

const original = { ...process.env };
function withEnv(overrides, fn) {
  process.env = { ...original, ...overrides };
  try {
    return fn();
  } finally {
    process.env = { ...original };
  }
}

withEnv(
  {
    NODE_ENV: "production",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key-1234567890",
    PRICE_ALERT_PUSH_ENABLED: "true",
  },
  () => {
    const result = env.validatePriceAlertsEnvironment({ production: true });
    assert.equal(result.ok, false);
    assert.ok(result.invalidRequired.some((row) => row.key === "PRICE_ALERT_PUSH_ENABLED"));
  }
);

withEnv(
  {
    NODE_ENV: "production",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key-1234567890",
    PRICE_ALERT_PUSH_ENABLED: "false",
    PRICE_ALERT_EMAIL_ENABLED: "false",
    PRICE_ALERT_SITE_NOTIFICATIONS_ENABLED: "true",
  },
  () => {
    const result = env.validatePriceAlertsEnvironment({ production: true });
    assert.equal(result.ok, true);
    assert.equal(result.dependencies.pushConfigured, "disabled");
  }
);

console.log("price alert provider feature flags PASS");
