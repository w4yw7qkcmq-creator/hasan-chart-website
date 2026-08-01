#!/usr/bin/env node

const assert = require("assert");
const path = require("path");
const fs = require("fs");

const root = path.join(__dirname, "..");

const {
  isPremiumImageEvent,
  getPremiumEventDisplayName,
  buildPremiumImageContextFromRelease,
  buildPremiumImageContextFromCandidate,
} = require(path.join(root, "lib/news-images/important-events"));
const { buildCacheKey, readCachedImage, writeCachedImage, resetCacheForTests } = require(path.join(root, "lib/news-images/cache"));
const { createFallbackImageProvider } = require(path.join(root, "lib/news-images/fallback-image-provider"));
const { composePremiumNewsImage, buildBrandOverlaySvg } = require(path.join(root, "lib/news-images/composer"));
const { createNewsImageProviderRegistry } = require(path.join(root, "lib/news-images/registry"));
const { generatePremiumNewsImage, isPremiumImagesEnabled } = require(path.join(root, "lib/news-images/index"));
const {
  deliverTelegramNewsWithOptionalPhoto,
  cleanupTempImageFile,
  resolvePremiumImageForCandidate,
} = require(path.join(root, "lib/news-images/telegram-delivery"));
const { publishValidatedTelegramNewsCandidate, resetAtomicPublishForTests } = require(path.join(root, "lib/telegram-news/atomic-publish"));
const {
  resetPublishStateForTests,
  configurePublishWindowForTests,
  initializeBaselinesFromPosts,
  completeBaselineFetch,
} = require(path.join(root, "lib/telegram-news/publish-state"));
const { filterGeneralRssItems } = require(path.join(root, "lib/telegram-news/rss-filter"));

const TEST_CACHE_DIR = path.join(__dirname, ".tmp-news-images-cache");
const TEST_OUTPUT_DIR = path.join(__dirname, ".tmp-news-images-output");

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
    },
    {
      sourceChannel: "ForexNewspaper",
      sourceMessageId: String(baselineMessageId),
      sourcePublishedAt: "2026-08-01T13:00:00+00:00",
    },
  ]);
  completeBaselineFetch();
}

function makeCpiCandidate() {
  return {
    post: {
      sourceChannel: "ForexBreakingNews",
      sourceMessageId: "9001",
      sourceUrl: "https://t.me/ForexBreakingNews/9001",
      sourcePublishedAt: "2026-08-02T12:30:00.000Z",
    },
    facts: {
      title: "US CPI",
      canonicalEventKey: "US_CPI_MOM",
      canonical: { eventKey: "US_CPI_MOM", arabicName: "مؤشر أسعار المستهلك" },
      country: "US",
      previous: "0.2%",
      forecast: "0.3%",
      actual: "0.4%",
      numbers: ["0.2%", "0.3%", "0.4%"],
      detailLines: ["Previous: 0.2%", "Forecast: 0.3%", "Actual: 0.4%"],
    },
    formattedMessage:
      "🚨 مؤشر أسعار المستهلك الأمريكي\n\nPrevious: 0.2%\nForecast: 0.3%\nActual: 0.4%\n\n📊 التأثير المحتمل:\nقد يؤثر على الدولار والذهب.",
    skipPublish: false,
    newsType: "economic",
    resolvedTitle: "مؤشر أسعار المستهلك الأمريكي",
  };
}

function makeGoldCandidate() {
  return {
    post: {
      sourceChannel: "ForexBreakingNews",
      sourceMessageId: "9002",
      sourceUrl: "https://t.me/ForexBreakingNews/9002",
      sourcePublishedAt: "2026-08-02T12:31:00.000Z",
    },
    facts: {
      title: "Gold",
      detailLines: ["Gold rises 1.8% after Powell comments"],
      numbers: ["1.8%"],
    },
    formattedMessage:
      "🚨 الذهب يسجل تحركًا ملحوظًا\n\nسجل الذهب ارتفاعًا بنسبة 1.8%.\n\n📊 التأثير المحتمل:\nقد ينعكس ذلك على الدولار والذهب.",
    skipPublish: false,
    newsType: "general",
    resolvedTitle: "الذهب يسجل تحركًا ملحوظًا",
  };
}

