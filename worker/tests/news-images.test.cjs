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
const {
  buildReleaseSeed,
  resolveVisualCategory,
  hashSeed,
} = require(path.join(root, "lib/news-images/fallback-visual-themes"));
const {
  buildOpenAIImagePrompt,
  assertPromptSafety,
  resolveOpenAIImageSettings,
  resolveProductionImageProviderTarget,
  resolveEmergencyImageProvider,
} = require(path.join(root, "lib/news-images/openai-prompt-builder"));
const {
  buildEditorialPromptBundle,
  resolveImageDisplayTitle,
  counts: editorialCounts,
} = require(path.join(root, "lib/news-images/editorial-intelligence"));
const {
  inspectGeneratedBackground,
  inspectRawBackgroundForTypography,
  analyzeRawZone,
  TYPOGRAPHY_REJECT_THRESHOLD,
} = require(path.join(root, "lib/news-images/background-text-guard"));
const {
  resolveAdaptiveLayout,
  scorePlacements,
} = require(path.join(root, "lib/news-images/adaptive-overlay-layout"));
const {
  resolveEditorialHeadlineTypography,
  resolveEditorialHeadlineLines,
} = require(path.join(root, "lib/news-images/editorial-headline-typography"));
const {
  assertComposerInput,
  assertSingleBrandOverlay,
  createComposedFinalMetadata,
  createRawBackgroundMetadata,
} = require(path.join(root, "lib/news-images/image-stage"));
const { resolveSafeZones } = require(path.join(root, "lib/news-images/overlay-safe-zones"));
const { composePremiumNewsImage, buildBrandOverlaySvg } = require(path.join(root, "lib/news-images/composer"));
const { createNewsImageProviderRegistry } = require(path.join(root, "lib/news-images/registry"));
const { generatePremiumNewsImage, isPremiumImagesEnabled } = require(path.join(root, "lib/news-images/index"));
const {
  deliverTelegramNewsWithOptionalPhoto,
  cleanupTempImageFile,
} = require(path.join(root, "lib/news-images/telegram-delivery"));
const { resolvePublicationImageResult } = require(path.join(root, "lib/news-images/image-orchestrator"));
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
  const typography = resolveEditorialHeadlineTypography({ context: { eventKey: "US_CPI_MOM" } });
  const layout = {
    headlineTypography: typography,
    brandCandidate: {
      anchor: { x: 64, y: 56, badgeX: 110, badgeY: 114, nameX: 180, nameY: 98, subX: 180, subY: 132 },
    },
    titleCandidate: {
      text: { x: 72, y: 560, anchor: "start" },
    },
  };
  const svg = buildBrandOverlaySvg({ eventKey: "US_CPI_MOM" }, layout);
  assert.ok(svg.includes("Economic Newsi"));
  assert.ok(svg.includes("US CPI"));
  assert.ok(svg.includes("INFLATION"));
  assert.ok(!/Previous|Forecast|Actual/i.test(svg));
  assert.ok(!/Hasan|Chart World|hasanchart|t\.me/i.test(svg));
  assert.ok(assertSingleBrandOverlay(svg).ok);
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
  assert.ok(Buffer.isBuffer(composed.buffer));
  assert.ok(composed.buffer.length > 1000);
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
  const candidate = makeCpiCandidate();
  const imageResolution = await resolvePublicationImageResult(
    {
      sourceType: "telegram_economic",
      publicationType: "RELEASE",
      eventType: "US_CPI_MOM",
      importance: "HIGH",
      title: candidate.resolvedTitle,
      body: candidate.formattedMessage,
      metadata: { candidate },
    },
    {
      forceEnabled: true,
      cacheDir: TEST_CACHE_DIR,
      outputDir: TEST_OUTPUT_DIR,
      provider: "fallback",
    }
  );
  const delivery = await deliverTelegramNewsWithOptionalPhoto({
    message: candidate.formattedMessage,
    candidate,
    imageResult: imageResolution.imageResult,
    sendTelegramPhoto: async (message, photoPath, options) => {
      photoCalls += 1;
      assert.ok(message.includes("Actual: 0.4%"));
      assert.ok(fs.existsSync(photoPath));
      assert.strictEqual(options?.skipTextFallback, true);
    },
    sendTelegramMessage: async () => {
      textCalls += 1;
    },
    options: { skipPremiumImage: true },
  });

  assert.strictEqual(delivery.delivery, "photo");
  assert.strictEqual(delivery.premiumImage, true);
  assert.strictEqual(photoCalls, 1);
  assert.strictEqual(textCalls, 0);
}

async function testTelegramGoldSkipsPremiumImage() {
  let photoCalls = 0;
  let textCalls = 0;
  const candidate = makeGoldCandidate();
  const imageResolution = await resolvePublicationImageResult(
    {
      sourceType: "telegram_general",
      publicationType: "GENERAL_NEWS",
      importance: "HIGH",
      title: candidate.resolvedTitle,
      body: candidate.formattedMessage,
      metadata: { candidate, newsValue: { score: 70 } },
    },
    {
      forceEnabled: true,
      cacheDir: TEST_CACHE_DIR,
      outputDir: TEST_OUTPUT_DIR,
      provider: "fallback",
    }
  );
  const delivery = await deliverTelegramNewsWithOptionalPhoto({
    message: candidate.formattedMessage,
    candidate,
    imageResult: imageResolution.imageResult,
    sendTelegramPhoto: async () => {
      photoCalls += 1;
    },
    sendTelegramMessage: async () => {
      textCalls += 1;
    },
    options: { skipPremiumImage: true },
  });

  assert.strictEqual(delivery.delivery, imageResolution.imageResult.delivery);
  assert.strictEqual(photoCalls, imageResolution.imageResult.delivery === "photo" ? 1 : 0);
  assert.strictEqual(textCalls, imageResolution.imageResult.delivery === "photo" ? 0 : 1);
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
  const result = await resolvePublicationImageResult(
    {
      sourceType: "telegram_economic",
      publicationType: "RELEASE",
      eventType: "US_CPI_MOM",
      importance: "HIGH",
      title: "US CPI",
      body: makeCpiCandidate().formattedMessage,
      metadata: { candidate: makeCpiCandidate() },
    },
    {
      forceEnabled: true,
      cacheDir: TEST_CACHE_DIR,
      outputDir: TEST_OUTPUT_DIR,
      registry,
      provider: "openai",
    }
  );

  assert.ok(result.imageResult?.filePath);
  assert.strictEqual(result.imageResult.provider, "fallback");
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
  const imageResolution = await resolvePublicationImageResult(
    {
      sourceType: "telegram_economic",
      publicationType: "RELEASE",
      eventType: "US_CPI_MOM",
      importance: "HIGH",
      title: candidate.resolvedTitle,
      body: candidate.formattedMessage,
      metadata: { candidate },
    },
    {
      forceEnabled: true,
      cacheDir: TEST_CACHE_DIR,
      outputDir: TEST_OUTPUT_DIR,
      registry: brokenRegistry,
      provider: "fallback",
    }
  );
  const delivery = await deliverTelegramNewsWithOptionalPhoto({
    message: candidate.formattedMessage,
    candidate,
    imageResult: imageResolution.imageResult,
    sendTelegramPhoto: async () => {
      throw new Error("should_not_send_photo");
    },
    sendTelegramMessage: async () => {
      textCalls += 1;
    },
    options: { skipPremiumImage: true },
  });

  assert.strictEqual(delivery.delivery, "text");
  assert.strictEqual(delivery.premiumImage, false);
  assert.strictEqual(textCalls, 1);
}

