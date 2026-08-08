#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { config } from "dotenv";

config({ path: ".env.local" });

const require = createRequire(import.meta.url);
const workerRoot = path.join(process.cwd(), "worker");

const {
  createFamilyAggregationCoordinator,
  composeFamilyEditorial,
  validateQualityGateV2,
  validateNumericTokenIntegrity,
  createPhase2BrandedFallback,
  resolvePublicationImage,
  interpretSingleEvent,
} = require(path.join(workerRoot, "lib/news-intelligence/economic-editorial"));

const {
  getPhase2RuntimeConfig,
  isPhase2EditorialEnabled,
  isPhase2AiEnabled,
} = require(path.join(workerRoot, "lib/news-intelligence/economic-editorial/integration.js"));

const {
  createNewsPublisherGateway,
  createPublicationStore,
  PUBLICATION_TYPES,
  SOURCE_TYPES,
  DESTINATIONS,
  BLOCK_REASONS,
} = require(path.join(workerRoot, "lib/news-intelligence/index.js"));

const {
  validateGeneralRssEditorialOutput,
  RSS_EDITORIAL_BLOCK_REASONS,
} = require(path.join(workerRoot, "lib/general-rss"));

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

function noopDelivery() {
  return { ok: true };
}

async function runJoblessScenario(label, submitFn) {
  const coordinator = createFamilyAggregationCoordinator({ windowMs: 6000 });
  const options = {
    disableAi: true,
    testMode: false,
    allowPlaceholderImage: false,
    createBrandedFallback: createPhase2BrandedFallback,
    allowSourceImage: false,
    sourceImageUrl: null,
  };
  const result = await submitFn(coordinator, options);
  assert.equal(result.ok, true, `${label}: editorial failed`);
  assert.match(result.body, /مختلطة/, `${label}: mixed interpretation`);
  assert.match(result.body, /199K/);
  assert.match(result.body, /1\.801M|1801K/i);
  assert.doesNotMatch(result.body, /https?:\/\//i);
  assert.doesNotMatch(result.body, /ForexBreakingNews/i);
  assert.ok(result.image || result.imageMeta, `${label}: image required`);
  assert.equal(result.aiMeta?.aiUsed, false, `${label}: ai must stay off`);
  return result;
}

async function testImageProductionFallback() {
  const imageResult = await resolvePublicationImage(
    {
      headline: "بيانات إعانات البطالة الأمريكية",
      eventType: "US_WEEKLY_LABOR_CLAIMS",
      eventFamily: "US_WEEKLY_LABOR_CLAIMS",
      importance: "HIGH",
    },
    {
      allowSourceImage: false,
      sourceImageUrl: null,
      createCategoryVisual: async () => null,
      createBrandedFallback: createPhase2BrandedFallback,
      testMode: false,
      allowPlaceholderImage: false,
    }
  );

  assert.equal(imageResult.ok, true, "required image chain must succeed");
  assert.ok(imageResult.image, "image path must exist");
  assert.ok(fs.existsSync(imageResult.image), "image file must exist on disk");
  const stat = fs.statSync(imageResult.image);
  assert.ok(stat.size > 1000, "image must be non-trivial png");
  const header = fs.readFileSync(imageResult.image).subarray(0, 8);
  assert.equal(header[0], 0x89, "png signature");
  return {
    imagePath: imageResult.image,
    bytes: stat.size,
    source: imageResult.meta?.source,
  };
}

async function testQualityGateFailures() {
  const deterministic = interpretSingleEvent(INITIAL);
  const structured = {
    headline: "test",
    factsBlock: "x",
    visualPriority: "OPTIONAL",
  };

  const urlFail = validateQualityGateV2({
    structured,
    body: "https://example.com/bad link with enough length to pass minimum size requirement here",
    structuredEvent: INITIAL,
    deterministic,
  });
  assert.equal(urlFail.ok, false);

  const competitorFail = validateQualityGateV2({
    structured,
    body: "ForexBreakingNews promo with enough filler text to exceed minimum editorial length requirement",
    structuredEvent: INITIAL,
    deterministic,
  });
  assert.equal(competitorFail.ok, false);

  const moveFail = validateQualityGateV2({
    structured,
    body: "الدولار ارتفع 1% بعد البيانات مع نص طويل بما يكفي لتجاوز الحد الأدنى للطول المطلوب",
    structuredEvent: INITIAL,
    deterministic,
  });
  assert.equal(moveFail.ok, false);

  const numericFail = validateNumericTokenIntegrity("الحالي: 999K", INITIAL.canonicalFacts, {
    structuredEvent: INITIAL,
  });
  assert.equal(numericFail.ok, false);
  assert.equal(numericFail.reason, "HALLUCINATED_NUMERIC_TOKEN");

  const imageFail = await resolvePublicationImage(
    { eventType: "US_INITIAL_JOBLESS_CLAIMS", eventFamily: "US_WEEKLY_LABOR_CLAIMS", importance: "HIGH" },
    {
      testMode: false,
      allowPlaceholderImage: false,
      allowSourceImage: false,
      createBrandedFallback: async () => null,
      createCategoryVisual: async () => null,
    }
  );
  assert.equal(imageFail.ok, false);
  assert.equal(imageFail.reason, "IMAGE_REQUIRED_UNAVAILABLE");

  return {
    urlBlocked: true,
    competitorBlocked: true,
    moveClaimBlocked: true,
    numericBlocked: numericFail.reason,
    imageRequiredUnavailable: imageFail.reason,
  };
}

async function testRssSafety() {
  const pass = validateGeneralRssEditorialOutput({
    title: "Oil prices jump on Gulf tensions",
    body: "ارتفعت أسعار النفط بعد تصاعد التوترات في الخليج، مع ترقب الأسواق لتداعيات العرض والطلب.",
    rawSourceText: "Oil prices jump on Gulf tensions after shipping risks increased.",
  });
  assert.equal(pass.ok, true, "rewritten RSS should pass");

  const identical = validateGeneralRssEditorialOutput({
    title: "Oil prices jump",
    body: "Oil prices jump on Gulf tensions after shipping risks increased with enough extra words here.",
    rawSourceText: "Oil prices jump on Gulf tensions after shipping risks increased.",
  });
  assert.equal(identical.ok, false);

  const competitor = validateGeneralRssEditorialOutput({
    title: "Market",
    body: "Follow ForexBreakingNews for updates with enough filler text to exceed minimum editorial length.",
    rawSourceText: "Market headline",
  });
  assert.equal(competitor.ok, false);
  assert.equal(competitor.reason, RSS_EDITORIAL_BLOCK_REASONS.RSS_COMPETITOR_CHANNEL_PRESENT);

  const gateway = createNewsPublisherGateway({ runtimeMode: "test", forceMemory: true });
  const rssEconomic = await gateway.publish(
    {
      eventType: "US_INITIAL_JOBLESS_CLAIMS",
      publicationType: PUBLICATION_TYPES.RELEASE,
      country: "US",
      releaseDate: RELEASE_TIME,
      title: "US CPI",
      body: "Previous 0.3% Forecast 0.2% Actual 0.4% with enough filler to pass editorial minimum length requirement here",
      sourceType: SOURCE_TYPES.RSS_GENERAL,
      sourceId: "CNBC",
      sourceLink: "https://rss.example/cpi",
      facts: { actual: "0.4%", forecast: "0.2%", previous: "0.3%" },
    },
    { dryRun: true }
  );
  assert.equal(rssEconomic.blocked, true);
  assert.equal(rssEconomic.reason, BLOCK_REASONS.RSS_ECONOMIC_PUBLISH_FORBIDDEN);

  return { pass: true, identicalBlocked: true, competitorBlocked: true, rssEconomicBlocked: rssEconomic.reason };
}

async function testPhase1Idempotency(familyResult) {
  const store = createPublicationStore({ runtimeMode: "test", forceMemory: true });
  const gateway = createNewsPublisherGateway({ store, runtimeMode: "test" });
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
    sourceLink: "canary-phase2:1",
    familyPublicationKey: familyResult.familyPublicationKey,
    facts: INITIAL.canonicalFacts,
  };
  const first = await gateway.publish(publication, {
    dryRun: true,
    sendTelegramMessage: noopDelivery,
    saveNewsPostToSupabase: noopDelivery,
  });
  assert.equal(first.dryRun || first.published, true);
  const second = await gateway.publish(
    { ...publication, sourceLink: "canary-phase2:2" },
    { dryRun: true, sendTelegramMessage: noopDelivery, saveNewsPostToSupabase: noopDelivery }
  );
  assert.equal(second.blocked, true);
  assert.equal(second.reason, BLOCK_REASONS.DUPLICATE_BLOCKED);
  return { duplicateBlocked: second.reason };
}

