#!/usr/bin/env node

const assert = require("assert");
const path = require("path");

const integration = require(path.join(__dirname, "..", "lib", "news-intelligence", "economic-editorial", "integration"));
const {
  createFamilyAggregationCoordinator,
  composeFamilyEditorial,
} = require(path.join(__dirname, "..", "lib", "news-intelligence", "economic-editorial"));

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

function withEnv(key, value, fn) {
  const prev = process.env[key];
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (prev === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = prev;
      }
    });
}

async function testFeatureFlagSemantics() {
  await withEnv("NEWS_PHASE2_EDITORIAL", undefined, async () => {
    assert.strictEqual(integration.isPhase2EditorialEnabled({}), false);
  });
  await withEnv("NEWS_PHASE2_EDITORIAL", "0", async () => {
    assert.strictEqual(integration.isPhase2EditorialEnabled({}), false);
  });
  await withEnv("NEWS_PHASE2_EDITORIAL", "1", async () => {
    assert.strictEqual(integration.isPhase2EditorialEnabled({}), true);
  });
  await withEnv("NEWS_PHASE2_EDITORIAL", undefined, async () => {
    assert.strictEqual(integration.isPhase2EditorialEnabled({ enablePhase2Editorial: true }), true);
  });

  const runtime = integration.getPhase2RuntimeConfig({ enablePhase2Editorial: true });
  assert.strictEqual(runtime.phase2Editorial, true);
  assert.strictEqual(runtime.phase2Ai, false);
}

async function testImmediateMergeWhenSiblingReady() {
  const coordinator = createFamilyAggregationCoordinator({ windowMs: 6000 });
  const options = { disableAi: true, testMode: true, allowPlaceholderImage: true };
  const started = Date.now();
  const firstPromise = coordinator.submitStructuredEvent(INITIAL, options);
  const secondPromise = coordinator.submitStructuredEvent(CONTINUING, options);
  const [first, second] = await Promise.all([firstPromise, secondPromise]);
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 500, `merge should be immediate, took ${elapsed}ms`);
  assert.strictEqual(first.body, second.body);
  assert.match(first.body, /مختلطة/);
}

async function testContinuingFirstThenInitial() {
  const coordinator = createFamilyAggregationCoordinator({ windowMs: 80 });
  const options = { disableAi: true, testMode: true, allowPlaceholderImage: true };
  const continuingPromise = coordinator.submitStructuredEvent(CONTINUING, options);
  await new Promise((r) => setTimeout(r, 5));
  await coordinator.submitStructuredEvent(INITIAL, options);
  const result = await continuingPromise;
  assert.strictEqual(result.ok, true);
  assert.match(result.body, /طلبات الإعانة الأولية/);
  assert.match(result.body, /طلبات الإعانة المستمرة/);
}

async function testDuplicateInitialDoesNotExtendWindow() {
  const coordinator = createFamilyAggregationCoordinator({ windowMs: 200 });
  const options = { disableAi: true, testMode: true, allowPlaceholderImage: true, windowMs: 200 };
  const started = Date.now();
  const resultPromise = coordinator.submitStructuredEvent(INITIAL, options);
  coordinator.submitStructuredEvent(INITIAL, options);
  coordinator.submitStructuredEvent(INITIAL, options);
  coordinator.submitStructuredEvent(CONTINUING, options);
  const result = await resultPromise;
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 150, `duplicate child should not extend wait beyond merge, took ${elapsed}ms`);
  assert.strictEqual(result.ok, true);
  assert.match(result.body, /199K/);
}

async function testLateChildBlockedAfterPublication() {
  const coordinator = createFamilyAggregationCoordinator({ windowMs: 40 });
  const options = { disableAi: true, testMode: true, allowPlaceholderImage: true, windowMs: 40 };
  const first = await coordinator.submitStructuredEvent(INITIAL, options);
  assert.strictEqual(first.ok, true);
  const late = await coordinator.submitStructuredEvent(CONTINUING, options);
  assert.strictEqual(late.ok, false);
  assert.strictEqual(late.reason, "DUPLICATE_BLOCKED");
}

async function testSingleChildTimeoutPublishes() {
  const coordinator = createFamilyAggregationCoordinator({ windowMs: 40 });
  const started = Date.now();
  const result = await coordinator.submitStructuredEvent(INITIAL, {
    disableAi: true,
    testMode: true,
    allowPlaceholderImage: true,
    windowMs: 40,
  });
  const elapsed = Date.now() - started;
  assert.ok(elapsed >= 35 && elapsed < 500, `timeout publish expected ~40ms, took ${elapsed}ms`);
  assert.strictEqual(result.ok, true);
  assert.match(result.body, /199K/);
}

async function main() {
  await testFeatureFlagSemantics();
  await testImmediateMergeWhenSiblingReady();
  await testContinuingFirstThenInitial();
  await testDuplicateInitialDoesNotExtendWindow();
  await testLateChildBlockedAfterPublication();
  await testSingleChildTimeoutPublishes();
  console.log("news-intelligence-phase2-aggregation.test.cjs: all tests passed");
}

main().catch((error) => {
  console.error("news-intelligence-phase2-aggregation.test.cjs FAIL", error);
  process.exit(1);
});
