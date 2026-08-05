#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const env = require("../worker/alerts/price-alerts-env.js");

const original = { ...process.env };

function restoreEnv() {
  process.env = { ...original };
}

function withEnv(overrides, fn) {
  process.env = { ...original, ...overrides };
  try {
    return fn();
  } finally {
    restoreEnv();
  }
}

withEnv(
  {
    NODE_ENV: "production",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key-1234567890",
    PRICE_ALERT_CHECK_INTERVAL_MS: "30000",
  },
  () => {
    const result = env.validatePriceAlertsEnvironment({ production: true });
    assert.equal(result.ok, true);
    assert.equal(result.checkIntervalMs, 30000);
  }
);

withEnv(
  {
    NODE_ENV: "production",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key-1234567890",
    PRICE_ALERT_CHECK_INTERVAL_MS: "60000",
  },
  () => {
    const result = env.validatePriceAlertsEnvironment({ production: true });
    assert.equal(result.ok, true);
    assert.equal(result.checkIntervalMs, 30000);
  }
);

withEnv({}, () => {
  const result = env.validatePriceAlertsEnvironment({ production: true });
  assert.equal(result.ok, false);
  assert.ok(result.missingRequiredCount > 0);
});

const known = env.listKnownVariables();
assert.ok(known.every((row) => env.classifyPriceAlertVariable(row.variable) !== "UNKNOWN"));

console.log("price alerts env PASS");