function testPremiumEventSelection() {
  assert.strictEqual(isPremiumImageEvent("US_CPI_MOM"), true);
  assert.strictEqual(isPremiumImageEvent("US_NFP"), true);
  assert.strictEqual(isPremiumImageEvent("US_POWELL_SPEECH"), true);
  assert.strictEqual(isPremiumImageEvent("US_FED_STATEMENT"), true);
  assert.strictEqual(isPremiumImageEvent("US_FED_RATE_DECISION"), true);
  assert.strictEqual(isPremiumImageEvent("US_ADP"), true);
  assert.strictEqual(isPremiumImageEvent("RANDOM_EVENT"), false);
}

function testNonPremiumEventsRejected() {
  assert.strictEqual(isPremiumImageEvent("US_SP_GLOBAL_PMI"), false);
  assert.strictEqual(isPremiumImageEvent(null), false);
}

function testDisplayNames() {
  assert.strictEqual(getPremiumEventDisplayName("US_CPI_MOM"), "US CPI");
  assert.strictEqual(getPremiumEventDisplayName("US_NFP"), "Non Farm Payrolls");
  assert.strictEqual(getPremiumEventDisplayName("US_FED_RATE_DECISION"), "Federal Reserve Interest Rate Decision");
}

function testBuildContextFromRelease() {
  const context = buildPremiumImageContextFromRelease({
    canonical: { eventKey: "US_NFP", arabicName: "تقرير الوظائف" },
    structuredRelease: { country: "US", scheduledAt: "2026-08-01T12:30:00.000Z" },
  });
  assert.strictEqual(context.eventKey, "US_NFP");
  assert.strictEqual(context.eventName, "Non Farm Payrolls");
  assert.strictEqual(context.country, "US");
  assert.strictEqual(context.brandName, "Economic Newsi");
}

function testBuildContextFromTelegramCandidate() {
  const context = buildPremiumImageContextFromCandidate(makeCpiCandidate());
  assert.strictEqual(context.eventKey, "US_CPI_MOM");
  assert.strictEqual(context.eventName, "US CPI");
  assert.strictEqual(context.brandName, "Economic Newsi");
  assert.strictEqual(buildPremiumImageContextFromCandidate(makeGoldCandidate()), null);
}

function testBrandOverlayContainsOnlyAllowedIdentity() {
  const svg = buildBrandOverlaySvg({ eventName: "US CPI" });
  assert.ok(svg.includes("Economic Newsi"));
  assert.ok(svg.includes("US CPI"));
  assert.ok(!/Previous|Forecast|Actual/i.test(svg));
  assert.ok(!/Hasan|Chart World|hasanchart|t\.me/i.test(svg));
}

async function testFallbackProviderAndComposer() {
  const provider = createFallbackImageProvider();
  const background = await provider.generateBackground({
    eventKey: "US_CPI_MOM",
    eventName: "US CPI",
    releaseTime: "2026-08-01T12:00:00.000Z",
  });
  const composed = await composePremiumNewsImage(background.backgroundBuffer, {
    eventName: "US CPI",
  });
  assert.ok(Buffer.isBuffer(composed));
  assert.ok(composed.length > 1000);
}

function testCacheKeyStableForSameRelease() {
  const context = {
    eventName: "US CPI",
    country: "US",
    releaseTime: "2026-08-01T12:34:56.000Z",
  };
  const a = buildCacheKey(context);
  const b = buildCacheKey(context);
  assert.strictEqual(a, b);
}

async function testCacheReuse() {
  resetCacheForTests(TEST_CACHE_DIR);
  const context = {
    eventKey: "US_PPI",
    eventName: "US PPI",
    country: "US",
    releaseTime: "2026-08-01T15:00:00.000Z",
  };
  const buffer = Buffer.from("fake-premium-image");
  writeCachedImage(context, buffer, { provider: "test" }, { cacheDir: TEST_CACHE_DIR });
  const cached = readCachedImage(context, { cacheDir: TEST_CACHE_DIR });
  assert.ok(cached?.buffer);
  assert.strictEqual(cached.buffer.toString(), "fake-premium-image");
}