async function testSingleSendPhotoMessageNotDuplicate() {
  resetCacheForTests(TEST_CACHE_DIR);
  let telegramMessages = 0;
  const candidate = makeCpiCandidate();
  const imageResolution = await resolvePublicationImageResult(
    {
      sourceType: "telegram_economic",
      publicationType: "RELEASE",
      eventType: "US_CPI_MOM",
      importance: "HIGH",
      title: candidate.resolvedTitle,
      body: candidate.formattedMessage,
      metadata: { candidate },
    },
    {
      forceEnabled: true,
      cacheDir: TEST_CACHE_DIR,
      outputDir: TEST_OUTPUT_DIR,
      provider: "fallback",
    }
  );
  await deliverTelegramNewsWithOptionalPhoto({
    message: candidate.formattedMessage,
    candidate,
    imageResult: imageResolution.imageResult,
    sendTelegramPhoto: async () => {
      telegramMessages += 1;
    },
    sendTelegramMessage: async () => {
      telegramMessages += 1;
    },
    options: { skipPremiumImage: true },
  });
  assert.strictEqual(telegramMessages, 1);
}

async function testTempfileCleanupAfterDelivery() {
  resetCacheForTests(TEST_CACHE_DIR);
  let generatedPath = null;
  const candidate = makeCpiCandidate();
  const imageResolution = await resolvePublicationImageResult(
    {
      sourceType: "telegram_economic",
      publicationType: "RELEASE",
      eventType: "US_CPI_MOM",
      importance: "HIGH",
      title: candidate.resolvedTitle,
      body: candidate.formattedMessage,
      metadata: { candidate },
    },
    {
      forceEnabled: true,
      cacheDir: TEST_CACHE_DIR,
      outputDir: TEST_OUTPUT_DIR,
      provider: "fallback",
    }
  );
  await deliverTelegramNewsWithOptionalPhoto({
    message: candidate.formattedMessage,
    candidate,
    imageResult: imageResolution.imageResult,
    sendTelegramPhoto: async (_message, photoPath) => {
      generatedPath = photoPath;
      assert.ok(fs.existsSync(photoPath));
    },
    sendTelegramMessage: async () => {},
    options: { skipPremiumImage: true },
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
    forceEnabled: true,
    provider: "fallback",
    cacheDir: TEST_CACHE_DIR,
    outputDir: TEST_OUTPUT_DIR,
    sendTelegramPhoto: async (message, photoPath) => {
      assert.ok(message.includes("0.4%"));
      assert.ok(fs.existsSync(photoPath));
      deliveryMode = "photo";
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
  resetAtomicPublishForTests();
  resetPublishStateForTests();
  enablePublishStateForTests(String(Date.now()));
  const candidate = makeCpiCandidate();
  candidate.post.sourceChannel = "ForexBreakingNews";
  candidate.post.sourceMessageId = `dryrun-${Date.now()}`;
  candidate.post.sourceUrl = `https://t.me/ForexBreakingNews/${candidate.post.sourceMessageId}`;
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

async function testDifferentReleaseProducesDifferentImage() {
  resetCacheForTests(TEST_CACHE_DIR);
  const registry = createNewsImageProviderRegistry();
  const base = { eventKey: "US_CPI_MOM", eventName: "US CPI", country: "US" };
  const august = await generatePremiumNewsImage(
    { ...base, releaseTime: "2026-08-12T12:30:00.000Z" },
    { forceEnabled: true, provider: "fallback", registry, cacheDir: TEST_CACHE_DIR, outputDir: TEST_OUTPUT_DIR }
  );
  const september = await generatePremiumNewsImage(
    { ...base, releaseTime: "2026-09-11T12:30:00.000Z" },
    { forceEnabled: true, provider: "fallback", registry, cacheDir: TEST_CACHE_DIR, outputDir: TEST_OUTPUT_DIR }
  );
  const augustHash = fs.readFileSync(august.filePath).toString("base64").slice(0, 120);
  const septemberHash = fs.readFileSync(september.filePath).toString("base64").slice(0, 120);
  assert.notStrictEqual(augustHash, septemberHash);
}

async function testSameReleaseUsesCacheOnSecondCall() {
  resetCacheForTests(TEST_CACHE_DIR);
  const registry = createNewsImageProviderRegistry();
  const context = {
    eventKey: "US_CPI_MOM",
    eventName: "US CPI",
    country: "US",
    releaseTime: "2026-08-12T12:30:00.000Z",
  };
  let generationCalls = 0;
  const wrappedRegistry = createNewsImageProviderRegistry({
    providers: {
      fallback: {
        name: "fallback",
        generateBackground: async (ctx) => {
          generationCalls += 1;
          return createFallbackImageProvider().generateBackground(ctx);
        },
      },
    },
  });

  const first = await generatePremiumNewsImage(context, {
    forceEnabled: true,
    provider: "fallback",
    registry: wrappedRegistry,
    cacheDir: TEST_CACHE_DIR,
    outputDir: TEST_OUTPUT_DIR,
  });
  const second = await generatePremiumNewsImage(context, {
    forceEnabled: true,
    provider: "fallback",
    registry: wrappedRegistry,
    cacheDir: TEST_CACHE_DIR,
    outputDir: TEST_OUTPUT_DIR,
  });

  assert.strictEqual(first.cached, false);
  assert.strictEqual(second.cached, true);
  assert.strictEqual(generationCalls, 1);
  assert.strictEqual(
    fs.readFileSync(first.filePath).toString("base64"),
    fs.readFileSync(second.filePath).toString("base64")
  );
}

function testVisualCategoriesByEventType() {
  assert.strictEqual(resolveVisualCategory("US_CPI_MOM"), "inflation");
  assert.strictEqual(resolveVisualCategory("US_NFP"), "labor");
  assert.strictEqual(resolveVisualCategory("US_FED_RATE_DECISION"), "fed");
  assert.strictEqual(resolveVisualCategory("US_CORE_PCE_MOM"), "growth");
  assert.strictEqual(resolveVisualCategory("US_ISM_MANUFACTURING"), "pmi");
}

async function testFallbackDeterministicForSameRelease() {
  const provider = createFallbackImageProvider();
  const context = {
    eventKey: "US_NFP",
    eventName: "Non Farm Payrolls",
    country: "US",
    releaseTime: "2026-09-05T12:30:00.000Z",
  };
  const first = await provider.generateBackground(context);
  const second = await provider.generateBackground(context);
  assert.strictEqual(first.seed, second.seed);
  assert.strictEqual(first.visualCategory, "labor");
  assert.strictEqual(first.backgroundBuffer.toString("base64"), second.backgroundBuffer.toString("base64"));
}

function testReleaseSeedIncludesEventAndDate() {
  const seedSource = buildReleaseSeed({
    eventKey: "US_CPI_MOM",
    country: "US",
    releaseTime: "2026-08-12T12:30:00.000Z",
  });
  assert.ok(seedSource.includes("US_CPI_MOM"));
  assert.ok(seedSource.includes("2026-08-12"));
  assert.notStrictEqual(
    hashSeed(buildReleaseSeed({ eventKey: "US_CPI_MOM", country: "US", releaseTime: "2026-08-12T12:30:00.000Z" })),
    hashSeed(buildReleaseSeed({ eventKey: "US_CPI_MOM", country: "US", releaseTime: "2026-09-11T12:30:00.000Z" }))
  );
}

function testPreviewPathsExcludedFromGit() {
  const gitignore = fs.readFileSync(path.join(root, "..", ".gitignore"), "utf8");
  assert.ok(gitignore.includes(".tmp-premium-news-previews"));
  assert.ok(gitignore.includes(".tmp-openai-premium-preview"));
  assert.ok(gitignore.includes(".tmp-adaptive-layout-preview"));
  assert.ok(gitignore.includes(".tmp-final-headline-preview"));
}

function testOpenAIPromptDiffersByCategory() {
  const cpi = buildOpenAIImagePrompt({
    eventKey: "US_CPI_MOM",
    eventName: "US CPI",
    country: "US",
    releaseTime: "2026-08-12T12:30:00.000Z",
  });
  const nfp = buildOpenAIImagePrompt({
    eventKey: "US_NFP",
    eventName: "Non Farm Payrolls",
    country: "US",
    releaseTime: "2026-09-05T12:30:00.000Z",
  });
  const fomc = buildOpenAIImagePrompt({
    eventKey: "US_FED_RATE_DECISION",
    eventName: "Federal Reserve Interest Rate Decision",
    country: "US",
    releaseTime: "2026-09-17T18:00:00.000Z",
  });

  assert.strictEqual(cpi.visualCategory, "inflation");
  assert.strictEqual(nfp.visualCategory, "labor");
  assert.strictEqual(fomc.visualCategory, "fed");
  assert.ok(/inflation|supermarket|consumer goods|retail/i.test(cpi.prompt));
  assert.ok(/workplace|office|job interview|employment|hiring/i.test(nfp.prompt));
  assert.ok(/Federal Reserve Eccles Building|FOMC meeting room|Federal Reserve policy room/i.test(fomc.prompt));
  assert.notStrictEqual(cpi.prompt, nfp.prompt);
  assert.notStrictEqual(fomc.prompt, cpi.prompt);
}

function testOpenAIPromptSafetyRules() {
  const promptBundle = buildOpenAIImagePrompt({
    eventKey: "US_FED_RATE_DECISION",
    eventName: "Federal Reserve Interest Rate Decision",
    country: "US",
    releaseTime: "2026-09-17T18:00:00.000Z",
  });
  const safety = assertPromptSafety(promptBundle.prompt);
  assert.strictEqual(safety.ok, true, safety.issues.join(","));
  assert.ok(/absolutely no text|no text/i.test(promptBundle.prompt));
  assert.ok(/no logos/i.test(promptBundle.prompt));
  assert.ok(!/Bloomberg|Reuters|Previous|Forecast|Actual|Hasan|Chart World/i.test(promptBundle.prompt));
  assert.ok(!/\b\d+(?:\.\d+)?%/.test(promptBundle.prompt));
}

function testOpenAIPromptDiffersByRelease() {
  const august = buildOpenAIImagePrompt({
    eventKey: "US_CPI_MOM",
    eventName: "US CPI",
    country: "US",
    releaseTime: "2026-08-12T12:30:00.000Z",
  });
  const september = buildOpenAIImagePrompt({
    eventKey: "US_CPI_MOM",
    eventName: "US CPI",
    country: "US",
    releaseTime: "2026-09-11T12:30:00.000Z",
  });
  assert.notStrictEqual(august.prompt, september.prompt);
  assert.notStrictEqual(august.seed, september.seed);
}

function testOpenAISettingsDefaults() {
  const previous = {
    model: process.env.NEWS_IMAGE_OPENAI_MODEL,
    size: process.env.NEWS_IMAGE_OPENAI_SIZE,
    quality: process.env.NEWS_IMAGE_OPENAI_QUALITY,
  };
  delete process.env.NEWS_IMAGE_OPENAI_MODEL;
  delete process.env.NEWS_IMAGE_OPENAI_SIZE;
  delete process.env.NEWS_IMAGE_OPENAI_QUALITY;
  const settings = resolveOpenAIImageSettings();
  assert.strictEqual(settings.model, "gpt-image-1");
  assert.strictEqual(settings.size, "1536x1024");
  assert.strictEqual(settings.quality, "low");
  assert.ok(settings.providerTimeoutMs >= 20000);
  assert.ok(settings.workflowBudgetMs >= settings.providerTimeoutMs + 10000);
  assert.strictEqual(settings.timeoutMs, settings.providerTimeoutMs);
  if (previous.model) process.env.NEWS_IMAGE_OPENAI_MODEL = previous.model;
  if (previous.size) process.env.NEWS_IMAGE_OPENAI_SIZE = previous.size;
  if (previous.quality) process.env.NEWS_IMAGE_OPENAI_QUALITY = previous.quality;
}

function testProviderTargets() {
  assert.strictEqual(resolveProductionImageProviderTarget(), "openai");
  assert.strictEqual(resolveEmergencyImageProvider(), "fallback");
}

function testEditorialPowellSpeechPrimaryPerson() {
  const bundle = buildEditorialPromptBundle({
    eventKey: "US_POWELL_SPEECH",
    releaseTime: "2026-09-18T18:30:00.000Z",
  });
  assert.strictEqual(bundle.entities.person?.id, "JEROME_POWELL");
  assert.strictEqual(bundle.visualSubjects.primarySubjectType, "person");
  assert.strictEqual(bundle.validation.ok, true);
}

function testEditorialFomcInstitutionPrimary() {
  const bundle = buildEditorialPromptBundle({
    eventKey: "US_FED_RATE_DECISION",
    sourceText: "Powell said inflation progress is uneven",
    releaseTime: "2026-09-17T18:00:00.000Z",
  });
  assert.strictEqual(bundle.entities.person, null);
  assert.strictEqual(bundle.entities.institution?.id, "FEDERAL_RESERVE");
  assert.strictEqual(bundle.validation.ok, true);
}

function testEditorialLagardeAndBoj() {
  const lagarde = buildEditorialPromptBundle({ eventKey: "ECB_LAGARDE_SPEECH", releaseTime: "2026-09-11T12:45:00.000Z" });
  const boj = buildEditorialPromptBundle({ eventKey: "BOJ_RATE_DECISION", releaseTime: "2026-09-19T03:00:00.000Z" });
  assert.strictEqual(lagarde.entities.person?.id, "CHRISTINE_LAGARDE");
  assert.strictEqual(boj.entities.institution?.id, "BANK_OF_JAPAN");
  assert.ok(!/Federal Reserve Eccles Building/i.test(boj.prompt));
}

function testEditorialCpiExcludesResultNumbers() {
  const bundle = buildEditorialPromptBundle({
    eventKey: "US_CPI_MOM",
    previous: "0.2%",
    forecast: "0.3%",
    actual: "0.4%",
    releaseTime: "2026-08-12T12:30:00.000Z",
  });
  assert.ok(!/0\.2%|0\.3%|0\.4%|Previous|Forecast|Actual/i.test(bundle.prompt));
  assert.strictEqual(bundle.validation.ok, true);
}

function testEditorialCompactTitleAndNegativeSpace() {
  assert.strictEqual(resolveImageDisplayTitle({ eventKey: "US_FED_RATE_DECISION" }), "FED RATE DECISION");
  const bundle = buildEditorialPromptBundle({ eventKey: "US_NFP", releaseTime: "2026-09-05T12:30:00.000Z" });
  assert.ok(/negative space/i.test(bundle.prompt));
  assert.ok(/realistic editorial news photograph captured by a professional financial photojournalist/i.test(bundle.prompt));
  assert.ok(/Photo story:/i.test(bundle.prompt));
  assert.ok(/Photographer intent:/i.test(bundle.prompt));
}

function testPhotojournalismDirectorSinglePhotoStory() {
  const cpi = buildEditorialPromptBundle({ eventKey: "US_CPI_MOM", releaseTime: "2026-08-12T12:30:00.000Z" });
  const powell = buildEditorialPromptBundle({ eventKey: "US_POWELL_SPEECH", releaseTime: "2026-09-17T19:30:00.000Z" });

  assert.strictEqual(cpi.promptSource, "editorial-identity-director");
  assert.ok(cpi.photoStory);
  assert.ok(cpi.cameraPlan);
  assert.ok(/Moment before:/i.test(cpi.prompt));
  assert.ok(/Moment after:/i.test(cpi.prompt));
  assert.ok(/single shutter press/i.test(cpi.prompt));
  assert.ok(/no AI collage/i.test(cpi.prompt));
  assert.ok(/Documentary realism rules:/i.test(cpi.prompt));
  assert.ok(/Art direction hero subject:/i.test(cpi.prompt));
  assert.ok(/from among the press corps/i.test(powell.prompt));
  assert.strictEqual(cpi.validation.ok, true);
  assert.strictEqual(powell.validation.ok, true);
}

function testEditorialInstitutionMapping() {
  const cpi = buildEditorialPromptBundle({ eventKey: "US_CPI_MOM", releaseTime: "2026-08-12T12:30:00.000Z" });
  const coreCpi = buildEditorialPromptBundle({ eventKey: "US_CORE_CPI_MOM", releaseTime: "2026-08-12T12:30:00.000Z" });
  const nfp = buildEditorialPromptBundle({ eventKey: "US_NFP", releaseTime: "2026-09-05T12:30:00.000Z" });
  const gdp = buildEditorialPromptBundle({ eventKey: "US_GDP_QOQ", releaseTime: "2026-07-30T12:30:00.000Z" });
  const pce = buildEditorialPromptBundle({ eventKey: "US_CORE_PCE_MOM", releaseTime: "2026-08-29T12:30:00.000Z" });

  assert.strictEqual(cpi.entities.institution?.id, "US_BLS");
  assert.strictEqual(coreCpi.entities.institution?.id, "US_BLS");
  assert.strictEqual(nfp.entities.institution?.id, "US_BLS");
  assert.strictEqual(gdp.entities.institution?.id, "US_BEA");
  assert.strictEqual(pce.entities.institution?.id, "US_BEA");
  assert.strictEqual(cpi.validation.ok, true);
  assert.strictEqual(coreCpi.validation.ok, true);
  assert.strictEqual(gdp.validation.ok, true);
  assert.strictEqual(pce.validation.ok, true);
}

function testEditorialArtDirectorSingleHeroAndClutterRules() {
  const cpi = buildEditorialPromptBundle({ eventKey: "US_CPI_MOM", releaseTime: "2026-08-12T12:30:00.000Z" });
  const fed = buildEditorialPromptBundle({ eventKey: "US_FED_RATE_DECISION", releaseTime: "2026-09-17T18:00:00.000Z" });

  assert.strictEqual(cpi.promptSource, "editorial-identity-director");
  assert.ok(cpi.artDirection);
  assert.ok(cpi.visualScene);
  assert.strictEqual(cpi.artDirection.supportingSubjects.length <= 2, true);
  assert.ok(/Art direction hero subject:/i.test(cpi.prompt));
  assert.ok(/realistic editorial news photograph captured by a professional financial photojournalist/i.test(cpi.prompt));
  assert.ok(/shopping cart centered in frame|shopping cart as centered hero/i.test(cpi.prompt));
  assert.ok(!/Primary subject:/i.test(cpi.prompt));
  assert.ok(/Federal Reserve Eccles Building|FOMC meeting room|Federal Reserve policy room/i.test(fed.prompt));
  const hero = fed.artDirection?.heroSubject || "";
  assert.ok(/Federal Reserve Eccles Building|FOMC meeting room|Federal Reserve policy room/i.test(hero));
  assert.ok(!(hero.includes("Federal Reserve Eccles Building") && hero.includes("FOMC meeting room")));
}

function testEditorialConsistencyDirectorVarietyAndStyle() {
  const august = buildEditorialPromptBundle({ eventKey: "US_CPI_MOM", releaseTime: "2026-08-12T12:30:00.000Z" });
  const september = buildEditorialPromptBundle({ eventKey: "US_CPI_MOM", releaseTime: "2026-09-11T12:30:00.000Z" });
  const nfp = buildEditorialPromptBundle({ eventKey: "US_NFP", releaseTime: "2026-09-05T12:30:00.000Z" });
  const powell = buildEditorialPromptBundle({ eventKey: "US_POWELL_SPEECH", releaseTime: "2026-09-17T19:30:00.000Z" });
  const fed = buildEditorialPromptBundle({ eventKey: "US_FED_RATE_DECISION", releaseTime: "2026-09-17T18:00:00.000Z" });

  assert.strictEqual(august.promptSource, "editorial-identity-director");
  assert.notStrictEqual(august.photoStory.sceneVariantId, september.photoStory.sceneVariantId);
  assert.notStrictEqual(august.editorialConsistency.consistencyKey, september.editorialConsistency.consistencyKey);
  assert.notStrictEqual(august.prompt, september.prompt);

  assert.strictEqual(nfp.cameraPlan.cameraType, "Workplace Documentary");
  assert.strictEqual(nfp.cameraPlan.lens, "35mm");
  assert.strictEqual(powell.cameraPlan.cameraType, "Close Portrait");
  assert.strictEqual(powell.cameraPlan.lens, "85mm");
  assert.strictEqual(fed.cameraPlan.cameraType, "Wide Architectural");
  assert.strictEqual(fed.cameraPlan.lens, "35mm");
  assert.strictEqual(august.cameraPlan.cameraType, "Documentary Street / Store");
  assert.strictEqual(august.cameraPlan.lens, "50mm");

  assert.ok(august.photoStory.compositionVariantId);
  assert.ok(/Composition style:/i.test(august.prompt));
  assert.ok(/Global editorial style:/i.test(august.prompt));
  assert.ok(/Scene variant:/i.test(august.prompt));
  assert.ok(/Camera language:/i.test(powell.prompt));
  assert.ok(!/dramatic orange teal grading/i.test(august.prompt.split(" Avoid:")[0]));
  assert.strictEqual(august.validation.ok, true);
  assert.strictEqual(powell.validation.ok, true);
}

function testEditorialIdentityDirectorMatrixAndOverlay() {
  const { validateEditorialIdentity } = require(path.join(root, "lib/news-images/editorial-identity-director"));
  const { buildBrandOverlaySvg, resolveBrandSubtitle } = require(path.join(root, "lib/news-images/composer"));

  const cpi = buildEditorialPromptBundle({ eventKey: "US_CPI_MOM", releaseTime: "2026-08-12T12:30:00.000Z" });
  const fed = buildEditorialPromptBundle({ eventKey: "US_FED_RATE_DECISION", releaseTime: "2026-09-17T18:00:00.000Z" });
  const selloff = buildEditorialPromptBundle({
    eventKey: "WALL_STREET_SELLOFF",
    eventName: "Wall Street Sell-off",
    sourceText: "Wall Street sell-off hits major indices",
    releaseTime: "2026-10-01T20:00:00.000Z",
  });
  const oil = buildEditorialPromptBundle({
    eventKey: "OIL_SUPPLY_DISRUPTION",
    eventName: "Oil Supply Disruption",
    sourceText: "Oil supply disruption in energy markets",
    releaseTime: "2026-10-03T08:00:00.000Z",
  });
  const crypto = buildEditorialPromptBundle({
    eventKey: "BITCOIN_ETF_FLOWS",
    eventName: "Bitcoin ETF Flows",
    sourceText: "Bitcoin ETF institutional flows rise",
    releaseTime: "2026-10-04T14:00:00.000Z",
  });
  const hormuz = buildEditorialPromptBundle({
    eventKey: "STRAIT_OF_HORMUZ_TENSION",
    eventName: "Strait of Hormuz Tension",
    sourceText: "Strait of Hormuz tension threatens oil shipping",
    releaseTime: "2026-10-05T06:00:00.000Z",
  });
  const political = buildEditorialPromptBundle({
    eventKey: "GENERIC_POLITICAL_STATEMENT",
    eventName: "Political Campaign Speech",
    sourceText: "Domestic political campaign rally speech",
    releaseTime: "2026-10-07T18:00:00.000Z",
  });
  const august = buildEditorialPromptBundle({ eventKey: "US_CPI_MOM", releaseTime: "2026-08-12T12:30:00.000Z" });
  const september = buildEditorialPromptBundle({ eventKey: "US_CPI_MOM", releaseTime: "2026-09-11T12:30:00.000Z" });

  assert.strictEqual(cpi.promptSource, "editorial-identity-director");
  assert.strictEqual(cpi.editorialIdentity.editorialSubtitle, "Macro Data");
  assert.strictEqual(fed.editorialIdentity.editorialSubtitle, "Central Bank Watch");
  assert.strictEqual(selloff.editorialIdentity.editorialSubtitle, "Market Alert");
  assert.strictEqual(oil.editorialIdentity.editorialSubtitle, "Energy Markets");
  assert.strictEqual(crypto.editorialIdentity.editorialSubtitle, "Crypto Markets");
  assert.strictEqual(hormuz.editorialIdentity.marketAngle.hasMarketAngle, true);
  assert.strictEqual(political.editorialIdentity.marketAngle.hasMarketAngle, false);
  assert.strictEqual(political.editorialIdentity.premiumImageEligible, false);
  assert.strictEqual(political.skipped, true);
  assert.strictEqual(political.prompt, null);
  assert.strictEqual(political.promptSource, "editorial-identity-ineligible");
  assert.strictEqual(political.editorialIdentity.editorialSubtitle, null);
  assert.deepStrictEqual(political.editorialIdentity.headlineLines, []);
  assert.strictEqual(political.editorialIdentity.colorLanguage, null);
  assert.strictEqual(political.editorialIdentity.visualIntensity, null);
  assert.ok(!political.prompt || !/Macro Data/i.test(String(political.prompt)));

  assert.strictEqual(selloff.artDirection.artDirectionGroup, "SELLOFF");
  assert.notStrictEqual(selloff.photoStory.sceneVariantId, "default-a");
  assert.notStrictEqual(selloff.photoStory.sceneVariantId, "default-b");
  assert.strictEqual(selloff.cameraPlan.cameraType, "Market Floor Documentary");

  const gold = buildEditorialPromptBundle({
    eventKey: "GOLD_RALLY",
    eventName: "Gold Rally",
    sourceText: "Gold prices rally on safe haven demand",
    releaseTime: "2026-10-02T12:00:00.000Z",
  });
  const earnings = buildEditorialPromptBundle({
    eventKey: "CORPORATE_EARNINGS_MAJOR",
    eventName: "Major Corporate Earnings",
    sourceText: "Major corporate earnings beat expectations",
    releaseTime: "2026-10-06T21:00:00.000Z",
  });

  assert.strictEqual(gold.artDirection.artDirectionGroup, "GOLD");
  assert.notStrictEqual(gold.photoStory.sceneVariantId, "default-a");
  assert.strictEqual(gold.cameraPlan.cameraType, "Commodity Documentary");
  assert.strictEqual(oil.cameraPlan.cameraType, "Industrial Documentary");
  assert.strictEqual(crypto.cameraPlan.cameraType, "Institutional Technology Documentary");
  assert.strictEqual(hormuz.cameraPlan.cameraType, "Long Lens Maritime News Coverage");
  assert.strictEqual(earnings.cameraPlan.cameraType, "Corporate Financial Documentary");
  assert.strictEqual(earnings.artDirection.artDirectionGroup, "CORPORATE_EARNINGS");
  assert.notStrictEqual(earnings.photoStory.sceneVariantId, "default-a");

  const selloffA = buildEditorialPromptBundle({
    eventKey: "WALL_STREET_SELLOFF",
    eventName: "Wall Street Sell-off",
    sourceText: "Wall Street sell-off hits major indices",
    releaseTime: "2026-10-01T20:00:00.000Z",
  });
  const selloffB = buildEditorialPromptBundle({
    eventKey: "WALL_STREET_SELLOFF",
    eventName: "Wall Street Sell-off",
    sourceText: "Wall Street sell-off hits major indices",
    releaseTime: "2026-05-01T20:00:00.000Z",
  });
  assert.notStrictEqual(selloffA.photoStory.sceneVariantId, selloffB.photoStory.sceneVariantId);

  assert.ok(cpi.editorialIdentity.editorialDomain.includes("MACRO_ECONOMY"));
  assert.ok(fed.editorialIdentity.editorialDomain.includes("CENTRAL_BANKS"));
  assert.ok(selloff.editorialIdentity.editorialDomain.includes("MARKET_VOLATILITY"));
  assert.ok(/Editorial identity:/i.test(cpi.prompt));
  assert.ok(/Market context is editorial not literal/i.test(cpi.prompt));
  assert.ok(!/Official Macro Release/i.test(cpi.prompt));

  assert.notStrictEqual(august.photoStory.sceneVariantId, september.photoStory.sceneVariantId);
  assert.notStrictEqual(august.prompt, september.prompt);

  const typography = resolveEditorialHeadlineTypography({ context: { eventKey: "US_CPI_MOM" } });
  const layout = {
    headlineTypography: typography,
    brandCandidate: {
      anchor: { x: 48, y: 42, badgeX: 83, badgeY: 86, nameX: 135, nameY: 74, subX: 135, subY: 99 },
      softGradient: { x: 0, y: 0, width: 360, height: 130, opacity: 0.17 },
    },
    titleCandidate: {
      text: { x: 72, y: 540, anchor: "start" },
      softGradient: { x: 24, y: 490, width: 540, height: 170, opacity: 0.13 },
    },
  };
  const cpiSvg = buildBrandOverlaySvg({ eventKey: "US_CPI_MOM", editorialSubtitle: "Macro Data" }, layout);
  const fedSvg = buildBrandOverlaySvg({ eventKey: "US_FED_RATE_DECISION", editorialSubtitle: "Central Bank Watch" }, layout);
  assert.ok(cpiSvg.includes("Macro Data"));
  assert.ok(fedSvg.includes("Central Bank Watch"));
  assert.ok(!cpiSvg.includes("Official Macro Release"));
  assert.ok(assertSingleBrandOverlay(cpiSvg, "Macro Data").ok);
  assert.ok(assertSingleBrandOverlay(fedSvg, "Central Bank Watch").ok);
  assert.notStrictEqual(resolveBrandSubtitle({ eventKey: "US_CPI_MOM" }), resolveBrandSubtitle({ eventKey: "US_FED_RATE_DECISION" }));
  assert.notStrictEqual(cpi.editorialIdentity.headlineLines?.join(" "), cpi.editorialIdentity.editorialSubtitle);

  assert.strictEqual(validateEditorialIdentity(cpi.editorialIdentity).ok, true);
  assert.strictEqual(validateEditorialIdentity(fed.editorialIdentity).ok, true);
  assert.ok(cpi.editorialIdentity.forbiddenSubjects.some((item) => /giant dollar|symbol clutter|stacked money/i.test(item)));
}

async function testEditorialIdentityIneligibleSkipsImagePipeline() {
  const politicalContext = {
    eventKey: "GENERIC_POLITICAL_STATEMENT",
    eventName: "Political Campaign Speech",
    sourceText: "Domestic political campaign rally speech with no market linkage",
    releaseTime: "2026-10-07T18:00:00.000Z",
  };

  const bundle = buildEditorialPromptBundle(politicalContext);
  assert.strictEqual(bundle.skipped, true);
  assert.strictEqual(bundle.prompt, null);
  assert.strictEqual(bundle.editorialIdentity.editorialSubtitle, null);

  const imageResult = await generatePremiumNewsImage(politicalContext, { forceEnabled: true });
  assert.strictEqual(imageResult, null);

  let providerTouched = false;
  const registry = {
    resolveProviderName: () => {
      providerTouched = true;
      return "fallback";
    },
    getProvider: () => {
      providerTouched = true;
      return {
        generateBackground: async () => {
          throw new Error("provider_should_not_run");
        },
      };
    },
  };

  const blocked = await generatePremiumNewsImage(politicalContext, {
    forceEnabled: true,
    registry,
    cacheDir: path.join(root, ".cache", "news-images", "ineligible-gate-test"),
    outputDir: path.join(root, ".cache", "news-images", "ineligible-gate-test"),
  });
  assert.strictEqual(blocked, null);
  assert.strictEqual(providerTouched, false);
}

function testEditorialConsistencyOverlayAdjustments() {
  const { buildBrandOverlaySvg } = require(path.join(root, "lib/news-images/composer"));
  const { resolveEditorialHeadlineTypography } = require(path.join(root, "lib/news-images/editorial-headline-typography"));
  const typography = resolveEditorialHeadlineTypography({ context: { eventKey: "US_CPI_MOM" } });
  const layout = {
    headlineTypography: typography,
    brandCandidate: {
      anchor: { x: 48, y: 42, badgeX: 83, badgeY: 86, nameX: 135, nameY: 74, subX: 135, subY: 99 },
      softGradient: { x: 0, y: 0, width: 360, height: 130, opacity: 0.17 },
    },
    titleCandidate: {
      text: { x: 72, y: 540, anchor: "start" },
      softGradient: { x: 24, y: 490, width: 540, height: 170, opacity: 0.13 },
    },
  };
  const svg = buildBrandOverlaySvg({ eventKey: "US_CPI_MOM" }, layout);
  assert.ok(svg.includes('width="69" height="69"'));
  assert.ok(svg.includes('font-size="26"'));
  assert.ok(svg.includes('y="540"'));
  assert.ok(!svg.includes('width="92" height="92"'));
  assert.ok(typography.fontSize >= 54 && typography.fontSize <= 72);
  assert.ok(!/fill="#000"/.test(svg));
  assert.ok(!/fill="black"/i.test(svg));
}

function testEditorialPromptDedupe() {
  const { dedupePromptDirectives, dedupePromptSections } = require(path.join(root, "lib/news-images/editorial-intelligence/prompt-dedupe"));
  const deduped = dedupePromptDirectives([
    "subtle US dollar market context",
    "US dollar market context",
    "Federal Reserve Eccles Building exterior as primary subject",
    "Federal Reserve Eccles Building exterior",
  ]);
  assert.strictEqual(deduped.length, 2);

  const sections = dedupePromptSections({
    primary: ["Federal Reserve Eccles Building exterior as primary subject"],
    secondary: ["subtle US Treasury market context", "US Treasury market context"],
    marketHints: ["subtle US dollar market context", "subtle US Treasury bond market context without readable yields"],
    negative: ["no text", "no logos", "no text"],
  });
  assert.ok(sections.secondary.length <= 1);
  assert.ok(sections.marketHints.length <= 2);
  assert.strictEqual(sections.negative.filter((item) => item === "no text").length, 1);

  const fed = buildEditorialPromptBundle({ eventKey: "US_FED_RATE_DECISION", releaseTime: "2026-09-17T18:00:00.000Z" });
  const scene = fed.prompt.split(" Avoid:")[0];
  const usdMatches = scene.match(/US dollar market context/gi) || [];
  const treasuryMatches = scene.match(/US Treasury market context/gi) || [];
  assert.ok(usdMatches.length <= 1);
  assert.ok(treasuryMatches.length <= 1);
}

function testEditorialRegistryCounts() {
  assert.ok(editorialCounts.events >= 30);
  assert.strictEqual(editorialCounts.people, 9);
  assert.strictEqual(editorialCounts.institutions, 9);
  assert.strictEqual(editorialCounts.countries, 4);
  assert.strictEqual(editorialCounts.markets, 9);
}

async function createSyntheticBackground({ variant = "clean" } = {}) {
  const sharp = require("sharp");
  const textRows = (startY, count, rowHeight, startX, rowWidth) =>
    Array.from({ length: count }, (_, index) => {
      const y = startY + index * (rowHeight + 8);
      return Array.from({ length: Math.floor(rowWidth / 14) }, (_col, colIndex) => {
        const x = startX + colIndex * 14;
        const fill = colIndex % 2 === 0 ? "#ffffff" : "#111111";
        return `<rect x="${x}" y="${y}" width="12" height="${rowHeight}" fill="${fill}"/>`;
      }).join("");
    }).join("");

  const bands =
    variant === "title"
      ? `<g>${textRows(470, 5, 10, 40, 620)}</g>`
      : variant === "brand"
        ? `<g>${textRows(36, 4, 10, 40, 360)}</g>`
        : variant === "outside"
          ? `<g>${textRows(200, 5, 12, 120, 960)}</g>`
        : variant === "chaotic"
          ? `<g>
              ${textRows(470, 4, 10, 40, 620)}
              ${textRows(520, 4, 10, 620, 560)}
              ${textRows(530, 4, 10, 280, 640)}
              ${textRows(190, 3, 10, 40, 480)}
              ${textRows(190, 3, 10, 680, 480)}
            </g>`
          : "";

  const backgroundFill = variant === "clean" ? '<rect width="1200" height="675" fill="url(#bg)"/>' : '<rect width="1200" height="675" fill="#334"/>';
  const svg = `
    <svg width="1200" height="675" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#1f2937"/>
          <stop offset="100%" stop-color="#475569"/>
        </linearGradient>
      </defs>
      ${backgroundFill}
      ${bands}
    </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function testAdaptiveLayoutCleanBackgroundUsesAdaptivePath() {
  const background = await createSyntheticBackground({ variant: "clean" });
  const composed = await composePremiumNewsImage(
    background,
    {
      eventKey: "US_CPI_MOM",
      preferredTitlePlacement: "lower-left",
    },
    { imageMetadata: createRawBackgroundMetadata() }
  );
  assert.strictEqual(composed.layoutAction, "adaptive_layout");
  assert.ok(composed.titlePlacement);
  assert.ok(composed.brandPlacement);
  assert.ok(composed.headlineTypography.fontSize >= 54);
  assert.ok(composed.headlineTypography.fontSize <= 72);
  assert.ok(!/cover_safe_zones|buildCoverSvg|blurPlate/i.test(JSON.stringify(composed.adaptiveLayout || {})));
  assert.ok(assertSingleBrandOverlay(
    buildBrandOverlaySvg({ eventKey: "US_CPI_MOM" }, composed.adaptiveLayout)
  ).ok);
}

async function testAdaptiveLayoutTextInLowerLeftChoosesAlternatePlacement() {
  const background = await createSyntheticBackground({ variant: "title" });
  const composed = await composePremiumNewsImage(
    background,
    {
      eventKey: "US_NFP",
      preferredTitlePlacement: "lower-left",
    },
    { imageMetadata: createRawBackgroundMetadata() }
  );
  assert.notStrictEqual(composed.titlePlacement, "lower-left");
  assert.strictEqual(composed.displayTitle, "US NONFARM PAYROLLS");
  assert.ok(composed.adaptiveLayout.score > 0);
}

async function testAdaptiveLayoutAvoidsTopRightWhenFaceLikeSignalPresent() {
  const sharp = require("sharp");
  const skinRows = Array.from({ length: 4 }, (_, index) => {
    const y = 36 + index * 24;
    return `<rect x="860" y="${y}" width="220" height="18" fill="#d2a184"/>`;
  }).join("");
  const svg = `<svg width="1200" height="675" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="675" fill="#334"/>${skinRows}</svg>`;
  const background = await sharp(Buffer.from(svg)).png().toBuffer();
  const layout = await resolveAdaptiveLayout(background, {
    eventKey: "US_POWELL_SPEECH",
    primarySubjectType: "person",
  });
  assert.ok(["lower-left", "lower-right", "center-left", "center-right"].includes(layout.selectedTitlePlacement));
}

async function testOpenAiTypographyDetectedUsesFallbackWithoutRetry() {
  resetCacheForTests(TEST_CACHE_DIR);
  let openAiCalls = 0;
  let fallbackCalls = 0;
  const typographyBackground = await createSyntheticBackground({ variant: "outside" });
  const fallback = createFallbackImageProvider();
  const cleanFallback = await fallback.generateBackground({
    eventKey: "US_NFP",
    eventName: "Non Farm Payrolls",
    releaseTime: "2026-08-05T12:30:00.000Z",
  });

  const registry = createNewsImageProviderRegistry({
    providers: {
      openai: {
        name: "openai",
        generateBackground: async () => {
          openAiCalls += 1;
          return {
            backgroundBuffer: typographyBackground,
            provider: "openai",
            prompt: "macro backdrop",
          };
        },
      },
      fallback: {
        name: "fallback",
        generateBackground: async (ctx) => {
          fallbackCalls += 1;
          return cleanFallback;
        },
      },
    },
  });

  const result = await generatePremiumNewsImage(
    {
      eventKey: "US_NFP",
      eventName: "Non Farm Payrolls",
      country: "US",
      releaseTime: "2026-08-05T12:30:00.000Z",
    },
    {
      forceEnabled: true,
      provider: "openai",
      registry,
      cacheDir: TEST_CACHE_DIR,
      outputDir: TEST_OUTPUT_DIR,
    }
  );

  assert.strictEqual(openAiCalls, 1);
  assert.strictEqual(fallbackCalls, 1);
  assert.strictEqual(result.fallbackFrom, "openai");
  assert.strictEqual(result.layoutAction, "OPENAI_GENERATED_TYPOGRAPHY_REJECTED");
  assert.strictEqual(result.provider, "fallback");
}

function testComposerRejectsAlreadyComposedInput() {
  const check = assertComposerInput(createComposedFinalMetadata());
  assert.strictEqual(check.ok, false);
  assert.strictEqual(check.reason, "COMPOSER_INPUT_ALREADY_COMPOSED_REJECTED");
}

async function testComposedImagePassedAgainToComposerIsRejected() {
  const background = await createSyntheticBackground({ variant: "clean" });
  const first = await composePremiumNewsImage(
    background,
    { eventKey: "US_FED_RATE_DECISION" },
    { imageMetadata: createRawBackgroundMetadata() }
  );
  await assert.rejects(
    () =>
      composePremiumNewsImage(first.buffer, {
        eventKey: "US_FED_RATE_DECISION",
        imageMetadata: createComposedFinalMetadata(),
      }),
    (error) => error.code === "COMPOSER_INPUT_ALREADY_COMPOSED_REJECTED"
  );
}

function testEditorialHeadlineTypographyLargeUppercase() {
  const nfp = resolveEditorialHeadlineTypography({ context: { eventKey: "US_NFP" } });
  assert.deepStrictEqual(nfp.lines, ["US NONFARM", "PAYROLLS"]);
  assert.ok(nfp.fontSize >= 54);
  assert.ok(nfp.fontSize <= 72);
  assert.ok(nfp.lines.length <= 2);

  const fed = resolveEditorialHeadlineTypography({ context: { eventKey: "US_FED_RATE_DECISION" } });
  assert.deepStrictEqual(fed.lines, ["FED RATE", "DECISION"]);
}

function testRawBackgroundTypographyFixtures() {
  const clean = analyzeRawZone(new Uint8Array(1200 * 80 * 3).fill(40), 1200, 80);
  assert.ok(clean.confidence < TYPOGRAPHY_REJECT_THRESHOLD);

  const noisy = new Uint8Array(1200 * 80 * 3);
  for (let y = 0; y < 80; y += 1) {
    for (let x = 0; x < 1200; x += 1) {
      const idx = (y * 1200 + x) * 3;
      const value = x % 14 < 7 ? 240 : 20;
      noisy[idx] = value;
      noisy[idx + 1] = value;
      noisy[idx + 2] = value;
    }
  }
  const textLike = analyzeRawZone(noisy, 1200, 80);
  assert.ok(textLike.confidence >= 0.48);
}

async function testRawCleanBackgroundSingleBrandAndHeadline() {
  const background = await createSyntheticBackground({ variant: "clean" });
  const composed = await composePremiumNewsImage(
    background,
    { eventKey: "US_FED_RATE_DECISION" },
    { imageMetadata: createRawBackgroundMetadata() }
  );
  const svg = buildBrandOverlaySvg({ eventKey: "US_FED_RATE_DECISION" }, composed.adaptiveLayout);
  const brandGuard = assertSingleBrandOverlay(svg);
  assert.ok(brandGuard.ok);
  assert.ok(svg.includes("FED RATE"));
  assert.ok(svg.includes("DECISION"));
  assert.ok(!svg.includes('fill="#000"'));
  assert.ok(!/width="1200" height="245"/.test(svg));
}

function testAdaptiveLayoutBrandAndTitleCanDiffer() {
  const typography = resolveEditorialHeadlineTypography({ context: { eventKey: "ECB_RATE_DECISION" } });
  const layout = {
    brandCandidate: { anchor: { x: 64, y: 56, badgeX: 110, badgeY: 114, nameX: 180, nameY: 98, subX: 180, subY: 132 }, softGradient: { x: 0, y: 0, width: 420, height: 150, opacity: 0.28 } },
    titleCandidate: { text: { x: 1128, y: 560, anchor: "end", maxCharsPerLine: 18 }, softGradient: { x: 636, y: 490, width: 540, height: 170, opacity: 0.22 } },
    headlineTypography: typography,
  };
  const svg = buildBrandOverlaySvg({ eventKey: "ECB_RATE_DECISION" }, layout);
  assert.ok(svg.includes("Economic Newsi"));
  assert.ok(svg.includes("ECB RATE"));
  assert.ok(svg.includes("DECISION"));
  assert.ok(typography.fontSize >= 54);
  assert.ok(!svg.includes('width="1200" height="245"'));
  assert.ok(!/blurPlate|feGaussianBlur/i.test(svg));
}

function testAdaptivePromptIncludesStrongNoTextDirective() {
  const bundle = buildEditorialPromptBundle({ eventKey: "US_NFP", releaseTime: "2026-08-05T12:30:00.000Z" });
  assert.ok(/absolutely no text/i.test(bundle.prompt));
  assert.ok(/no headlines/i.test(bundle.prompt));
}

async function testNewReleaseTriggersFreshOpenAIGeneration() {
  resetCacheForTests(TEST_CACHE_DIR);
  let openAiCalls = 0;
  const registry = createNewsImageProviderRegistry({
    providers: {
      openai: {
        name: "openai",
        generateBackground: async (ctx) => {
          openAiCalls += 1;
          const fallback = createFallbackImageProvider();
          const bg = await fallback.generateBackground(ctx);
          return { ...bg, provider: "openai" };
        },
      },
    },
  });

  const base = {
    eventKey: "US_FED_RATE_DECISION",
    eventName: "Federal Reserve Interest Rate Decision",
    country: "US",
  };

  await generatePremiumNewsImage(
    { ...base, releaseTime: "2026-09-17T18:00:00.000Z" },
    { forceEnabled: true, provider: "openai", registry, cacheDir: TEST_CACHE_DIR, outputDir: TEST_OUTPUT_DIR }
  );
  await generatePremiumNewsImage(
    { ...base, releaseTime: "2026-10-29T18:00:00.000Z" },
    { forceEnabled: true, provider: "openai", registry, cacheDir: TEST_CACHE_DIR, outputDir: TEST_OUTPUT_DIR }
  );

  assert.strictEqual(openAiCalls, 2);
}

async function testSameReleaseOpenAIUsesCache() {
  resetCacheForTests(TEST_CACHE_DIR);
  let openAiCalls = 0;
  const registry = createNewsImageProviderRegistry({
    providers: {
      openai: {
        name: "openai",
        generateBackground: async (ctx) => {
          openAiCalls += 1;
          const fallback = createFallbackImageProvider();
          const bg = await fallback.generateBackground(ctx);
          return { ...bg, provider: "openai" };
        },
      },
    },
  });

  const context = {
    eventKey: "US_FED_RATE_DECISION",
    eventName: "Federal Reserve Interest Rate Decision",
    country: "US",
    releaseTime: "2026-09-17T18:00:00.000Z",
  };

  const first = await generatePremiumNewsImage(context, {
    forceEnabled: true,
    provider: "openai",
    registry,
    cacheDir: TEST_CACHE_DIR,
    outputDir: TEST_OUTPUT_DIR,
  });
  const second = await generatePremiumNewsImage(context, {
    forceEnabled: true,
    provider: "openai",
    registry,
    cacheDir: TEST_CACHE_DIR,
    outputDir: TEST_OUTPUT_DIR,
  });

  assert.strictEqual(first.cached, false);
  assert.strictEqual(second.cached, true);
  assert.strictEqual(openAiCalls, 1);
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
    testDifferentReleaseProducesDifferentImage,
    testSameReleaseUsesCacheOnSecondCall,
    testVisualCategoriesByEventType,
    testFallbackDeterministicForSameRelease,
    testReleaseSeedIncludesEventAndDate,
    testPreviewPathsExcludedFromGit,
    testOpenAIPromptDiffersByCategory,
    testOpenAIPromptSafetyRules,
    testOpenAIPromptDiffersByRelease,
    testOpenAISettingsDefaults,
    testProviderTargets,
    testEditorialPowellSpeechPrimaryPerson,
    testEditorialFomcInstitutionPrimary,
    testEditorialLagardeAndBoj,
    testEditorialCpiExcludesResultNumbers,
    testEditorialCompactTitleAndNegativeSpace,
    testPhotojournalismDirectorSinglePhotoStory,
    testEditorialInstitutionMapping,
    testEditorialArtDirectorSingleHeroAndClutterRules,
    testEditorialConsistencyDirectorVarietyAndStyle,
    testEditorialIdentityDirectorMatrixAndOverlay,
    testEditorialIdentityIneligibleSkipsImagePipeline,
    testEditorialConsistencyOverlayAdjustments,
    testEditorialPromptDedupe,
    testEditorialRegistryCounts,
    testAdaptiveLayoutCleanBackgroundUsesAdaptivePath,
    testAdaptiveLayoutTextInLowerLeftChoosesAlternatePlacement,
    testAdaptiveLayoutAvoidsTopRightWhenFaceLikeSignalPresent,
    testOpenAiTypographyDetectedUsesFallbackWithoutRetry,
    testComposerRejectsAlreadyComposedInput,
    testComposedImagePassedAgainToComposerIsRejected,
    testEditorialHeadlineTypographyLargeUppercase,
    testRawBackgroundTypographyFixtures,
    testRawCleanBackgroundSingleBrandAndHeadline,
    testAdaptiveLayoutBrandAndTitleCanDiffer,
    testAdaptivePromptIncludesStrongNoTextDirective,
    testNewReleaseTriggersFreshOpenAIGeneration,
    testSameReleaseOpenAIUsesCache,
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
