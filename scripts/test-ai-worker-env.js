#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const env = require("../worker/ai/ai-worker-env.js");

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
    AI_WORKER_ENABLED: "true",
    PRICE_ALERT_WORKER_ENABLED: "false",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key-1234567890",
    OPENAI_API_KEY: "sk-test-openai-key-1234567890",
    IAM_SERVICE_SECRET_PEPPER: "a".repeat(48),
  },
  () => {
    const result = env.validateAiWorkerEnvironment({ production: true });
    assert.equal(result.ok, true);
    assert.equal(result.machineAuth.serviceAccountId, "instant-analysis-worker");
  }
);

withEnv(
  {
    AI_WORKER_ENABLED: "true",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key-1234567890",
  },
  () => {
    const result = env.validateAiWorkerEnvironment({ production: true });
    assert.equal(result.ok, false);
    assert.ok(result.missingRequired.includes("OPENAI_API_KEY"));
  }
);

withEnv({ AI_WORKER_ENABLED: "true", PRICE_ALERT_WORKER_ENABLED: "false" }, () => {
  assert.equal(env.isAiWorkerPrimaryMode(), true);
});

const known = env.listKnownVariables();
assert.ok(known.every((row) => env.classifyAiWorkerVariable(row.variable) !== "UNKNOWN"));

console.log("ai worker env PASS");