async function testGeneratePremiumImageWithFallbackProvider() {
  resetCacheForTests(TEST_CACHE_DIR);
  const registry = createNewsImageProviderRegistry();
  const result = await generatePremiumNewsImage(
    {
      eventKey: "US_CPI_MOM",
      eventName: "US CPI",
      country: "US",
      releaseTime: "2026-08-02T10:00:00.000Z",
    },
    {
      forceEnabled: true,
      cacheDir: TEST_CACHE_DIR,
      outputDir: TEST_OUTPUT_DIR,
      registry,
      provider: "fallback",
    }
  );

  assert.ok(result?.filePath);
  assert.ok(fs.existsSync(result.filePath));
  assert.strictEqual(result.provider, "fallback");
  assert.strictEqual(result.cached, false);

  const second = await generatePremiumNewsImage(
    {
      eventKey: "US_CPI_MOM",
      eventName: "US CPI",
      country: "US",
      releaseTime: "2026-08-02T10:00:00.000Z",
    },
    {
      forceEnabled: true,
      cacheDir: TEST_CACHE_DIR,
      outputDir: TEST_OUTPUT_DIR,
      registry,
      provider: "fallback",
    }
  );
  assert.strictEqual(second.cached, true);
}

function testDisabledByDefaultUnlessForced() {
  const previous = process.env.NEWS_PREMIUM_IMAGES_ENABLED;
  delete process.env.NEWS_PREMIUM_IMAGES_ENABLED;
  assert.strictEqual(isPremiumImagesEnabled(), false);
  if (previous) {
    process.env.NEWS_PREMIUM_IMAGES_ENABLED = previous;
  }
}

function testRssGeneralStillWorks() {
  const general = filterGeneralRssItems([
    { title: "Gold rises 1.8%", contentSnippet: "Gold extended gains" },
    { title: "Bitcoin jumps", contentSnippet: "Crypto market rally" },
    { title: "Trump warns Iran", contentSnippet: "Geopolitical tensions rise" },
  ]);
  assert.strictEqual(general.length, 3);
  const structured = filterGeneralRssItems([
    { title: "US CPI", contentSnippet: "Previous: 0.2%\nForecast: 0.3%\nActual: 0.4%" },
  ]);
  assert.strictEqual(structured.length, 0);
}

async function testTelegramCpiUsesPremiumPhotoDelivery() {
  resetCacheForTests(TEST_CACHE_DIR);
  let photoCalls = 0;
  let textCalls = 0;
  const delivery = await deliverTelegramNewsWithOptionalPhoto({
    message: makeCpiCandidate().formattedMessage,
    candidate: makeCpiCandidate(),
    sendTelegramPhoto: async (message, photoPath, options) => {
      photoCalls += 1;
      assert.ok(message.includes("Actual: 0.4%"));
      assert.ok(fs.existsSync(photoPath));
      assert.strictEqual(options?.skipTextFallback, true);
    },
    sendTelegramMessage: async () => {
      textCalls += 1;
    },
    options: {
      forceEnabled: true,
      cacheDir: TEST_CACHE_DIR,
      outputDir: TEST_OUTPUT_DIR,
      provider: "fallback",
    },
  });

  assert.strictEqual(delivery.delivery, "photo");
  assert.strictEqual(delivery.premiumImage, true);
  assert.strictEqual(photoCalls, 1);
  assert.strictEqual(textCalls, 0);
}

async function testTelegramGoldSkipsPremiumImage() {
  let photoCalls = 0;
  let textCalls = 0;
  const delivery = await deliverTelegramNewsWithOptionalPhoto({
    message: makeGoldCandidate().formattedMessage,
    candidate: makeGoldCandidate(),
    sendTelegramPhoto: async () => {
      photoCalls += 1;
    },
    sendTelegramMessage: async () => {
      textCalls += 1;
    },
    options: { forceEnabled: true, cacheDir: TEST_CACHE_DIR, outputDir: TEST_OUTPUT_DIR, provider: "fallback" },
  });

  assert.strictEqual(delivery.delivery, "text");
  assert.strictEqual(delivery.premiumImage, false);
  assert.strictEqual(photoCalls, 0);
  assert.strictEqual(textCalls, 1);
}

async function testOpenAiFailureUsesFallbackImage() {
  resetCacheForTests(TEST_CACHE_DIR);
  const failingOpenAi = {
    name: "openai",
    generateBackground: async () => {
      throw new Error("openai_down");
    },
  };
  const registry = createNewsImageProviderRegistry({ providers: { openai: failingOpenAi } });
  const result = await resolvePremiumImageForCandidate(makeCpiCandidate(), {
    forceEnabled: true,
    cacheDir: TEST_CACHE_DIR,
    outputDir: TEST_OUTPUT_DIR,
    registry,
    provider: "openai",
  });

  assert.ok(result?.filePath);
  assert.strictEqual(result.provider, "fallback");
  assert.strictEqual(result.fallbackFrom, "openai");
}

