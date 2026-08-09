#!/usr/bin/env node

const assert = require("assert");
const path = require("path");

const { runAllGoldenFixtures, REPLAY_MODES } = require(path.join(
  __dirname,
  "..",
  "lib",
  "news-intelligence",
  "autonomy",
  "replay-harness"
));

async function main() {
  const result = await runAllGoldenFixtures({
    mode: REPLAY_MODES.REPLAY_VALIDATE,
    enablePhase2Editorial: true,
  });
  assert.strictEqual(result.loadedFixtures, 20, `expected 20 loaded fixtures, got ${result.loadedFixtures}`);
  assert.strictEqual(result.executedFixtures, 20, `expected 20 executed fixtures, got ${result.executedFixtures}`);
  console.log(
    "golden-fixtures-20.test.cjs:",
    JSON.stringify({
      loadedFixtures: result.loadedFixtures,
      executedFixtures: result.executedFixtures,
      passed: result.results.filter((r) => r.ok !== false || r.reasonCode).length,
    })
  );
  console.log("golden-fixtures-20.test.cjs: all fixtures executed");
}

main().catch((error) => {
  console.error("golden-fixtures-20.test.cjs FAIL", error);
  process.exit(1);
});
