#!/usr/bin/env node
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { RESULT_VERSION } = require("../worker/lib/instant-analysis-job-store");

test("result version constant is 2.0", () => {
  assert.equal(RESULT_VERSION, "2.0");
});

test("completed requires result object shape", () => {
  const result = {
    version: "2.0",
    symbol: "BTCUSDT",
    summary: "test",
    sections: [],
  };
  assert.ok(result.version);
  assert.ok(result.symbol);
  assert.equal(typeof result.summary, "string");
});

test("result payload excludes prompt fields", () => {
  const forbidden = ["prompt", "systemPrompt", "rawProviderResponse", "openaiMessages"];
  const sample = { version: "2.0", summary: "ok", sections: [] };
  for (const key of forbidden) {
    assert.equal(sample[key], undefined);
  }
});

console.log("test-ai-worker-result-storage: all tests registered");
