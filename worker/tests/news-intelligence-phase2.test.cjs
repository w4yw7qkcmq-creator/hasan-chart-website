#!/usr/bin/env node

const assert = require("assert");
const path = require("path");

const root = path.join(__dirname, "..", "lib", "news-intelligence", "economic-editorial");
const intelRoot = path.join(__dirname, "..", "lib", "news-intelligence");

const {
  interpretSingleEvent,
  interpretEventFamily,
  composeSingleEditorial,
  composeFamilyEditorial,
  validateQualityGateV2,
  validateNumericTokenIntegrity,
  createFamilyAggregationCoordinator,
  runEconomicEditorialPipeline,
  resetPhase2IntegrationForTests,
  decideImageRequirement,
  VISUAL_PRIORITY,
  BLOCK_REASONS,
} = require(root);

const {
  createNewsPublisherGateway,
  createPublicationStore,
  PUBLICATION_TYPES,
  SOURCE_TYPES,
  DESTINATIONS,
} = require(intelRoot);

const RELEASE_TIME = "2026-08-06T12:30:00.000Z";

const INITIAL = {
  eventType: "US_INITIAL_JOBLESS_CLAIMS",
  eventFamily: "US_WEEKLY_LABOR_CLAIMS",
  country: "US",
  actual: "199K",
  forecast: "203K",
  previous: "197K",
  releaseTime: RELEASE_TIME,
  canonicalFacts: { actual: "199K", forecast: "203K", previous: "197K" },
};

const CONTINUING = {
  eventType: "US_CONTINUING_JOBLESS_CLAIMS",
  eventFamily: "US_WEEKLY_LABOR_CLAIMS",
  country: "US",
  actual: "1.801M",
  forecast: "1.790M",
  previous: "1.782M",
  releaseTime: RELEASE_TIME,
  canonicalFacts: { actual: "1.801M", forecast: "1.790M", previous: "1.782M" },
};

async function testDirectionRules() {
  const initial = interpretSingleEvent(INITIAL);
  assert.strictEqual(initial.comparison.relation, "BELOW");
  assert.strictEqual(initial.usdBias, "POSITIVE");

  const continuing = interpretSingleEvent(CONTINUING);
  assert.strictEqual(continuing.comparison.relation, "ABOVE");
  assert.strictEqual(continuing.usdBias, "NEGATIVE");
}

async function testMixedFamilyInterpretation() {
  const family = interpretEventFamily([INITIAL, CONTINUING]);
  assert.strictEqual(family.familyUsdBias, "MIXED");
  assert.match(family.familyInterpretation, /مختلطة/);
  assert.doesNotMatch(family.familyImpact, /إيجابي للدولار$/);
}

async function testNumericHallucinationBlocked() {
  const badBody = "🚨 test\nالحالي: 999K\nالمتوقع: 203K\nالسابق: 197K";
  const check = validateNumericTokenIntegrity(badBody, INITIAL.canonicalFacts);
  assert.strictEqual(check.ok, false);
  assert.strictEqual(check.reason, "HALLUCINATED_NUMERIC_TOKEN");
}

async function testQualityGateBlocksUrl() {
  const result = validateQualityGateV2({
    structured: { headline: "test", factsBlock: "x", visualPriority: "OPTIONAL" },
    body: "https://t.me/bad link with enough length to pass minimum size requirement here",
    structuredEvent: INITIAL,
    deterministic: interpretSingleEvent(INITIAL),
  });
  assert.strictEqual(result.ok, false);
}

async function testFamilyMergeAndTimeout() {
  const coordinator = createFamilyAggregationCoordinator({ windowMs: 50 });
  const options = { disableAi: true, testMode: true, allowPlaceholderImage: true };

  const firstPromise = coordinator.submitStructuredEvent(INITIAL, options);
  await new Promise((r) => setTimeout(r, 10));
  const secondPromise = coordinator.submitStructuredEvent(CONTINUING, options);

  const [first, second] = await Promise.all([firstPromise, secondPromise]);
  assert.strictEqual(first.ok, true);
  assert.strictEqual(second.ok, true);
  assert.strictEqual(first.body, second.body);
  assert.match(first.body, /طلبات الإعانة الأولية/);
  assert.match(first.body, /طلبات الإعانة المستمرة/);
  assert.match(first.body, /199K/);
  assert.match(first.body, /1\.801M|1801K/i);
  assert.match(first.body, /مختلطة/);
  assert.strictEqual(first.familyPublicationKey, `US:US_WEEKLY_LABOR_CLAIMS:2026-08-06T12:30`);
}

async function testFamilyTimeoutSingleChild() {
  const coordinator = createFamilyAggregationCoordinator({ windowMs: 30 });
  const result = await coordinator.submitStructuredEvent(INITIAL, {
    windowMs: 30,
    disableAi: true,
    testMode: true,
    allowPlaceholderImage: true,
  });
  assert.strictEqual(result.ok, true);
  assert.match(result.body, /طلبات إعانة البطالة/);
}

