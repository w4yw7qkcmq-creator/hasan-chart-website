#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const fixturesDir = path.join(root, "fixtures/news-intelligence/golden");

const {
  extractFactsFromTelegramPost,
  resolveCanonicalForTelegram,
} = require(path.join(root, "lib/telegram-news/extractor"));
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
const {
  extractStrictEconomicNumericToken,
  normalizeSignedEconomicRawToken,
} = require(path.join(root, "lib/economic-releases/text-normalization"));

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
}

function testSuffixMinusPercentTokens() {
  const cases = [
    ["%0.6-", "-0.6%"],
    ["0.6-%", "-0.6%"],
    ["0.6-", "-0.6%"],
    ["-0.6%", "-0.6%"],
    ["−0.6%", "-0.6%"],
    ["+0.6%", "+0.6%"],
    ["%0.8", "0.8%"],
    ["-20.60", "-20.60"],
    ["-14.80", "-14.80"],
    ["-7.60", "-7.60"],
    ["-0.1%", "-0.1%"],
    ["-0.01%", "-0.01%"],
  ];
  for (const [raw, expected] of cases) {
    const normalized = normalizeSignedEconomicRawToken(raw);
    const token = extractStrictEconomicNumericToken(raw);
    assert.strictEqual(token, expected, `token ${raw}`);
    assert.strictEqual(extractStrictEconomicNumericToken(normalized), expected, `normalized ${raw}`);
  }
}

async function testRetailSalesProductionFixture() {
  const fixture = loadFixture("production-incident-retail-sales-20260916.json");
  const post = { ...fixture.post, rawText: fixture.sourceText };
  const facts = extractFactsFromTelegramPost(post);

  assert.strictEqual(facts.canonicalEventKey, fixture.expected.canonicalEventKey);
  assert.strictEqual(facts.countryCode, fixture.expected.countryCode);
  assert.strictEqual(facts.previous, fixture.expected.previous);
  assert.strictEqual(facts.forecast, fixture.expected.forecast);
  assert.strictEqual(facts.actual, fixture.expected.actual);
  assert.strictEqual(facts.isStructuredTriple, true);
  assert.strictEqual(facts.numericFieldValidation.ok, true);

  const formatted = await formatTelegramPost(post, facts, {
    classification: { classification: "economic_release" },
    disableAi: true,
  });
  assert.strictEqual(formatted.skipPublish, false, formatted.reason || "format blocked");
  assert.ok(formatted.formatted.includes("-0.6%"), "published body must keep minus on previous");
  assert.ok(!/ForexBreakingNews|telegram\.me\/ForexBreakingNews/i.test(formatted.formatted));

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
  assert.ok(editorial.body.includes("-0.6%"), "editorial previous sign");

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

function testNearbySignRegression() {
  const samples = [
    { text: "US CPI m/m\n▪️ السابق : %0.2-\n▪️ التقدير : %0.3\n▫️ الحالي : %0.4", p: "-0.2%", f: "0.3%", a: "0.4%", key: "US_CPI_MOM" },
    { text: "US Initial Jobless Claims\nPrevious: 220K\nEstimate: 225K\nCurrent: 218K", p: "220K", f: "225K", a: "218K", key: "US_INITIAL_JOBLESS_CLAIMS" },
    { text: "US Nonfarm Payrolls\nPrevious: 180K\nEstimate: 190K\nCurrent: 200K", p: "180K", f: "190K", a: "200K", key: "US_NFP" },
    { text: "US ISM Manufacturing PMI\nPrevious: 49\nEstimate: 50\nCurrent: 51", p: "49", f: "50", a: "51", key: "US_ISM_MANUFACTURING" },
    { text: "US EIA Crude Oil Inventories\nPrevious: -1M\nEstimate: 0.5M\nCurrent: 1M", p: "-1M", f: "0.5M", a: "1M", key: "US_EIA_CRUDE_OIL_INVENTORIES" },
    { text: "Empire State Manufacturing Index\nPrevious: 20.60\nEstimate: 14.80\nCurrent: 7.60", p: "20.60", f: "14.80", a: "7.60", key: "US_EMPIRE_STATE_MANUFACTURING" },
  ];

  const fomcResolved = resolveCanonicalForTelegram("FOMC Rate Decision\nPrevious: 5.25%\nEstimate: 5.00%\nCurrent: 5.00%", {
    countryCode: "US",
  });
  assert.strictEqual(fomcResolved.eventKey, "US_FED_RATE_DECISION");
  const ecbResolved = resolveCanonicalForTelegram("ECB Rate Decision\nPrevious: 4.00%\nEstimate: 4.00%\nCurrent: 4.00%", {
    countryCode: "EZ",
  });
  assert.strictEqual(ecbResolved.eventKey, "EZ_ECB_RATE_DECISION");

  for (const sample of samples) {
    const resolved = resolveCanonicalForTelegram(sample.text, { countryCode: sample.text.includes("ECB") ? "EZ" : "US" });
    if (sample.key) {
      assert.strictEqual(resolved.eventKey, sample.key, sample.text.slice(0, 40));
    }
    const facts = extractFactsFromTelegramPost({
      sourceChannel: "ForexBreakingNews",
      sourceMessageId: `sign-regression-${sample.key}`,
      rawText: sample.text,
    });
    assert.strictEqual(facts.previous, sample.p, `previous ${sample.key}`);
    assert.strictEqual(facts.forecast, sample.f, `forecast ${sample.key}`);
    assert.strictEqual(facts.actual, sample.a, `actual ${sample.key}`);
    assert.strictEqual(facts.numericFieldValidation.ok, true, sample.key);
  }
}

async function run() {
  testSuffixMinusPercentTokens();
  await testRetailSalesProductionFixture();
  testNearbySignRegression();
  console.log("production-incident-retail-sales-20260916.test.cjs: all tests passed");
}

run().catch((error) => {
  console.error("production-incident-retail-sales-20260916.test.cjs: FAILED", error);
  process.exit(1);
});
