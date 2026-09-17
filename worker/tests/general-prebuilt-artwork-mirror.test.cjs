#!/usr/bin/env node

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..", "..");
const webPoolDir = path.join(repoRoot, "public", "news", "general-prebuilt");
const workerPoolDir = path.join(__dirname, "..", "public", "news", "general-prebuilt");

const {
  ARTWORK_TECHNICAL_SPEC,
  listManifestEntries,
} = require(path.join(__dirname, "..", "lib", "news-images", "general-prebuilt-artwork-manifest"));
const {
  validateGeneralPrebuiltArtwork,
} = require(path.join(__dirname, "..", "lib", "news-images", "validate-general-prebuilt-artwork"));

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
  assert.deepStrictEqual(workerPaths, webPaths, "worker mirror relative JPG paths must match web pool exactly");
  assert.strictEqual(webPaths.length, 50, "expected 50 JPG files in web pool");

  const expectedWidth = ARTWORK_TECHNICAL_SPEC.recommendedDimensions.width;
  const expectedHeight = ARTWORK_TECHNICAL_SPEC.recommendedDimensions.height;

  for (const relativePath of webPaths) {
    const webFile = path.join(webPoolDir, relativePath);
    const workerFile = path.join(workerPoolDir, relativePath);

    const webStat = fs.statSync(webFile);
    const workerStat = fs.statSync(workerFile);
    assert.strictEqual(workerStat.size, webStat.size, `size mismatch: ${relativePath}`);

    const webHash = sha256File(webFile);
    const workerHash = sha256File(workerFile);
    assert.strictEqual(workerHash, webHash, `checksum mismatch: ${relativePath}`);

    const dims = await readJpegDimensions(webFile);
    assert.strictEqual(dims.format, "jpeg", `not jpeg: ${relativePath}`);
    assert.strictEqual(dims.width, expectedWidth, `width mismatch: ${relativePath}`);
    assert.strictEqual(dims.height, expectedHeight, `height mismatch: ${relativePath}`);
  }
}

async function testValidationCompletePool() {
  const validation = validateGeneralPrebuiltArtwork({
    poolBaseDir: webPoolDir,
    requireAllPresent: true,
  });
  assert.strictEqual(validation.ok, true, JSON.stringify(validation, null, 2));
  assert.strictEqual(validation.summary.presentCount, 50);
  assert.strictEqual(validation.summary.missingCount, 0);
}

async function run() {
  await testMirrorIntegrity();
  await testValidationCompletePool();
  console.log("general-prebuilt-artwork-mirror.test.cjs: all tests passed (50/50 byte-identical mirrors)");
}

run().catch((error) => {
  console.error("general-prebuilt-artwork-mirror.test.cjs: FAILED", error);
  process.exit(1);
});
