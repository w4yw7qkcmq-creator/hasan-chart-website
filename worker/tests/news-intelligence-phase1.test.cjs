#!/usr/bin/env node

const assert = require("assert");
const path = require("path");

const root = path.join(__dirname, "..", "lib", "news-intelligence");
const {
  createNewsPublisherGateway,
  createPublicationStore,
  PUBLICATION_TYPES,
  SOURCE_TYPES,
  DESTINATIONS,
  BLOCK_REASONS,
  LEG_STATUS,
} = require(root);
const { validateNumericEconomicSourcePolicy, isApprovedTelegramSourceChannel, isApprovedNumericEconomicTelegramSource, BLOCK_REASONS: SOURCE_POLICY_BLOCK_REASONS } = require(path.join(root, "source-policy"));
const { detectNumericEconomicReleaseCandidate } = require(path.join(root, "economic-event-detector"));
const { handleManualSendNewsRequest } = require(path.join(__dirname, "..", "..", "lib", "news-intelligence", "manual-publish"));
const { mergeProviderEvents } = require(path.join(__dirname, "..", "lib", "economic-releases", "normalize"));
const { formatEconomicReleaseMessage } = require(path.join(__dirname, "..", "lib", "economic-releases", "format"));
const { CANONICAL_EVENT_DEFINITIONS } = require(path.join(__dirname, "..", "lib", "economic-releases", "canonical-events"));
const {
  publishValidatedTelegramNewsCandidate,
  retryPublishLeg,
  resetAtomicPublishForTests,
} = require(path.join(__dirname, "..", "lib", "telegram-news", "atomic-publish"));
const {
  resetPublishStateForTests,
  configurePublishWindowForTests,
  initializeBaselinesFromPosts,
  completeBaselineFetch,
} = require(path.join(__dirname, "..", "lib", "telegram-news", "publish-state"));

function enablePublishStateForTests(baselineMessageId = "0") {
  resetPublishStateForTests();
  resetAtomicPublishForTests();
  process.env.TELEGRAM_NEWS_PUBLISH_ENABLED = "1";
  const baselineTime = "2026-08-01T12:00:00+00:00";
  configurePublishWindowForTests({
    publishingEnabledAt: baselineTime,
    minimumPublishableSourceTime: baselineTime,
  });
  initializeBaselinesFromPosts([
    {
      sourceChannel: "ForexBreakingNews",
      sourceMessageId: String(baselineMessageId),
      sourcePublishedAt: "2026-08-01T13:00:00+00:00",
      rawText: "baseline",
      sourceUrl: `telegram:ForexBreakingNews/${baselineMessageId}`,
    },
    {
      sourceChannel: "ForexNewspaper",
      sourceMessageId: String(baselineMessageId),
      sourcePublishedAt: "2026-08-01T13:00:00+00:00",
      rawText: "baseline",
      sourceUrl: `telegram:ForexNewspaper/${baselineMessageId}`,
    },
  ]);
  completeBaselineFetch();
}

const RELEASE_DATE = "2026-08-06T12:30:00.000Z";

function buildProfessionalReleaseMessage() {
  const event = mergeProviderEvents([
    {
      eventKey: "US_INITIAL_JOBLESS_CLAIMS",
      title: "Initial Jobless Claims",
      country: "US",
      scheduledAt: RELEASE_DATE,
      actual: "199K",
      forecast: "203K",
      previous: "197K",
      sourceName: "telegram",
      sourceTimestamp: RELEASE_DATE,
    },
  ]);
  return formatEconomicReleaseMessage(event, CANONICAL_EVENT_DEFINITIONS.US_INITIAL_JOBLESS_CLAIMS);
}

function buildPublication(overrides = {}) {
  const body = overrides.body || buildProfessionalReleaseMessage();
  return {
    eventType: "US_INITIAL_JOBLESS_CLAIMS",
    country: "US",
    releaseDate: RELEASE_DATE,
    publicationType: PUBLICATION_TYPES.RELEASE,
    sourceType: SOURCE_TYPES.TELEGRAM_ECONOMIC,
    sourceId: overrides.sourceId || "ForexBreakingNews",
    title: "طلبات إعانة البطالة الأمريكية",
    body,
    bodySource: "formatted",
    rawSourceText: overrides.rawSourceText || null,
    destination: DESTINATIONS.BOTH,
    sourceLink: overrides.sourceLink || "telegram:ForexBreakingNews/phase1",
    importance: "HIGH",
    facts: { actual: "199K", forecast: "203K", previous: "197K" },
    ...overrides,
  };
}

