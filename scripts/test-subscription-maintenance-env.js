#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const {
  validateApiEnvironment,
  validateCronCallerEnvironment,
  assertApiEnvironmentOrThrow,
  assertCronCallerEnvironmentOrThrow,
  PRODUCTION_API_HOST,
} = require("../worker/lib/subscription-maintenance-env.js");

const BASE_API = {
  NODE_ENV: "production",
  RAILWAY_ENVIRONMENT: "production",
  PORT: "8080",
  NEXT_PUBLIC_SUPABASE_URL: "https://lzgsxdsumnteuwtjfqlm.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "x".repeat(40),
  IAM_WORKER_AUTH: "true",
  IAM_SERVICE_SECRET_PEPPER: "p".repeat(64),
  IAM_SUBSCRIPTION_MAINTENANCE_SECRET: "s".repeat(48),
  IAM_SUBSCRIPTION_MAINTENANCE_SERVICE_ACCOUNT_ID: "subscription-maintenance-worker",
  SUBSCRIPTION_MAINTENANCE_WORKER_ENABLED: "true",
  RESEND_API_KEY: "re_" + "k".repeat(20),
  EMAIL_FROM: "HasaN CharT World <support@example.com>",
  EMAIL_REPLY_TO: "support@example.com",
  NEXT_PUBLIC_SITE_URL: "https://www.hasanchartworld.com",
};

const BASE_CRON = {
  NODE_ENV: "production",
  RAILWAY_ENVIRONMENT: "production",
  SUBSCRIPTION_MAINTENANCE_API_URL: `https://${PRODUCTION_API_HOST}`,
  IAM_SUBSCRIPTION_MAINTENANCE_SECRET: "s".repeat(48),
  IAM_SUBSCRIPTION_MAINTENANCE_SERVICE_ACCOUNT_ID: "subscription-maintenance-worker",
  SUBSCRIPTION_MAINTENANCE_DRY_RUN: "false",
  SUBSCRIPTION_MAINTENANCE_TIMEOUT_MS: "60000",
};

function withEnv(overrides, fn) {
  const prev = { ...process.env };
  process.env = { ...prev, ...overrides };
  try {
    return fn();
  } finally {
    process.env = prev;
  }
}

test("API contract passes with required production env", () => {
  withEnv(BASE_API, () => {
    const result = validateApiEnvironment({ production: true });
    assert.equal(result.ok, true);
    assertApiEnvironmentOrThrow({ production: true });
  });
});

test("API contract rejects missing SUPABASE_SERVICE_ROLE_KEY", () => {
  withEnv({ ...BASE_API, SUPABASE_SERVICE_ROLE_KEY: "" }, () => {
    const result = validateApiEnvironment({ production: true });
    assert.equal(result.ok, false);
    assert.ok(result.missingRequired.includes("SUPABASE_SERVICE_ROLE_KEY"));
  });
});

test("API contract rejects http Supabase URL in production", () => {
  withEnv({ ...BASE_API, NEXT_PUBLIC_SUPABASE_URL: "http://insecure.example.com" }, () => {
    const result = validateApiEnvironment({ production: true });
    assert.equal(result.ok, false);
  });
});

test("API contract rejects wrong account id", () => {
  withEnv({ ...BASE_API, IAM_SUBSCRIPTION_MAINTENANCE_SERVICE_ACCOUNT_ID: "cron" }, () => {
    const result = validateApiEnvironment({ production: true });
    assert.equal(result.ok, false);
  });
});

test("API contract rejects weak pepper", () => {
  withEnv({ ...BASE_API, IAM_SERVICE_SECRET_PEPPER: "changeme" }, () => {
    const result = validateApiEnvironment({ production: true });
    assert.equal(result.ok, false);
  });
});

test("cron caller contract passes with required env", () => {
  withEnv(BASE_CRON, () => {
    const result = validateCronCallerEnvironment({ production: true });
    assert.equal(result.ok, true);
    assertCronCallerEnvironmentOrThrow({ production: true });
  });
});

test("cron caller rejects non-https API URL in production", () => {
  withEnv({ ...BASE_CRON, SUBSCRIPTION_MAINTENANCE_API_URL: "http://bad.example.com" }, () => {
    const result = validateCronCallerEnvironment({ production: true });
    assert.equal(result.ok, false);
  });
});

test("cron caller rejects host mismatch in production", () => {
  withEnv({ ...BASE_CRON, SUBSCRIPTION_MAINTENANCE_API_URL: "https://wrong.example.com" }, () => {
    const result = validateCronCallerEnvironment({ production: true });
    assert.equal(result.ok, false);
  });
});

test("cron caller rejects invalid timeout", () => {
  withEnv({ ...BASE_CRON, SUBSCRIPTION_MAINTENANCE_TIMEOUT_MS: "999999" }, () => {
    const result = validateCronCallerEnvironment({ production: true });
    assert.equal(result.ok, false);
  });
});

console.log("subscription-maintenance env contract tests scheduled");
