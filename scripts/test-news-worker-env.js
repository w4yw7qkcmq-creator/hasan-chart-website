#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const {
  validateNewsWorkerEnvironment,
  assertNewsWorkerEnvironmentOrThrow,
} = require("../worker/news/news-worker-env.js");

const BASE = {
  NODE_ENV: "production",
  RAILWAY_ENVIRONMENT: "production",
  PORT: "8080",
  SUPABASE_URL: "https://lzgsxdsumnteuwtjfqlm.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "x".repeat(40),
  TELEGRAM_BOT_TOKEN: "1".repeat(40),
  TELEGRAM_CHANNEL_ID: "-1001234567890",
  OPENAI_API_KEY: "sk-" + "k".repeat(40),
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

test("news worker env passes with required production vars", () => {
  withEnv(BASE, () => {
    const result = validateNewsWorkerEnvironment({ production: true });
    assert.equal(result.ok, true);
    assertNewsWorkerEnvironmentOrThrow({ production: true });
  });
});

test("news worker env rejects missing TELEGRAM_BOT_TOKEN", () => {
  withEnv({ ...BASE, TELEGRAM_BOT_TOKEN: "" }, () => {
    assert.equal(validateNewsWorkerEnvironment({ production: true }).ok, false);
  });
});

test("news worker env rejects invalid channel id", () => {
  withEnv({ ...BASE, TELEGRAM_CHANNEL_ID: "not-a-channel" }, () => {
    assert.equal(validateNewsWorkerEnvironment({ production: true }).ok, false);
  });
});

test("news worker env rejects invalid poll interval", () => {
  withEnv({ ...BASE, NEWS_POLL_INTERVAL_MS: "999999" }, () => {
    assert.equal(validateNewsWorkerEnvironment({ production: true }).ok, false);
  });
});

console.log("news worker env tests scheduled");
