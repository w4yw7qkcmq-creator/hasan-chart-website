#!/usr/bin/env node

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const {
  parseCliArgs,
  buildDryRunPlan,
  runGenerator,
  formatSummaryReport,
  assertSafetyGate,
} = require(path.join(scriptDir, "..", "worker", "lib", "news-images", "economic-fast-lane-artwork-generator.js"));

async function main() {
  const options = parseCliArgs(process.argv.slice(2));

  if (options.dryRun) {
    const plan = buildDryRunPlan(options);
    console.log("ECONOMIC_FAST_LANE_ARTWORK_DRY_RUN");
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  assertSafetyGate(options);
  const summary = await runGenerator(options);
  console.log("ECONOMIC_FAST_LANE_ARTWORK_SUMMARY");
  console.log(formatSummaryReport(summary));
  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  if (error.code === "SAFETY_GATE_BLOCKED") {
    console.error(error.message);
  } else {
    console.error("ECONOMIC_FAST_LANE_ARTWORK_FAILED", error.message);
  }
  process.exit(1);
});