function testSourcePolicy() {
  assert.strictEqual(isApprovedTelegramSourceChannel("ForexBreakingNews"), true);
  assert.strictEqual(isApprovedTelegramSourceChannel("ForexNewspaper"), true);
  assert.strictEqual(isApprovedTelegramSourceChannel("RandomChannel"), false);
  assert.strictEqual(isApprovedNumericEconomicTelegramSource("ForexBreakingNews"), true);
  assert.strictEqual(isApprovedNumericEconomicTelegramSource("ForexNewspaper"), false);

  const approved = validateNumericEconomicSourcePolicy({
    eventType: "US_INITIAL_JOBLESS_CLAIMS",
    sourceType: SOURCE_TYPES.TELEGRAM_ECONOMIC,
    sourceId: "ForexBreakingNews",
    publicationType: PUBLICATION_TYPES.RELEASE,
  });
  assert.strictEqual(approved.ok, true);

  const forexNewspaperBlocked = validateNumericEconomicSourcePolicy({
    eventType: "US_INITIAL_JOBLESS_CLAIMS",
    sourceType: SOURCE_TYPES.TELEGRAM_ECONOMIC,
    sourceId: "ForexNewspaper",
    publicationType: PUBLICATION_TYPES.RELEASE,
  });
  assert.strictEqual(forexNewspaperBlocked.ok, false);
  assert.strictEqual(forexNewspaperBlocked.reason, SOURCE_POLICY_BLOCK_REASONS.ECONOMIC_SOURCE_NOT_ALLOWED);
  assert.strictEqual(forexNewspaperBlocked.detail, "numeric_economic_channel_not_allowed");

  const rss = validateNumericEconomicSourcePolicy({
    eventType: "US_CPI_MOM",
    sourceType: SOURCE_TYPES.RSS_GENERAL,
    sourceId: "https://rss.example/item",
    publicationType: PUBLICATION_TYPES.RELEASE,
  });
  assert.strictEqual(rss.ok, false);
  assert.strictEqual(rss.reason, BLOCK_REASONS.RSS_ECONOMIC_PUBLISH_FORBIDDEN);

  const manual = validateNumericEconomicSourcePolicy({
    eventType: "US_NFP",
    sourceType: SOURCE_TYPES.MANUAL_API,
    sourceId: "ForexBreakingNews",
    publicationType: PUBLICATION_TYPES.RELEASE,
  });
  assert.strictEqual(manual.ok, false);
  assert.strictEqual(manual.reason, BLOCK_REASONS.MANUAL_ECONOMIC_PUBLISH_FORBIDDEN);

  const spoof = validateNumericEconomicSourcePolicy({
    eventType: "US_GDP_QOQ",
    sourceType: SOURCE_TYPES.TELEGRAM_ECONOMIC,
    sourceId: "FakeChannel",
    publicationType: PUBLICATION_TYPES.RELEASE,
  });
  assert.strictEqual(spoof.ok, false);
  assert.strictEqual(spoof.reason, BLOCK_REASONS.ECONOMIC_SOURCE_NOT_ALLOWED);
}

function testRssHardBoundaryDetector() {
  const english = detectNumericEconomicReleaseCandidate({
    title: "US Weekly Claims Report",
    text: "Initial Jobless Claims previous 197K forecast 203K actual 199K",
    releaseDate: RELEASE_DATE,
  });
  assert.strictEqual(english.isNumericEconomicCandidate, true);
  assert.strictEqual(english.eventType, "US_INITIAL_JOBLESS_CLAIMS");

  const arabic = detectNumericEconomicReleaseCandidate({
    title: "مطالبات البطالة الأمريكية",
    text: "السابق: 197K المتوقع: 203K الحالي: 199K",
    releaseDate: RELEASE_DATE,
  });
  assert.strictEqual(arabic.isNumericEconomicCandidate, true);

  const cpi = detectNumericEconomicReleaseCandidate({
    title: "US CPI m/m",
    text: "Previous 0.2% Forecast 0.3% Actual 0.4%",
    releaseDate: RELEASE_DATE,
  });
  assert.strictEqual(cpi.isNumericEconomicCandidate, true);
  assert.ok(cpi.eventType.startsWith("US_CPI"));
}

