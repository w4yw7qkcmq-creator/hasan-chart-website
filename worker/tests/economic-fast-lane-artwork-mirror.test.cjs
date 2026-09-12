#!/usr/bin/env node

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..", "..");
const webPoolDir = path.join(repoRoot, "public", "news", "economic-fast-lane");
const workerPoolDir = path.join(__dirname, "..", "public", "news", "economic-fast-lane");

const {
  ARTWORK_TECHNICAL_SPEC,
  listManifestEntries,
} = require(path.join(__dirname, "..", "lib", "news-images", "economic-fast-lane-artwork-manifest"));
const {
  validateEconomicFastLaneArtwork,
} = require(path.join(__dirname, "..", "lib", "news-images", "validate-economic-fast-lane-artwork"));

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

async function readJpegDimensions(filePath) {
  const sharp = require("sharp");
  const metadata = await sharp(filePath).metadata();
  return { width: metadata.width, height: metadata.height, format: metadata.format };
}

function listRelativeJpgPaths(baseDir) {
  if (!fs.existsSync(baseDir)) {
    return [];
  }
  const results = [];
  for (const category of fs.readdirSync(baseDir, { withFileTypes: true })) {
    if (!category.isDirectory()) {
      continue;
    }
    const categoryDir = path.join(baseDir, category.name);
    for (const file of fs.readdirSync(categoryDir, { withFileTypes: true })) {
      if (file.isFile() && file.name.toLowerCase().endsWith(".jpg")) {
        results.push(`${category.name}/${file.name}`);
      }
    }
  }
  return results.sort();
}

async function testMirrorIntegrity() {
  assert.ok(fs.existsSync(webPoolDir), `web pool missing: ${webPoolDir}`);
  assert.ok(fs.existsSync(workerPoolDir), `worker pool missing: ${workerPoolDir}`);

  const webPaths = listRelativeJpgPaths(webPoolDir);
  const workerPaths = listRelativeJpgPaths(workerPoolDir);
  assert.deepStrictEqual(
    workerPaths,
    webPaths,
    "worker mirror relative JPG paths must match web pool exactly"
  );
  assert.strictEqual(webPaths.length, 50, "expected 50 JPG files in web pool");

  const expectedWidth = ARTWORK_TECHNICAL_SPEC.recommendedDimensions.width;
  const expectedHeight = ARTWORK_TECHNICAL_SPEC.recommendedDimensions.height;

  for (const relativePath of webPaths) {
    const webFile = path.join(webPoolDir, relativePath);
    const workerFile = path.join(workerPoolDir, relativePath);

    assert.ok(fs.existsSync(webFile), `missing web file: ${relativePath}`);
    assert.ok(fs.existsSync(workerFile), `missing worker file: ${relativePath}`);

    const webStat = fs.statSync(webFile);
    const workerStat = fs.statSync(workerFile);
    assert.strictEqual(workerStat.size, webStat.size, `size mismatch: ${relativePath}`);

    const webHash = sha256File(webFile);
    const workerHash = sha256File(workerFile);
    assert.strictEqual(workerHash, webHash, `checksum mismatch: ${relativePath}`);

    const webDims = await readJpegDimensions(webFile);
    const workerDims = await readJpegDimensions(workerFile);
    assert.strictEqual(webDims.format, "jpeg", `web not jpeg: ${relativePath}`);
    assert.strictEqual(workerDims.format, "jpeg", `worker not jpeg: ${relativePath}`);
    assert.strictEqual(webDims.width, expectedWidth, `web width mismatch: ${relativePath}`);
    assert.strictEqual(webDims.height, expectedHeight, `web height mismatch: ${relativePath}`);
    assert.strictEqual(workerDims.width, expectedWidth, `worker width mismatch: ${relativePath}`);
    assert.strictEqual(workerDims.height, expectedHeight, `worker height mismatch: ${relativePath}`);
  }

  const webValidation = validateEconomicFastLaneArtwork({
    poolBaseDir: webPoolDir,
    requireAllPresent: true,
  });
  const workerValidation = validateEconomicFastLaneArtwork({
    poolBaseDir: workerPoolDir,
    requireAllPresent: true,
  });

  assert.strictEqual(webValidation.summary.presentCount, 50);
  assert.strictEqual(webValidation.summary.missingCount, 0);
  assert.ok(webValidation.ok, `web pool validation failed: ${JSON.stringify(webValidation.files.issues)}`);

  assert.strictEqual(workerValidation.summary.presentCount, 50);
  assert.strictEqual(workerValidation.summary.missingCount, 0);
  assert.ok(
    workerValidation.ok,
    `worker pool validation failed: ${JSON.stringify(workerValidation.files.issues)}`
  );

  const manifestPaths = listManifestEntries(webPoolDir).map((entry) => entry.relativePath).sort();
  assert.deepStrictEqual(webPaths, manifestPaths.sort(), "web pool must match manifest paths");
}

async function main() {
  await testMirrorIntegrity();
  console.log("economic-fast-lane-artwork-mirror.test.cjs: all tests passed (50/50 byte-identical mirrors)");
}

main().catch((error) => {
  console.error("economic-fast-lane-artwork-mirror.test.cjs: FAILED", error);
  process.exit(1);
});
