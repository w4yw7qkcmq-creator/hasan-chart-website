#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const fixturesDir = path.join(root, "fixtures/news-intelligence/golden");

const { extractFactsFromTelegramPost } = require(path.join(root, "lib/telegram-news/extractor"));
const { resolvePublicationEventType, buildTelegramPublicationRequest } = require(path.join(
  root,
  "lib/news-intelligence/adapters"
));
const { composeSingleEditorial } = require(path.join(
  root,
  "lib/news-intelligence/economic-editorial/economic-editor"
));
const { buildStructuredEventFromFacts } = require(path.join(
  root,
  "lib/news-intelligence/economic-editorial/pipeline"
));
const {
  resolvePublicationImageResult,
  resetOpenAiImageCallCountForTests,
  getOpenAiImageCallCountForTests,
} = require(path.join(root, "lib/news-images/image-orchestrator"));
const { resolveImageCategory, SELECTION_STATUS } = require(path.join(root, "lib/news-images/economic-image-pool"));
const { PUBLICATION_TYPES, SOURCE_TYPES } = require(path.join(root, "lib/news-intelligence/publication-types"));
const { STRUCTURED_ECONOMIC_FALLBACK } = require(path.join(
  root,
  "lib/news-intelligence/structured-economic-fallback"
));
const { prepareTelegramPost } = require(path.join(root, "lib/telegram-news/pipeline"));

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
}

function buildCandidate(fixture) {
  const post = { ...fixture.post, rawText: fixture.sourceText };
  const facts = extractFactsFromTelegramPost(post);
  return {
    post,
    facts,
    candidate: {
      post,
      facts,
      newsType: "economic",
      formattedMessage: `🚨 ${facts.canonicalDisplayName || facts.title}\n${"x".repeat(80)}`,
    },
  };
}

async function replayIncidentFixture(fileName) {
  const fixture = loadFixture(fileName);
  const { post, facts, candidate } = buildCandidate(fixture);
  assert.strictEqual(facts.canonicalEventKey, fixture.expected.canonicalEventKey);
  assert.strictEqual(facts.countryCode, fixture.expected.countryCode);
  assert.strictEqual(facts.previous, fixture.expected.previous);
  assert.strictEqual(facts.forecast, fixture.expected.forecast);
  assert.strictEqual(facts.actual, fixture.expected.actual);
  assert.strictEqual(facts.numericFieldValidation.ok, true);

  const pubEventType = resolvePublicationEventType(candidate);
  assert.strictEqual(pubEventType, fixture.expected.canonicalEventKey);

  const structured = buildStructuredEventFromFacts(facts, { telegramStructuredEconomic: true });
  const editorial = await composeSingleEditorial(structured, {
    rawSourceText: fixture.sourceText,
    disableAi: true,
    publication: {
      sourceType: SOURCE_TYPES.TELEGRAM_ECONOMIC,
      sourceId: "ForexBreakingNews",
      publicationType: PUBLICATION_TYPES.RELEASE,
      eventType: pubEventType,
    },
  });
  assert.strictEqual(editorial.ok, true, editorial.reason || editorial.detail);
  assert.ok(editorial.body.includes(fixture.expected.previous.replace(/-/g, "-")));
  assert.ok(!/ForexBreakingNews|telegram\.me\/ForexBreakingNews/i.test(editorial.body));

  resetOpenAiImageCallCountForTests();
  const image = await resolvePublicationImageResult({
    eventType: facts.canonicalEventKey,
    eventKey: facts.canonicalEventKey,
    country: facts.countryCode,
    publicationType: PUBLICATION_TYPES.RELEASE,
    sourceType: SOURCE_TYPES.TELEGRAM_ECONOMIC,
    sourceId: "ForexBreakingNews",
    metadata: { rawMessageId: post.sourceMessageId },
  });
  assert.strictEqual(image.telemetry.imageSelectionStatus, SELECTION_STATUS.PREBUILT_SELECTED);
  assert.strictEqual(getOpenAiImageCallCountForTests(), 0);
  assert.strictEqual(resolveImageCategory(facts.canonicalEventKey, facts.countryCode), fixture.expected.imageCategory);
}

function testStructuredFallbackForUnmappedTriple() {
  const raw =
    "🇺🇸 United States\nUS Widget Index\nمؤشر الأدوات\n\nPrevious: 1.0\nEstimate: 2.0\nCurrent: 3.0\n\nالنتيجة: محايد";
  const post = { sourceChannel: "ForexBreakingNews", sourceMessageId: "fallback-test", rawText: raw };
  const facts = extractFactsFromTelegramPost(post);
  assert.strictEqual(facts.canonicalEventKey, null);
  assert.strictEqual(facts.eventType, STRUCTURED_ECONOMIC_FALLBACK);
  const pubType = resolvePublicationEventType({ facts, post, newsType: "economic" });
  assert.strictEqual(pubType, STRUCTURED_ECONOMIC_FALLBACK);
}

function testAdversarialNonEconomicTriplesRejected() {
  const samples = [
    "BTC entry 65000 stop 64000 target 67000",
    "Win rate 80% profit 200% subscribers 5000",
    "Random paragraph with 1.2% and 3.4% and 5.6% but no labels",
    "السابق: promo اشترك VIP المتوقع: 100$ الحالي: 75$",
  ];
  for (const raw of samples) {
    const prep = prepareTelegramPost({
      sourceChannel: "ForexBreakingNews",
      sourceMessageId: `adv-${raw.length}`,
      rawText: raw,
    });
    assert.strictEqual(prep.skip, true, raw.slice(0, 40));
  }
}

async function run() {
  await replayIncidentFixture("production-incident-business-inventories-20260916.json");
  await replayIncidentFixture("production-incident-crude-inventories-20260916.json");
  testStructuredFallbackForUnmappedTriple();
  testAdversarialNonEconomicTriplesRejected();
  console.log("production-incident-inventories-coverage-20260916.test.cjs: all tests passed");
}

run().catch((error) => {
  console.error("production-incident-inventories-coverage-20260916.test.cjs: FAILED", error);
  process.exit(1);
});
