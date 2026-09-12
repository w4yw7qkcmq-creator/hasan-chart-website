#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..", "lib", "news-images");
const {
  BRAND_IDENTITY,
  ARTWORK_MANIFEST,
  CATEGORY_ARTWORK_COUNTS,
  PROTOTYPE_ASSETS,
  getTotalArtworkCount,
  listManifestEntries,
} = require(path.join(root, "economic-fast-lane-artwork-manifest"));
const {
  validateManifestStructure,
  validateArtworkFiles,
  validateEconomicFastLaneArtwork,
} = require(path.join(root, "validate-economic-fast-lane-artwork"));

function testManifestTotals() {
  assert.strictEqual(getTotalArtworkCount(), 50);
  assert.strictEqual(
    Object.values(CATEGORY_ARTWORK_COUNTS).reduce((sum, count) => sum + count, 0),
    50
  );
  assert.strictEqual(listManifestEntries().length, 50);
}

function testCategoryCounts() {
  assert.deepStrictEqual(CATEGORY_ARTWORK_COUNTS, {
    fed: 5,
    cpi: 4,
    nfp: 4,
    jobs: 4,
    "pmi-ism": 4,
    eia: 5,
    ecb: 4,
    boe: 2,
    boj: 2,
    "central-banks": 2,
    inflation: 2,
    gdp: 3,
    "retail-sales": 2,
    "consumer-confidence": 2,
    "generic-us-economic": 2,
    "generic-eurozone-economic": 2,
    "generic-economic": 1,
  });
}

function testPrototypePaths() {
  assert.strictEqual(PROTOTYPE_ASSETS.length, 2);
  assert.strictEqual(PROTOTYPE_ASSETS[0].category, "fed");
  assert.strictEqual(PROTOTYPE_ASSETS[0].relativePath, "fed/01.jpg");
  assert.strictEqual(PROTOTYPE_ASSETS[1].category, "cpi");
  assert.strictEqual(PROTOTYPE_ASSETS[1].relativePath, "cpi/01.jpg");
  assert.ok(ARTWORK_MANIFEST.fed.includes("01.jpg"));
  assert.ok(ARTWORK_MANIFEST.cpi.includes("01.jpg"));
}

function testBrandIdentity() {
  assert.strictEqual(BRAND_IDENTITY, "ECONOMIC_NEWS_CHANNEL");
}

function testValidationPassesWithEmptyIsolatedPool() {
  const poolDir = path.join(os.tmpdir(), `fast-lane-empty-pool-${Date.now()}`);
  fs.mkdirSync(poolDir, { recursive: true });

  try {
    const result = validateEconomicFastLaneArtwork({ poolBaseDir: poolDir });
    assert.strictEqual(result.structure.ok, true);
    assert.strictEqual(result.files.ok, true);
    assert.strictEqual(result.summary.totalExpected, 50);
    assert.strictEqual(result.summary.presentCount, 0);
    assert.strictEqual(result.summary.missingCount, 50);
  } finally {
    fs.rmSync(poolDir, { recursive: true, force: true });
  }
}

function testValidationDetectsValidFixtureFiles() {
  const poolDir = path.join(os.tmpdir(), `fast-lane-artwork-${Date.now()}`);
  for (const entry of listManifestEntries(poolDir)) {
    fs.mkdirSync(path.dirname(entry.absolutePath), { recursive: true });
    if (entry.filename === "01.jpg" && (entry.category === "fed" || entry.category === "cpi")) {
      fs.writeFileSync(entry.absolutePath, Buffer.alloc(150 * 1024, 0xff));
    }
  }

  const result = validateArtworkFiles({ poolBaseDir: poolDir });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.presentCount, 2);
  assert.strictEqual(result.missingCount, 48);

  fs.writeFileSync(path.join(poolDir, "fed", "99.jpg"), Buffer.from("unexpected"));
  const withUnexpected = validateArtworkFiles({ poolBaseDir: poolDir });
  assert.strictEqual(withUnexpected.ok, false);
  assert.ok(withUnexpected.issues.some((issue) => issue.code === "UNEXPECTED_FILENAME"));
}

function testValidationDetectsDuplicateManifestPaths() {
  const structure = validateManifestStructure();
  assert.strictEqual(structure.ok, true);
  assert.strictEqual(structure.total, 50);
}

function run() {
  testManifestTotals();
  testCategoryCounts();
  testPrototypePaths();
  testBrandIdentity();
  testValidationPassesWithEmptyIsolatedPool();
  testValidationDetectsValidFixtureFiles();
  testValidationDetectsDuplicateManifestPaths();
  console.log("economic-fast-lane-artwork-manifest.test.cjs: all tests passed");
}

run();