async function main() {
  const prevFlag = process.env.NEWS_PHASE2_EDITORIAL;
  process.env.NEWS_PHASE2_EDITORIAL = "1";

  const runtime = getPhase2RuntimeConfig({});
  assert.equal(runtime.phase2Editorial, true);
  assert.equal(runtime.phase2Ai, false);
  assert.equal(isPhase2AiEnabled({ openAiClient: { complete: async () => "{}" } }), false);

  const imageProof = await testImageProductionFallback();
  const qualityFailures = await testQualityGateFailures();
  const rssSafety = await testRssSafety();

  const scenarioA = await runJoblessScenario("A_initial_then_continuing", async (coordinator, options) => {
    const firstPromise = coordinator.submitStructuredEvent(INITIAL, options);
    await new Promise((r) => setTimeout(r, 5));
    await coordinator.submitStructuredEvent(CONTINUING, options);
    return firstPromise;
  });

  const scenarioB = await runJoblessScenario("B_continuing_then_initial", async (coordinator, options) => {
    const firstPromise = coordinator.submitStructuredEvent(CONTINUING, options);
    await new Promise((r) => setTimeout(r, 5));
    await coordinator.submitStructuredEvent(INITIAL, options);
    return firstPromise;
  });

  const scenarioC = await (async () => {
    const coordinator = createFamilyAggregationCoordinator({ windowMs: 50 });
    const result = await coordinator.submitStructuredEvent(INITIAL, {
      disableAi: true,
      testMode: false,
      allowPlaceholderImage: false,
      windowMs: 50,
      createBrandedFallback: createPhase2BrandedFallback,
    });
    assert.equal(result.ok, true);
    assert.match(result.body, /199K/);
    return result;
  })();

  const scenarioD = await runJoblessScenario("D_duplicate_initial_then_continuing", async (coordinator, options) => {
    const firstPromise = coordinator.submitStructuredEvent(INITIAL, options);
    coordinator.submitStructuredEvent(INITIAL, options);
    coordinator.submitStructuredEvent(INITIAL, options);
    coordinator.submitStructuredEvent(CONTINUING, options);
    return firstPromise;
  });

  const scenarioE = await (async () => {
    const coordinator = createFamilyAggregationCoordinator({ windowMs: 40 });
    const options = {
      disableAi: true,
      testMode: false,
      allowPlaceholderImage: false,
      windowMs: 40,
      createBrandedFallback: createPhase2BrandedFallback,
    };
    const family = await composeFamilyEditorial("US_WEEKLY_LABOR_CLAIMS", [INITIAL, CONTINUING], options);
    assert.equal(family.ok, true);
    coordinator._publishedFamilies.add(`${INITIAL.country}|US_WEEKLY_LABOR_CLAIMS|${RELEASE_TIME}`);
    const late = await coordinator.submitStructuredEvent(CONTINUING, options);
    assert.equal(late.blocked, true);
    assert.equal(late.reason, "DUPLICATE_BLOCKED");
    return { blocked: late.reason };
  })();

  const idempotency = await testPhase1Idempotency(scenarioA);

  const report = {
    runtime,
    imageProof,
    qualityFailures,
    rssSafety,
    joblessScenarios: {
      A: { ok: true, familyKey: scenarioA.familyPublicationKey },
      B: { ok: true, familyKey: scenarioB.familyPublicationKey },
      C: { ok: true, mode: "single_child_timeout" },
      D: { ok: true },
      E: scenarioE,
    },
    idempotency,
    aiCalls: 0,
  };

  console.log("PRODUCTION_PHASE2_CANARY_PASS", JSON.stringify(report, null, 2));

  if (prevFlag === undefined) {
    delete process.env.NEWS_PHASE2_EDITORIAL;
  } else {
    process.env.NEWS_PHASE2_EDITORIAL = prevFlag;
  }
}

main().catch((error) => {
  console.error("PRODUCTION_PHASE2_CANARY_FAIL", error);
  process.exit(1);
});
