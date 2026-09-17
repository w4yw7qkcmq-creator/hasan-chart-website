#!/usr/bin/env node

const assert = require("assert");
const path = require("path");

const root = path.join(__dirname, "..", "lib", "news-images");
const repoRoot = path.join(__dirname, "..", "..");
const poolDir = path.join(repoRoot, "public", "news", "general-prebuilt");

const { classifyGeneralNewsArtworkCategory, resolveIranUsRoutingVariant } = require(path.join(
  root,
  "general-news-artwork-router"
));
const {
  selectGeneralPrebuiltImage,
  resolveIranUsAssetCandidates,
  GENERAL_PREBUILT_STATUS,
} = require(path.join(root, "general-prebuilt-image-pool"));
const {
  isTelegramEconomicFastLaneEligible,
  selectEconomicFastLaneImage,
} = require(path.join(root, "economic-image-pool"));
const {
  resolvePublicationImageResult,
  resetOpenAiImageCallCountForTests,
  getOpenAiImageCallCountForTests,
} = require(path.join(root, "image-orchestrator"));
const { SOURCE_TYPES, PUBLICATION_TYPES } = require(path.join(root, "../news-intelligence/publication-types"));

function testRoutingMatrix() {
  assert.strictEqual(classifyGeneralNewsArtworkCategory("Oil prices jump as Brent climbs").category, "oil-up");
  assert.strictEqual(classifyGeneralNewsArtworkCategory("Oil prices fall as crude declines").category, "oil-down");
  assert.strictEqual(
    classifyGeneralNewsArtworkCategory("Oil markets remain volatile with mixed signals").category,
    "breaking-economic"
  );
  assert.notStrictEqual(
    classifyGeneralNewsArtworkCategory("Oil markets remain volatile with mixed signals").category,
    "oil-up"
  );

  assert.strictEqual(
    classifyGeneralNewsArtworkCategory("US and Iran exchange military threats in the region").category,
    "iran-us"
  );
  assert.strictEqual(
    resolveIranUsRoutingVariant("US and Iran exchange military threats in the region"),
    "military"
  );
  assert.ok(resolveIranUsAssetCandidates("US and Iran exchange military threats").includes("01.jpg"));

  assert.strictEqual(
    resolveIranUsRoutingVariant("US and Iran begin negotiations in Geneva"),
    "diplomatic"
  );
  assert.deepStrictEqual(resolveIranUsAssetCandidates("US and Iran begin negotiations"), ["04.jpg"]);

  assert.strictEqual(
    resolveIranUsRoutingVariant("US announces new sanctions on Iran"),
    "sanctions"
  );
  assert.deepStrictEqual(resolveIranUsAssetCandidates("US announces new sanctions on Iran"), ["05.jpg"]);

  assert.notStrictEqual(
    classifyGeneralNewsArtworkCategory("Iran releases domestic inflation report").category,
    "iran-us"
  );

  assert.strictEqual(
    classifyGeneralNewsArtworkCategory("Strait of Hormuz shipping disruption hits oil routes").category,
    "hormuz-shipping"
  );
  assert.strictEqual(classifyGeneralNewsArtworkCategory("Gold rises amid safe-haven demand").category, "gold");
  assert.strictEqual(classifyGeneralNewsArtworkCategory("Dollar strengthens against major peers").category, "usd");
  assert.strictEqual(
    classifyGeneralNewsArtworkCategory("Federal Reserve official comments on outlook").category,
    "fed-general"
  );
  assert.strictEqual(classifyGeneralNewsArtworkCategory("Bitcoin climbs as crypto flows rise").category, "crypto");
  assert.strictEqual(
    classifyGeneralNewsArtworkCategory("China announces new economic stimulus package").category,
    "china-markets"
  );
  assert.strictEqual(
    classifyGeneralNewsArtworkCategory("Global equities selloff accelerates in risk-off session").category,
    "global-markets-down"
  );
  assert.strictEqual(
    classifyGeneralNewsArtworkCategory("Stock markets rally on positive sentiment").category,
    "global-markets-up"
  );
  assert.strictEqual(
    classifyGeneralNewsArtworkCategory("Investors watch markets ahead of data").category,
    "breaking-economic"
  );
}

function testStructuredNumericDeferred() {
  const cpiText = "US CPI actual 3.2% vs forecast 3.1% previous 3.0%";
  assert.strictEqual(classifyGeneralNewsArtworkCategory(cpiText).category, null);
}

async function testReplayGeneralUsesPrebuiltWithoutOpenAi() {
  resetOpenAiImageCallCountForTests();
  const publication = {
    sourceType: SOURCE_TYPES.TELEGRAM_GENERAL,
    publicationType: PUBLICATION_TYPES.GENERAL_NEWS,
    importance: "HIGH",
    title: "Oil prices jump as Brent climbs on supply concerns",
    body: "Crude oil extended gains in early trading.",
    metadata: { rawMessageId: "replay-general-oil-up-1" },
  };
  const startedAt = Date.now();
  const result = await resolvePublicationImageResult(publication, { skipOpenAiCall: true });
  const elapsed = Date.now() - startedAt;
  assert.strictEqual(getOpenAiImageCallCountForTests(), 0);
  assert.strictEqual(result.generalPrebuilt, true);
  assert.strictEqual(result.imageResult?.source, "general_prebuilt_pool");
  assert.strictEqual(result.telemetry?.generalPrebuiltStatus, GENERAL_PREBUILT_STATUS.GENERAL_PREBUILT_SELECTED);
  assert.ok(result.imageResult?.filePath?.includes("oil-up"));
  assert.ok(elapsed < 500, `selection should be local/fast, got ${elapsed}ms`);
}

async function testReplayStructuredUsesFastLaneNotGeneral() {
  resetOpenAiImageCallCountForTests();
  const publication = {
    sourceType: SOURCE_TYPES.TELEGRAM_ECONOMIC,
    publicationType: PUBLICATION_TYPES.RELEASE,
    sourceId: "ForexBreakingNews",
    eventType: "US_CPI_MOM",
    eventKey: "US_CPI_MOM",
    country: "US",
    importance: "HIGH",
    title: "US CPI MoM",
    body: "Actual 0.3% Forecast 0.2% Previous 0.1%",
    metadata: { rawMessageId: "replay-cpi-1" },
  };
  assert.strictEqual(isTelegramEconomicFastLaneEligible(publication), true);
  const fastLane = selectEconomicFastLaneImage({
    canonicalEventId: publication.eventKey,
    countryCode: publication.country,
    sourceMessageId: publication.metadata.rawMessageId,
  });
  assert.ok(fastLane.filePath?.includes("economic-fast-lane"));
  const result = await resolvePublicationImageResult(publication, { skipOpenAiCall: true });
  assert.strictEqual(result.fastLane, true);
  assert.notStrictEqual(result.generalPrebuilt, true);
  assert.strictEqual(getOpenAiImageCallCountForTests(), 0);
}

async function run() {
  testRoutingMatrix();
  testStructuredNumericDeferred();
  await testReplayGeneralUsesPrebuiltWithoutOpenAi();
  await testReplayStructuredUsesFastLaneNotGeneral();
  console.log("general-prebuilt-live-integration.test.cjs: all tests passed");
}

run().catch((error) => {
  console.error("general-prebuilt-live-integration.test.cjs: FAILED", error);
  process.exit(1);
});
