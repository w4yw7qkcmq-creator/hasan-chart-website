#!/usr/bin/env node

const assert = require("assert");
const path = require("path");

const root = path.join(__dirname, "..");

const {
  resolveCentralBankRatePublicDisplay,
  resolveCentralBankSingleLinePublicTitle,
  resolvePublicCanonicalDisplayName,
} = require(path.join(root, "lib/economic-releases/central-bank-rate-display"));
const {
  buildSingleStructuredOutput,
  formatSingleEditorial,
} = require(path.join(root, "lib/news-intelligence/economic-editorial/arabic-formatter"));
const {
  composeSingleEditorial,
  buildStructuredInputFromPublication,
} = require(path.join(root, "lib/news-intelligence/economic-editorial/economic-editor"));
const {
  resolvePublicationImageResult,
  resetOpenAiImageCallCountForTests,
  getOpenAiImageCallCountForTests,
} = require(path.join(root, "lib/news-images/image-orchestrator"));
const { SOURCE_TYPES, PUBLICATION_TYPES } = require(path.join(root, "lib/news-intelligence/publication-types"));

const BOE_BAD_DISPLAY = "قرار فائدة بنك England";
const BOE_GOOD_HEADLINE = "قرار الفائدة البريطانية";
const BOE_SOURCE_READING = "تم تثبيت الفائدة، سلبي على الجنيه الاسترليني.";

function buildBoeStructuredEvent(overrides = {}) {
  return {
    eventType: "UK_BOE_RATE_DECISION",
    country: "UK",
    countryCode: "UK",
    canonicalDisplayName: BOE_BAD_DISPLAY,
    previous: "3.75%",
    forecast: "3.75%",
    actual: "3.75%",
    publishedReading: BOE_SOURCE_READING,
    telegramStructuredEconomic: true,
    ...overrides,
  };
}

function testBoePublicTitleAndFacts() {
  const structured = buildSingleStructuredOutput(buildBoeStructuredEvent());
  assert.strictEqual(structured.headline, BOE_GOOD_HEADLINE);
  assert.strictEqual(structured.countryLine, "المملكة المتحدة 🇬🇧");
  assert.strictEqual(structured.publicIssuerAr, "بنك إنجلترا");

  const body = formatSingleEditorial(structured);
  assert.ok(body.includes(`🚨 ${BOE_GOOD_HEADLINE} — المملكة المتحدة 🇬🇧`));
  assert.ok(!/England/i.test(body));
  assert.ok(body.includes("3.75%"));
  assert.ok(body.includes(BOE_SOURCE_READING));
}

async function testBoeEditorialPipeline() {
  const publication = {
    sourceType: SOURCE_TYPES.TELEGRAM_ECONOMIC,
    publicationType: PUBLICATION_TYPES.RELEASE,
    eventType: "UK_BOE_RATE_DECISION",
    country: "UK",
    facts: {
      canonicalDisplayName: BOE_BAD_DISPLAY,
      previous: "3.75%",
      forecast: "3.75%",
      actual: "3.75%",
      publishedReading: BOE_SOURCE_READING,
      sourceReading: { raw: BOE_SOURCE_READING, normalizedText: BOE_SOURCE_READING },
      sourceReadingRaw: BOE_SOURCE_READING,
      countryCode: "UK",
    },
  };
  const result = await composeSingleEditorial(buildStructuredInputFromPublication(publication), {
    publication,
    rawSourceText: "Bank of England rate decision",
  });
  assert.strictEqual(result.ok, true);
  assert.ok(result.body.includes(BOE_GOOD_HEADLINE));
  assert.ok(!/England/i.test(result.body));
}

async function testBoeFastLaneNotGeneralPrebuilt() {
  resetOpenAiImageCallCountForTests();
  const resolution = await resolvePublicationImageResult(
    {
      sourceType: SOURCE_TYPES.TELEGRAM_ECONOMIC,
      publicationType: PUBLICATION_TYPES.RELEASE,
      sourceId: "ForexBreakingNews",
      eventType: "UK_BOE_RATE_DECISION",
      eventKey: "UK_BOE_RATE_DECISION",
      country: "UK",
      importance: "HIGH",
      title: BOE_GOOD_HEADLINE,
      body: "Actual 3.75% Forecast 3.75% Previous 3.75%",
      metadata: { rawMessageId: "boe-rate-replay-1" },
    },
    { skipOpenAiCall: true }
  );
  assert.strictEqual(getOpenAiImageCallCountForTests(), 0);
  assert.strictEqual(resolution.fastLane, true);
  assert.notStrictEqual(resolution.generalPrebuilt, true);
}

function testCentralBankTitleMatrix() {
  const cases = [
    ["US_FED_RATE_DECISION", "قرار الفائدة الأمريكية", "🇺🇸"],
    ["UK_BOE_RATE_DECISION", "قرار الفائدة البريطانية", "🇬🇧"],
    ["EZ_ECB_RATE_DECISION", "قرار الفائدة الأوروبية", "🇪🇺"],
    ["JP_BOJ_RATE_DECISION", "قرار الفائدة اليابانية", "🇯🇵"],
    ["CA_BOC_RATE_DECISION", "قرار الفائدة الكندية", "🇨🇦"],
    ["AU_RBA_RATE_DECISION", "قرار الفائدة الأسترالية", "🇦🇺"],
    ["NZ_RBNZ_RATE_DECISION", "قرار الفائدة النيوزيلندية", "🇳🇿"],
    ["CH_SNB_RATE_DECISION", "قرار الفائدة السويسرية", "🇨🇭"],
  ];

  for (const [eventType, titleAr, flag] of cases) {
    const display = resolveCentralBankRatePublicDisplay(eventType);
    assert.ok(display, eventType);
    assert.strictEqual(display.publicEventTitleAr, titleAr);
    const single = resolveCentralBankSingleLinePublicTitle(eventType);
    assert.ok(single.includes(titleAr));
    assert.ok(single.includes(flag));

    const structured = buildSingleStructuredOutput({
      eventType,
      countryCode: eventType.split("_")[0],
      canonicalDisplayName: "BOE Rate Decision",
      previous: "1%",
      forecast: "1%",
      actual: "1%",
    });
    assert.strictEqual(structured.headline, titleAr);
    assert.ok(structured.countryLine.includes(flag));
    assert.ok(!/\b(England|BOE|ECB|BOJ|RBA|RBNZ|SNB|BOC)\b/i.test(structured.headline));
  }
}

function testEnglishLeakageGuard() {
  assert.strictEqual(
    resolvePublicCanonicalDisplayName("UK_BOE_RATE_DECISION", BOE_BAD_DISPLAY),
    BOE_GOOD_HEADLINE
  );
}

async function run() {
  testBoePublicTitleAndFacts();
  await testBoeEditorialPipeline();
  await testBoeFastLaneNotGeneralPrebuilt();
  testCentralBankTitleMatrix();
  testEnglishLeakageGuard();
  console.log("central-bank-rate-display.test.cjs: all tests passed");
}

run().catch((error) => {
  console.error("central-bank-rate-display.test.cjs FAILED", error);
  process.exit(1);
});