async function testProductionFailClosedWithoutDb() {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousAllow = process.env.NEWS_INTELLIGENCE_ALLOW_MEMORY_IDEMPOTENCY;
  delete process.env.NEWS_INTELLIGENCE_ALLOW_MEMORY_IDEMPOTENCY;
  process.env.NODE_ENV = "production";

  try {
    const gateway = createNewsPublisherGateway({ supabase: null, runtimeMode: "production" });
    const result = await gateway.publish(buildPublication(), { dryRun: true });
    assert.strictEqual(result.blocked, true);
    assert.strictEqual(result.reason, BLOCK_REASONS.IDEMPOTENCY_STORE_UNAVAILABLE);
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
    if (previousAllow) {
      process.env.NEWS_INTELLIGENCE_ALLOW_MEMORY_IDEMPOTENCY = previousAllow;
    }
  }
}

async function testConcurrentIdentityAcquisition() {
  const store = createPublicationStore({ runtimeMode: "test", forceMemory: true });
  const gateway = createNewsPublisherGateway({ store, runtimeMode: "test" });
  const publication = buildPublication();

  const results = await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      gateway.publish(
        buildPublication({ sourceLink: `telegram:ForexBreakingNews/concurrent-${index}` }),
        { dryRun: true }
      )
    )
  );

  const allowed = results.filter((result) => result.published).length;
  const blocked = results.filter((result) => result.blocked && result.reason === BLOCK_REASONS.DUPLICATE_BLOCKED).length;
  assert.strictEqual(allowed, 1);
  assert.strictEqual(blocked, 9);
}

async function testDeliveryRetryDoesNotRetelegram() {
  const store = createPublicationStore({ runtimeMode: "test", forceMemory: true });
  const gateway = createNewsPublisherGateway({ store, runtimeMode: "test" });
  const publication = buildPublication({ visualPriority: "OPTIONAL" });
  let telegramCalls = 0;

  const first = await gateway.publish(publication, {
    sendTelegramMessage: async () => {
      telegramCalls += 1;
      return { ok: true };
    },
    saveNewsPostToSupabase: async () => ({ error: "db_failed" }),
  });

  assert.strictEqual(first.partial, true);
  assert.strictEqual(first.telegramSent, true);
  assert.strictEqual(first.siteInserted, false);
  assert.strictEqual(telegramCalls, 1);

  const retry = await gateway.retryDelivery(
    first.publicationRecord,
    { retryLeg: "site_only" },
    {
      sendTelegramMessage: async () => {
        telegramCalls += 1;
        return { ok: true };
      },
      saveNewsPostToSupabase: async () => ({ ok: true, id: "post-1" }),
    }
  );

  assert.strictEqual(retry.siteInserted, true);
  assert.strictEqual(telegramCalls, 1);
  assert.strictEqual(retry.publicationRecord.telegramLegStatus, LEG_STATUS.SUCCESS);
}

async function testRequiredReleaseBlocksTextOnlyPartialDelivery() {
  const store = createPublicationStore({ runtimeMode: "test", forceMemory: true });
  const gateway = createNewsPublisherGateway({ store, runtimeMode: "test" });
  let telegramCalls = 0;

  const result = await gateway.publish(buildPublication({ visualPriority: "REQUIRED" }), {
    sendTelegramMessage: async () => {
      telegramCalls += 1;
      return { ok: true };
    },
    saveNewsPostToSupabase: async () => ({ error: "db_failed" }),
  });

  assert.strictEqual(result.blocked, true);
  assert.strictEqual(result.reason, BLOCK_REASONS.IMAGE_REQUIRED_UNAVAILABLE);
  assert.strictEqual(telegramCalls, 0);
}

