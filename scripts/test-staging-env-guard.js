#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  assertStagingSupabaseConfig,
  extractSupabaseProjectRef,
  maskProjectRef,
} from "../lib/staging-env-guard.js";
import { loadStagingEnvFile } from "../lib/load-staging-env.js";

function testMaskProjectRef() {
  assert.equal(maskProjectRef("tvkhuijufhnpqpchkyss"), "tvkh***kyss");
}

function testRejectProductionRef() {
  assert.throws(
    () =>
      assertStagingSupabaseConfig({
        projectRef: PRODUCTION_SUPABASE_PROJECT_REF,
        url: `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`,
      }),
    (error) => error.code === "STAGING_MATCHES_PRODUCTION_REF"
  );
}

function testRejectProductionUrl() {
  assert.throws(
    () =>
      assertStagingSupabaseConfig({
        projectRef: "tvkhuijufhnpqpchkyss",
        url: `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`,
      }),
    (error) => error.code === "STAGING_MATCHES_PRODUCTION_URL"
  );
}

function testAcceptStagingRef() {
  const result = assertStagingSupabaseConfig({
    projectRef: "tvkhuijufhnpqpchkyss",
    url: "https://tvkhuijufhnpqpchkyss.supabase.co",
  });
  assert.equal(result.projectRef, "tvkhuijufhnpqpchkyss");
}

function testExtractRef() {
  assert.equal(
    extractSupabaseProjectRef("https://tvkhuijufhnpqpchkyss.supabase.co"),
    "tvkhuijufhnpqpchkyss"
  );
}

function testLoadStagingEnvFile() {
  const loaded = loadStagingEnvFile();
  assert.notEqual(loaded.projectRef, PRODUCTION_SUPABASE_PROJECT_REF);
  assert.equal(process.env.APP_ENV, "staging");
}

const tests = [
  ["mask project ref", testMaskProjectRef],
  ["reject production ref", testRejectProductionRef],
  ["reject production url", testRejectProductionUrl],
  ["accept staging ref", testAcceptStagingRef],
  ["extract ref from url", testExtractRef],
  ["load .env.staging.local", testLoadStagingEnvFile],
];

for (const [name, run] of tests) {
  run();
  console.log(`✓ ${name}`);
}

console.log(`\n${tests.length}/${tests.length} staging env guard checks passed`);