async function testFallbackFailureTextOnlyOnce() {
  resetCacheForTests(TEST_CACHE_DIR);
  const brokenRegistry = createNewsImageProviderRegistry({
    providers: {
      fallback: {
        name: "fallback",
        generateBackground: async () => {
          throw new Error("fallback_down");
        },
      },
    },
  });

  let textCalls = 0;
  const candidate = makeCpiCandidate();
  candidate.post.sourcePublishedAt = "2026-08-02T16:45:00.000Z";
  const delivery = await deliverTelegramNewsWithOptionalPhoto({
    message: candidate.formattedMessage,
    candidate,
    sendTelegramPhoto: async () => {
      throw new Error("should_not_send_photo");
    },
    sendTelegramMessage: async () => {
      textCalls += 1;
    },
    options: {
      forceEnabled: true,
      cacheDir: TEST_CACHE_DIR,
      outputDir: TEST_OUTPUT_DIR,
      registry: brokenRegistry,
      provider: "fallback",
      skipPremiumImage: false,
    },
  });

  assert.strictEqual(delivery.delivery, "text");
  assert.strictEqual(delivery.premiumImage, false);
  assert.strictEqual(textCalls, 1);
}

async function testSingleSendPhotoMessageNotDuplicate() {
  resetCacheForTests(TEST_CACHE_DIR);
  let telegramMessages = 0;
  await deliverTelegramNewsWithOptionalPhoto({
    message: makeCpiCandidate().formattedMessage,
    candidate: makeCpiCandidate(),
    sendTelegramPhoto: async () => {
      telegramMessages += 1;
    },
    sendTelegramMessage: async () => {
      telegramMessages += 1;
    },
    options: {
      forceEnabled: true,
      cacheDir: TEST_CACHE_DIR,
      outputDir: TEST_OUTPUT_DIR,
      provider: "fallback",
    },
  });
  assert.strictEqual(telegramMessages, 1);
}

async function testTempfileCleanupAfterDelivery() {
  resetCacheForTests(TEST_CACHE_DIR);
  let generatedPath = null;
  await deliverTelegramNewsWithOptionalPhoto({
    message: makeCpiCandidate().formattedMessage,
    candidate: makeCpiCandidate(),
    sendTelegramPhoto: async (_message, photoPath) => {
      generatedPath = photoPath;
      assert.ok(fs.existsSync(photoPath));
    },
    sendTelegramMessage: async () => {},
    options: {
      forceEnabled: true,
      cacheDir: TEST_CACHE_DIR,
      outputDir: TEST_OUTPUT_DIR,
      provider: "fallback",
    },
  });
  assert.ok(generatedPath);
  assert.strictEqual(fs.existsSync(generatedPath), false);
}

async function testRestartDoesNotDependOnPermanentLocalCache() {
  resetCacheForTests(TEST_CACHE_DIR);
  const freshCacheDir = path.join(__dirname, ".tmp-news-images-restart");
  resetCacheForTests(freshCacheDir);
  const result = await generatePremiumNewsImage(
    {
      eventKey: "US_NFP",
      eventName: "Non Farm Payrolls",
      country: "US",
      releaseTime: "2026-08-02T11:00:00.000Z",
    },
    {
      forceEnabled: true,
      cacheDir: freshCacheDir,
      outputDir: TEST_OUTPUT_DIR,
      provider: "fallback",
    }
  );
  assert.ok(result?.filePath);
  assert.strictEqual(result.cached, false);
}

function testCleanupTempImageFileBestEffort() {
  const tempFile = path.join(TEST_OUTPUT_DIR, "cleanup-test.png");
  fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(tempFile, Buffer.from("x"));
  cleanupTempImageFile(tempFile);
  assert.strictEqual(fs.existsSync(tempFile), false);
}