async function testRequiredReleaseRetryDoesNotDuplicate() {
  const store = createPublicationStore({ runtimeMode: "test", forceMemory: true });
  const gateway = createNewsPublisherGateway({ store, runtimeMode: "test" });
  const publication = buildPublication({ visualPriority: "REQUIRED" });

  const blocked = await gateway.publish(publication, {
    resolvePublicationImageResult: async () => ({
      ok: true,
      policy: { mode: "AI_PRIMARY" },
      imageResult: { generationAttempted: true, delivery: "text", filePath: null, imageUrl: null },
      telemetry: {},
      imageStatus: "missing",
    }),
    sendTelegramMessage: async () => ({ ok: true }),
    saveNewsPostToSupabase: async () => ({}),
  });
  assert.strictEqual(blocked.blocked, true);
  assert.strictEqual(blocked.reason, BLOCK_REASONS.IMAGE_REQUIRED_UNAVAILABLE);

  const retry = await gateway.publish(
    buildPublication({ visualPriority: "REQUIRED", sourceLink: "telegram:ForexBreakingNews/required-retry" }),
    {
      resolvePublicationImageResult: async () => ({
        ok: true,
        policy: { mode: "AI_PRIMARY" },
        imageResult: { generationAttempted: true, delivery: "text", filePath: null, imageUrl: null },
        telemetry: {},
        imageStatus: "missing",
      }),
      sendTelegramMessage: async () => ({ ok: true }),
      saveNewsPostToSupabase: async () => ({}),
    }
  );
  assert.strictEqual(retry.blocked, true);
  assert.strictEqual(retry.reason, BLOCK_REASONS.DUPLICATE_BLOCKED);
}

async function testManualApiBlocked() {
  const result = await handleManualSendNewsRequest(
    {
      title: "Initial Jobless Claims",
      actual: "199K",
      forecast: "203K",
      previous: "197K",
      analysis: "تحليل يدوي",
      claimedSourceChannel: "ForexBreakingNews",
      dryRun: true,
    },
    { runtimeMode: "test", forceMemory: true }
  );

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.blocked, true);
  assert.strictEqual(result.reason, BLOCK_REASONS.MANUAL_ECONOMIC_PUBLISH_FORBIDDEN);
}

async function testAtomicRetryUsesGatewayRecord() {
  resetAtomicPublishForTests();
  const store = createPublicationStore({ runtimeMode: "test", forceMemory: true });
  let telegramCalls = 0;

  const first = await createNewsPublisherGateway({ store, runtimeMode: "test" }).publish(
    buildPublication({ visualPriority: "OPTIONAL" }),
    {
    sendTelegramMessage: async () => {
      telegramCalls += 1;
      return { ok: true };
    },
    saveNewsPostToSupabase: async () => ({ error: "db_failed" }),
  });

  assert.strictEqual(first.partial, true);
  assert.strictEqual(telegramCalls, 1);
  assert.ok(first.publicationRecord);

  const retry = await retryPublishLeg(
    {},
    {
      fingerprint: "retry-test-fingerprint",
      sourceLink: "telegram:ForexBreakingNews/9001",
      telegramSent: true,
      siteInserted: false,
      publicationRecord: first.publicationRecord,
      state: "telegram_published",
      retryable: true,
    },
    {},
    {
      runtimeMode: "test",
      forceMemory: true,
      sendTelegramMessage: async () => {
        telegramCalls += 1;
        return { ok: true };
      },
      saveNewsPostToSupabase: async () => ({ ok: true, id: "site-1" }),
      savePublishedNewsToSupabase: async () => ({ ok: true }),
    }
  );

  assert.strictEqual(retry.published, true);
  assert.strictEqual(telegramCalls, 1);
}

async function run() {
  testSourcePolicy();
  testRssHardBoundaryDetector();
  await testProductionFailClosedWithoutDb();
  await testConcurrentIdentityAcquisition();
  await testDeliveryRetryDoesNotRetelegram();
  await testRequiredReleaseBlocksTextOnlyPartialDelivery();
  await testRequiredReleaseRetryDoesNotDuplicate();
  await testManualApiBlocked();
  await testAtomicRetryUsesGatewayRecord();
  console.log("news-intelligence-phase1.test.cjs: all tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
