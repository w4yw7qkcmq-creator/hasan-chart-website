#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const fixturesDir = path.join(root, "fixtures/news-intelligence/golden");

const { extractFactsFromTelegramPost, resolveCanonicalForTelegram } = require(path.join(
  root,
  "lib/telegram-news/extractor"
));
const { formatTelegramPost } = require(path.join(root, "lib/telegram-news/format"));
const { composeSingleEditorial } = require(path.join(
  root,
  "lib/news-intelligence/economic-editorial/economic-editor"
));
const {
  resolvePublicationImageResult,
  resetOpenAiImageCallCountForTests,
  getOpenAiImageCallCountForTests,
} = require(path.join(root, "lib/news-images/image-orchestrator"));
const { resolveImageCategory, SELECTION_STATUS } = require(path.join(root, "lib/news-images/economic-image-pool"));
const { PUBLICATION_TYPES, SOURCE_TYPES } = require(path.join(root, "lib/news-intelligence/publication-types"));
const { normalizeArabicForPromoMatching } = require(path.join(root, "lib/telegram-news/promo-filter"));

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
}

async function testEmpireStateIncidentFixture() {
  const fixture = loadFixture("production-incident-empire-state-manufacturing-20260915.json");
  const post = { ...fixture.post, rawText: fixture.sourceText };
  const facts = extractFactsFromTelegramPost(post);

  assert.strictEqual(facts.canonicalEventKey, fixture.expected.canonicalEventKey);
  assert.strictEqual(facts.countryCode, fixture.expected.countryCode);
  assert.strictEqual(facts.previous, fixture.expected.previous);
  assert.strictEqual(facts.forecast, fixture.expected.forecast);
  assert.strictEqual(facts.actual, fixture.expected.actual);
  assert.strictEqual(facts.isStructuredTriple, true);
  assert.strictEqual(facts.numericFieldValidation.ok, true);
  assert.ok(facts.sourceReading?.raw, "source reading extracted");
  assert.match(facts.sourceReading.raw, /دولار|ذهب/i);

  assert.ok(!/ForexBreakingNews|telegram\.me\/ForexBreakingNews/i.test(facts.sanitizedText));
  assert.ok(!/ForexBreakingNews|telegram\.me\/ForexBreakingNews/i.test(normalizeArabicForPromoMatching(facts.sanitizedText)));

  const formatted = await formatTelegramPost(post, facts, {
    classification: { classification: "economic_release" },
    disableAi: true,
  });
  assert.strictEqual(formatted.skipPublish, false, formatted.reason || "format blocked");
  assert.ok(formatted.formatted && formatted.formatted.length > 40);

  const structuredEvent = {
    eventType: facts.canonicalEventKey,
    country: facts.countryCode,
    actual: facts.actual,
    forecast: facts.forecast,
    previous: facts.previous,
    canonicalDisplayName: facts.canonicalDisplayName,
    sourceReading: facts.sourceReading,
    publishedReading: facts.publishedReading,
    telegramStructuredEconomic: true,
    canonicalFacts: { actual: facts.actual, forecast: facts.forecast, previous: facts.previous },
  };
  const editorial = await composeSingleEditorial(structuredEvent, {
    rawSourceText: fixture.sourceText,
    publication: {
      sourceType: SOURCE_TYPES.TELEGRAM_ECONOMIC,
      sourceId: "ForexBreakingNews",
      publicationType: PUBLICATION_TYPES.RELEASE,
      eventType: facts.canonicalEventKey,
    },
  });
  assert.strictEqual(editorial.ok, true, editorial.detail || editorial.reason);

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
  assert.strictEqual(image.imageResult.delivery, "photo");
  assert.strictEqual(getOpenAiImageCallCountForTests(), 0);
  assert.strictEqual(resolveImageCategory(facts.canonicalEventKey, facts.countryCode), fixture.expected.imageCategory);
}

function testNearbyEventsNotMisclassifiedAsEmpire() {
  const samples = [
    { text: "US ISM Manufacturing PMI\nالسابق: 49\nالمتوقع: 50\nالحالي: 51", expect: "US_ISM_MANUFACTURING" },
    { text: "US ISM Non-Manufacturing PMI\nالسابق: 49\nالمتوقع: 50\nالحالي: 51", expect: "US_ISM_NON_MANUFACTURING_PMI" },
    { text: "S&P Global Flash Manufacturing PMI\nالسابق: 49\nالمتوقع: 50\nالحالي: 51", expect: "US_SP_GLOBAL_FLASH_MANUFACTURING_PMI" },
    { text: "Philadelphia Fed Manufacturing Index\nالسابق: 1\nالمتوقع: 2\nالحالي: 3", expect: "US_PHILADELPHIA_FED_MANUFACTURING" },
    { text: "Chicago PMI\nالسابق: 1\nالمتوقع: 2\nالحالي: 3", expect: null },
    { text: "US Nonfarm Payrolls NFP\nالسابق: 180K\nالمتوقع: 190K\nالحالي: 200K", expect: "US_NFP" },
    { text: "US Initial Jobless Claims\nالسابق: 200K\nالمتوقع: 205K\nالحالي: 203K", expect: "US_INITIAL_JOBLESS_CLAIMS" },
    { text: "US CPI m/m\nالسابق: 0.2%\nالمتوقع: 0.3%\nالحالي: 0.4%", expect: "US_CPI_MOM" },
    { text: "US EIA Crude Oil Inventories\nالسابق: -1M\nالمتوقع: 0.5M\nالحالي: 1M", expect: "US_EIA_CRUDE_OIL_INVENTORIES" },
    { text: "FOMC Rate Decision\nالسابق: 5.25%\nالمتوقع: 5.00%\nالحالي: 5.00%", expect: "US_FED_RATE_DECISION" },
  ];

  for (const sample of samples) {
    const resolved = resolveCanonicalForTelegram(sample.text, { countryCode: "US" });
    if (sample.expect === null) {
      assert.notStrictEqual(resolved.eventKey, "US_EMPIRE_STATE_MANUFACTURING", sample.text);
      continue;
    }
    assert.strictEqual(resolved.eventKey, sample.expect, sample.text);
    assert.notStrictEqual(resolved.eventKey, "US_EMPIRE_STATE_MANUFACTURING", `Empire collision: ${sample.text}`);
  }

  const empire = resolveCanonicalForTelegram("مؤشر إمباير ستيت للصناعة", { countryCode: "US" });
  assert.strictEqual(empire.eventKey, "US_EMPIRE_STATE_MANUFACTURING");
}

async function run() {
  await testEmpireStateIncidentFixture();
  testNearbyEventsNotMisclassifiedAsEmpire();
  console.log("production-incident-empire-state-20260915.test.cjs: all tests passed");
}

run().catch((error) => {
  console.error("production-incident-empire-state-20260915.test.cjs: FAILED", error);
  process.exit(1);
});