async function testJoblessClaimsReplayPublication() {
  resetPhase2IntegrationForTests();
  const coordinator = createFamilyAggregationCoordinator({ windowMs: 80 });
  const options = { disableAi: true, testMode: true, allowPlaceholderImage: true };

  const familyPromise = coordinator.submitStructuredEvent(INITIAL, options);
  await coordinator.submitStructuredEvent(CONTINUING, options);
  const familyResult = await familyPromise;

  assert.strictEqual(familyResult.ok, true);
  assert.doesNotMatch(familyResult.body, /ForexBreakingNews/i);
  assert.match(familyResult.body, /https:\/\/t\.me\/EconomicNewsi/);
  assert.doesNotMatch(
    familyResult.body.replace(/https?:\/\/t\.me\/EconomicNewsi\/?/gi, ""),
    /https?:\/\//i
  );
  assert.strictEqual(familyResult.aiMeta.aiUsed, false);
  assert.strictEqual(decideImageRequirement({ eventFamily: "US_WEEKLY_LABOR_CLAIMS" }).level, VISUAL_PRIORITY.REQUIRED);
  assert.strictEqual(familyResult.imageMeta?.source, "deferred_to_gateway");
  assert.match(familyResult.body, /مختلطة/);

  console.log("JOBLESS_CLAIMS_REPLAY_OUTPUT_START");
  console.log(familyResult.body);
  console.log("JOBLESS_CLAIMS_REPLAY_OUTPUT_END");
}

async function testPhase1IdempotencyRegression() {
  const store = createPublicationStore({ runtimeMode: "test", forceMemory: true });
  const gateway = createNewsPublisherGateway({ store, runtimeMode: "test" });
  const familyResult = await composeFamilyEditorial("US_WEEKLY_LABOR_CLAIMS", [INITIAL, CONTINUING], {
    disableAi: true,
    testMode: true,
    allowPlaceholderImage: true,
  });
  assert.strictEqual(familyResult.ok, true);

  const publication = {
    eventType: "US_WEEKLY_LABOR_CLAIMS",
    eventFamily: "US_WEEKLY_LABOR_CLAIMS",
    country: "US",
    releaseDate: RELEASE_TIME,
    publicationType: PUBLICATION_TYPES.RELEASE,
    sourceType: SOURCE_TYPES.TELEGRAM_ECONOMIC,
    sourceId: "ForexBreakingNews",
    title: familyResult.structured.headline,
    body: familyResult.body,
    bodySource: "phase2_editorial",
    destination: DESTINATIONS.BOTH,
    sourceLink: "telegram:ForexBreakingNews/phase2-1",
    familyPublicationKey: familyResult.familyPublicationKey,
    facts: INITIAL.canonicalFacts,
  };

  const first = await gateway.publish(publication, { dryRun: true });
  assert.strictEqual(first.published || first.dryRun, true);

  const second = await gateway.publish(
    { ...publication, sourceLink: "telegram:ForexBreakingNews/phase2-2" },
    { dryRun: true }
  );
  assert.strictEqual(second.blocked, true);
  assert.strictEqual(second.reason, "DUPLICATE_BLOCKED");
}

async function testTelegramSiteConsistency() {
  const result = await composeFamilyEditorial("US_WEEKLY_LABOR_CLAIMS", [INITIAL, CONTINUING], {
    disableAi: true,
    testMode: true,
    allowPlaceholderImage: true,
  });
  const { formatSiteFields, formatTelegramBody } = require(path.join(root, "formatters"));
  const telegramBody = formatTelegramBody(result.body);
  const site = formatSiteFields(result);
  assert.strictEqual(telegramBody, result.body);
  assert.strictEqual(site.content, result.body);
  assert.strictEqual(site.headline, result.structured.headline);
}

async function testContextualCpiNoNaiveBias() {
  const cpi = {
    eventType: "US_CPI_MOM",
    country: "US",
    actual: "0.4%",
    forecast: "0.3%",
    previous: "0.2%",
    releaseTime: RELEASE_TIME,
    canonicalFacts: { actual: "0.4%", forecast: "0.3%", previous: "0.2%" },
  };
  const interpreted = interpretSingleEvent(cpi);
  assert.strictEqual(interpreted.usdBias, "CONTEXTUAL");
  const editorial = await composeSingleEditorial(cpi, {
    disableAi: true,
    testMode: true,
    allowPlaceholderImage: true,
  });
  assert.strictEqual(editorial.ok, true);
  assert.doesNotMatch(editorial.body, /ارتفع الدولار/);
}

async function main() {
  await testDirectionRules();
  await testMixedFamilyInterpretation();
  await testNumericHallucinationBlocked();
  await testQualityGateBlocksUrl();
  await testFamilyTimeoutSingleChild();
  await testFamilyMergeAndTimeout();
  await testTelegramSiteConsistency();
  await testContextualCpiNoNaiveBias();
  await testPhase1IdempotencyRegression();
  await testJoblessClaimsReplayPublication();
  console.log("news-intelligence-phase2.test.cjs: all tests passed");
}

main().catch((error) => {
  console.error("news-intelligence-phase2.test.cjs FAIL", error);
  process.exit(1);
});
