#!/usr/bin/env node

const assert = require("assert");
const path = require("path");

const root = path.join(__dirname, "..", "lib", "news-images");
const {
  ROUTING_TAXONOMY,
  classifyGeneralNewsArtworkCategory,
  classifyOilDirection,
  classifyEquityDirection,
} = require(path.join(root, "general-news-artwork-router"));

function testTaxonomyMatchesManifestCategories() {
  assert.strictEqual(ROUTING_TAXONOMY.length, 14);
  assert.ok(ROUTING_TAXONOMY.includes("iran-us"));
  assert.ok(ROUTING_TAXONOMY.includes("breaking-economic"));
}

function testIranUsRouting() {
  const result = classifyGeneralNewsArtworkCategory(
    "United States and Iran discuss sanctions relief amid rising diplomatic tensions"
  );
  assert.strictEqual(result.category, "iran-us");
  assert.strictEqual(result.directional, false);
}

function testIranOnlyNotAutoIranUs() {
  const result = classifyGeneralNewsArtworkCategory("Iran releases domestic inflation report for January");
  assert.notStrictEqual(result.category, "iran-us");
}

function testOilDirectionExplicit() {
  assert.strictEqual(classifyOilDirection("Brent crude rises on supply concerns"), "oil-up");
  assert.strictEqual(classifyOilDirection("WTI crude falls as demand weakens"), "oil-down");
  assert.strictEqual(classifyOilDirection("Oil markets watch Middle East"), null);
}

function testOilAmbiguousUsesFallback() {
  const result = classifyGeneralNewsArtworkCategory("Oil markets remain in focus today");
  assert.strictEqual(result.category, "breaking-economic");
  assert.strictEqual(result.reason, "oil_direction_ambiguous");
}

function testEquityDirectionExplicit() {
  assert.strictEqual(classifyEquityDirection("Global equities rally on risk-on mood"), "global-markets-up");
  assert.strictEqual(classifyEquityDirection("Stock markets under selling pressure in risk-off session"), "global-markets-down");
}

function testEquityAmbiguousNoGuess() {
  const result = classifyGeneralNewsArtworkCategory("Investors watch global stock markets ahead of data");
  assert.notStrictEqual(result.category, "global-markets-up");
  assert.notStrictEqual(result.category, "global-markets-down");
}

function testHormuzPriority() {
  const result = classifyGeneralNewsArtworkCategory("Commercial tankers transit the Strait of Hormuz under heightened scrutiny");
  assert.strictEqual(result.category, "hormuz-shipping");
}

function testStructuredNumericDeferred() {
  const result = classifyGeneralNewsArtworkCategory("US CPI actual 3.2% vs forecast 3.1% previous 3.0%");
  assert.strictEqual(result.category, null);
  assert.strictEqual(result.reason, "structured_numeric_release_deferred_to_fast_lane");
}

function testGoldCryptoFed() {
  assert.strictEqual(classifyGeneralNewsArtworkCategory("Gold climbs as safe-haven demand builds").category, "gold");
  assert.strictEqual(
    classifyGeneralNewsArtworkCategory("Bitcoin institutional flows draw attention").category,
    "crypto"
  );
  assert.strictEqual(
    classifyGeneralNewsArtworkCategory("Federal Reserve officials comment on monetary policy outlook").category,
    "fed-general"
  );
}

function testNeutralGeopoliticsTaxonomy() {
  const result = classifyGeneralNewsArtworkCategory("NATO summit focuses on diplomatic sanctions framework");
  assert.strictEqual(result.category, "geopolitics");
  assert.doesNotMatch(result.category || "", /war/i);
}

function run() {
  testTaxonomyMatchesManifestCategories();
  testIranUsRouting();
  testIranOnlyNotAutoIranUs();
  testOilDirectionExplicit();
  testOilAmbiguousUsesFallback();
  testEquityDirectionExplicit();
  testEquityAmbiguousNoGuess();
  testHormuzPriority();
  testStructuredNumericDeferred();
  testGoldCryptoFed();
  testNeutralGeopoliticsTaxonomy();
  console.log("general-news-artwork-router.test.cjs: all tests passed");
}

run();
