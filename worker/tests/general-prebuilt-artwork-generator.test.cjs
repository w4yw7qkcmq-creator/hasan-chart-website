#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "lib", "news-images");
const repoRoot = path.join(__dirname, "..", "..");

const {
  SAFETY_ENV,
  parseCliArgs,
  assertSafetyGate,
  buildDryRunPlan,
  buildWorkQueue,
  FORBIDDEN_MODULE_PATTERNS,
} = require(path.join(root, "general-prebuilt-artwork-generator"));
const { buildGeneralPrebuiltOverlaySvg } = require(path.join(root, "general-prebuilt-square-composer"));

function testSafetyGateBlocksWithoutEnv() {
  let blocked = false;
  try {
    assertSafetyGate({ dryRun: false });
  } catch (error) {
    blocked = error.code === "SAFETY_GATE_BLOCKED";
  }
  assert.strictEqual(blocked, true);
}

function testDryRunNoOpenAI() {
  const plan = buildDryRunPlan({ dryRun: true });
  assert.strictEqual(plan.dryRun, true);
  assert.strictEqual(plan.promptValidation.ok, true);
  assert.strictEqual(plan.totalManifestAssets, 50);
  assert.strictEqual(plan.plannedCount, 50);
}

function testOverlayUsesEconomicNewsiBrand() {
  const svg = buildGeneralPrebuiltOverlaySvg({
    displayTitle: "OIL PRICES",
    subtitle: "MARKET RALLY",
    categoryLabel: "Energy Markets",
  });
  assert.match(svg, /Economic Newsi/);
  assert.match(svg, />EN</);
  assert.match(svg, /Energy Markets/);
  assert.doesNotMatch(svg, /HasaN CharT/);
  assert.doesNotMatch(svg, /Macro Data/);
}

function testGeneratorReuseArchitecture() {
  const generatorSource = fs.readFileSync(
    path.join(repoRoot, "worker/lib/news-images/general-prebuilt-artwork-generator.js"),
    "utf8"
  );
  assert.match(generatorSource, /createSceneOpenAIImageProvider/);
  assert.match(generatorSource, /inspectSquareBackgroundForTypography/);
  assert.match(generatorSource, /withMetadata\(false\)/);
  assert.match(generatorSource, /ALLOW_GENERAL_PREBUILT_ARTWORK_GENERATION/);
}

function testForbiddenCouplingPatterns() {
  const generatorSource = fs.readFileSync(
    path.join(repoRoot, "worker/lib/news-images/general-prebuilt-artwork-generator.js"),
    "utf8"
  );
  for (const pattern of FORBIDDEN_MODULE_PATTERNS) {
    assert.doesNotMatch(generatorSource, new RegExp(`require\\(.+${pattern}`));
  }
}

function testCliParse() {
  const options = parseCliArgs(["--dry-run", "--category=gold", "--limit=2"]);
  assert.strictEqual(options.dryRun, true);
  assert.strictEqual(options.category, "gold");
  assert.strictEqual(options.limit, 2);
  const queue = buildWorkQueue({ category: "gold", poolBaseDir: path.join(repoRoot, "public/news/general-prebuilt") });
  assert.strictEqual(queue.length, 5);
}

function run() {
  testSafetyGateBlocksWithoutEnv();
  testDryRunNoOpenAI();
  testOverlayUsesEconomicNewsiBrand();
  testGeneratorReuseArchitecture();
  testForbiddenCouplingPatterns();
  testCliParse();
  console.log("general-prebuilt-artwork-generator.test.cjs: all tests passed");
  console.log(`safety env key: ${SAFETY_ENV}`);
}

run();