async function testAtomicPublishUsesDeliverTelegramNewsForCpi() {
  enablePublishStateForTests("8999");
  const candidate = makeCpiCandidate();
  candidate.post.sourceMessageId = "9000";
  candidate.post.sourceUrl = "https://t.me/ForexBreakingNews/9000";
  candidate.post.sourcePublishedAt = new Date(Date.now() + 120_000).toISOString();
  let deliveryMode = null;
  let dbCalls = 0;

  const result = await publishValidatedTelegramNewsCandidate(candidate, {}, {
    memoryOnly: true,
    deliverTelegramNews: async ({ message, candidate: payload }) => {
      assert.ok(message.includes("0.4%"));
      assert.strictEqual(payload.facts.canonicalEventKey, "US_CPI_MOM");
      deliveryMode = "photo";
      return { delivery: "photo", premiumImage: true, provider: "fallback" };
    },
    sendTelegramMessage: async () => {
      deliveryMode = "text";
    },
    savePublishedNewsToSupabase: async () => ({ ok: true }),
    saveNewsPostToSupabase: async () => {
      dbCalls += 1;
      return { ok: true };
    },
  });

  assert.strictEqual(result.published, true);
  assert.strictEqual(deliveryMode, "photo");
  assert.strictEqual(dbCalls, 1);
}

async function testAtomicPublishDryRunFlagsPremiumEligibility() {
  enablePublishStateForTests("8998");
  const candidate = makeCpiCandidate();
  candidate.post.sourceMessageId = "8999";
  candidate.post.sourcePublishedAt = new Date(Date.now() + 120_000).toISOString();
  const result = await publishValidatedTelegramNewsCandidate(candidate, {}, {
    dryRun: true,
    memoryOnly: true,
  });
  assert.strictEqual(result.dryRun, true);
  assert.strictEqual(result.premiumImage, true);
}

async function testOpenAiSuccessUsesAiBackgroundOverlay() {
  resetCacheForTests(TEST_CACHE_DIR);
  const fallback = createFallbackImageProvider();
  const background = await fallback.generateBackground({
    eventKey: "US_CPI_MOM",
    eventName: "US CPI",
    releaseTime: "2026-08-02T13:00:00.000Z",
  });
  const registry = createNewsImageProviderRegistry({
    providers: {
      openai: {
        name: "openai",
        generateBackground: async () => ({
          backgroundBuffer: background.backgroundBuffer,
          provider: "openai",
          prompt: "macro backdrop",
        }),
      },
    },
  });

  const result = await generatePremiumNewsImage(
    {
      eventKey: "US_CPI_MOM",
      eventName: "US CPI",
      country: "US",
      releaseTime: "2026-08-02T13:00:00.000Z",
    },
    {
      forceEnabled: true,
      cacheDir: TEST_CACHE_DIR,
      outputDir: TEST_OUTPUT_DIR,
      registry,
      provider: "openai",
    }
  );

  assert.strictEqual(result.provider, "openai");
  assert.ok(result.filePath);
  assert.ok(fs.readFileSync(result.filePath).length > 5000);
}

async function run() {
  const tests = [
    testPremiumEventSelection,
    testNonPremiumEventsRejected,
    testDisplayNames,
    testBuildContextFromRelease,
    testBuildContextFromTelegramCandidate,
    testBrandOverlayContainsOnlyAllowedIdentity,
    testFallbackProviderAndComposer,
    testCacheKeyStableForSameRelease,
    testCacheReuse,
    testGeneratePremiumImageWithFallbackProvider,
    testDisabledByDefaultUnlessForced,
    testRssGeneralStillWorks,
    testTelegramCpiUsesPremiumPhotoDelivery,
    testTelegramGoldSkipsPremiumImage,
    testOpenAiFailureUsesFallbackImage,
    testFallbackFailureTextOnlyOnce,
    testSingleSendPhotoMessageNotDuplicate,
    testTempfileCleanupAfterDelivery,
    testRestartDoesNotDependOnPermanentLocalCache,
    testCleanupTempImageFileBestEffort,
    testAtomicPublishUsesDeliverTelegramNewsForCpi,
    testAtomicPublishDryRunFlagsPremiumEligibility,
    testOpenAiSuccessUsesAiBackgroundOverlay,
  ];

  for (const testCase of tests) {
    await testCase();
  }

  console.log("NEWS_IMAGES_TESTS_PASSED", JSON.stringify({ tests: tests.length }));
}

run().catch((error) => {
  console.error("NEWS_IMAGES_TESTS_FAILED", error.message);
  process.exit(1);
});
