import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
} from "../lib/staging-env-guard.js";
import {
  assertStagingWriteTestAllowed,
  buildStagingTestTradeId,
  maskSupabaseHostname,
  STAGING_WRITE_TEST_MARKER,
} from "../lib/market-data/history/staging-write-test-guard.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SAMPLE_STAGING_URL = "https://stagingtest00000001.supabase.co";
let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
}

function withEnv(overrides, fn) {
  const backup = {};
  for (const key of Object.keys(overrides)) {
    backup[key] = process.env[key];
    if (overrides[key] == null) delete process.env[key];
    else process.env[key] = overrides[key];
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(overrides)) {
      if (backup[key] == null) delete process.env[key];
      else process.env[key] = backup[key];
    }
  }
}

test("requires explicit allow flag", () => {
  withEnv(
    {
      MARKET_HISTORY_TEST_ALLOW_STAGING: undefined,
      STAGING_SUPABASE_URL: SAMPLE_STAGING_URL,
      STAGING_SUPABASE_SERVICE_ROLE_KEY: "test-key",
    },
    () => {
      assert.throws(
        () => assertStagingWriteTestAllowed(process.env),
        (error) => error.code === "STAGING_WRITE_TEST_NOT_ALLOWED",
      );
    },
  );
});

test("rejects production hostname", () => {
  withEnv(
    {
      MARKET_HISTORY_TEST_ALLOW_STAGING: "true",
      STAGING_SUPABASE_URL: `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`,
      STAGING_SUPABASE_SERVICE_ROLE_KEY: "test-key",
    },
    () => {
      assert.throws(
        () => assertStagingWriteTestAllowed(process.env),
        (error) => error.code === "STAGING_WRITE_TEST_PRODUCTION_HOST",
      );
    },
  );
});

test("rejects non-supabase host", () => {
  withEnv(
    {
      MARKET_HISTORY_TEST_ALLOW_STAGING: "true",
      STAGING_SUPABASE_URL: "https://example.com",
      STAGING_SUPABASE_SERVICE_ROLE_KEY: "test-key",
    },
    () => {
      assert.throws(
        () => assertStagingWriteTestAllowed(process.env),
        (error) => error.code === "STAGING_WRITE_TEST_INVALID_HOST",
      );
    },
  );
});

test("accepts staging config with masked hostname", () => {
  withEnv(
    {
      MARKET_HISTORY_TEST_ALLOW_STAGING: "true",
      STAGING_SUPABASE_URL: SAMPLE_STAGING_URL,
      STAGING_SUPABASE_SERVICE_ROLE_KEY: "test-key",
    },
    () => {
      const config = assertStagingWriteTestAllowed(process.env);
      assert.equal(config.url, SAMPLE_STAGING_URL);
      assert.match(config.maskedHostname, /supabase\.co$/);
      assert.doesNotMatch(config.maskedHostname, new RegExp(PRODUCTION_SUPABASE_PROJECT_REF));
    },
  );
});

test("masks hostname without exposing full ref", () => {
  const masked = maskSupabaseHostname(SAMPLE_STAGING_URL);
  assert.equal(masked.includes("stagingtest00000001"), false);
  assert.match(masked, /\.supabase\.co$/);
});

test("trade ids include staging test marker", () => {
  const tradeId = buildStagingTestTradeId("okx", 1, 2);
  assert.match(tradeId, new RegExp(`^${STAGING_WRITE_TEST_MARKER}-`));
});

test("staging script has no hardcoded refs or secrets", () => {
  const source = readFileSync(
    join(ROOT, "scripts/staging-market-history-write-test.mjs"),
    "utf8",
  );
  assert.doesNotMatch(source, /lzgsxdsumnteuwtjfqlm/);
  assert.doesNotMatch(source, /stagingtest00000001/);
  assert.doesNotMatch(source, /SERVICE_ROLE_KEY\s*=\s*["'`]/);
  assert.doesNotMatch(source, /stagingProjectRef/);
  assert.match(source, /assertStagingWriteTestAllowed/);
  assert.match(source, /buildStagingTestTradeId/);
});

test("staging script is not wired into npm scripts", () => {
  const pkg = readFileSync(join(ROOT, "package.json"), "utf8");
  assert.doesNotMatch(pkg, /staging-market-history-write-test/);
});

console.log(`staging-market-history-guard tests passed: ${passed}/${passed}`);
