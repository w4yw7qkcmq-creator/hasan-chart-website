#!/usr/bin/env node

const assert = require("assert");
const path = require("path");

const root = path.join(__dirname, "..", "lib");
const {
  resolveNewsImagePolicy,
  assertRssNeverUsesAi,
  IMAGE_POLICY_MODES,
} = require(path.join(root, "news-images", "image-policy"));
const {
  resolvePublicationImageResult,
  resetOpenAiImageCallCountForTests,
  getOpenAiImageCallCountForTests,
} = require(path.join(root, "news-images", "image-orchestrator"));
const { createNewsPublisherGateway, PUBLICATION_TYPES, SOURCE_TYPES } = require(path.join(
  root,
  "news-intelligence"
));
const { SOURCE_TYPES: ST, PUBLICATION_TYPES: PT } = require(path.join(root, "news-intelligence", "publication-types"));
const { auditPublishedRecord } = require(path.join(root, "news-intelligence", "autonomy", "post-publish-auditor"));

const TEST_OUTPUT_DIR = path.join(__dirname, "..", ".cache", "news-image-policy-test");
const TEST_CACHE_DIR = path.join(__dirname, "..", ".cache", "news-image-policy-cache");

function makeOpenAiRegistry() {
  const { createNewsImageProviderRegistry } = require(path.join(root, "news-images", "registry"));
  return createNewsImageProviderRegistry({
    providers: {
      openai: {
        name: "openai",
        async generateBackground() {
          const sharp = require("sharp");
          const backgroundBuffer = await sharp({
            create: { width: 1536, height: 1024, channels: 3, background: "#112233" },
          })
            .png()
            .toBuffer();
          return {
            backgroundBuffer,
            provider: "openai",
            cached: false,
            prompt: "abstract financial backdrop, no text, no logos",
          };
        },
      },
      fallback: require(path.join(root, "news-images", "fallback-image-provider")).createFallbackImageProvider(),
    },
  });
}

async function testRssPolicyNeverUsesAi() {
  const policy = resolveNewsImagePolicy({
    sourceType: ST.RSS_GENERAL,
    publicationType: PT.GENERAL_NEWS,
    importance: "HIGH",
  });
  assert.strictEqual(policy.mode, IMAGE_POLICY_MODES.SOURCE_ONLY);
  assert.strictEqual(policy.allowAi, false);
  assertRssNeverUsesAi(policy);

  resetOpenAiImageCallCountForTests();
  const resolution = await resolvePublicationImageResult(
    {
      sourceType: ST.RSS_GENERAL,
      publicationType: PT.GENERAL_NEWS,
      importance: "HIGH",
      title: "Gold jumps",
      body: "Gold jumps on safe haven demand",
    },
    { cacheDir: TEST_CACHE_DIR, outputDir: TEST_OUTPUT_DIR }
  );
  assert.strictEqual(getOpenAiImageCallCountForTests(), 0);
  assert.strictEqual(resolution.imageResult.delivery, "text");
}

async function testImportantTelegramUsesAiPrimary() {
  const policy = resolveNewsImagePolicy({
    sourceType: ST.TELEGRAM_GENERAL,
    publicationType: PT.GENERAL_NEWS,
    importance: "HIGH",
    title: "Gold surges after geopolitical tension",
    body: "Gold surges after geopolitical tension in the Middle East",
  });
  assert.strictEqual(policy.mode, IMAGE_POLICY_MODES.AI_PRIMARY);
}

async function testEconomicReleaseAiPrimaryTextOnlyOnFailure() {
  resetOpenAiImageCallCountForTests();
  const registry = createNewsImageProviderRegistryBroken();
  const resolution = await resolvePublicationImageResult(
    {
      sourceType: ST.TELEGRAM_ECONOMIC,
      publicationType: PT.RELEASE,
      eventType: "US_NFP",
      importance: "HIGH",
      title: "US Non Farm Payrolls",
      body: "US Non Farm Payrolls release",
      metadata: {
        premiumImageContext: {
          eventKey: "US_NFP",
          eventName: "Non Farm Payrolls",
          country: "US",
          releaseTime: "2026-08-06T12:30:00.000Z",
        },
      },
    },
    {
      registry,
      cacheDir: TEST_CACHE_DIR,
      outputDir: TEST_OUTPUT_DIR,
      skipOpenAiCall: false,
      forceEnabled: true,
    }
  );
  assert.strictEqual(resolution.ok, true);
  assert.ok(["photo", "text"].includes(resolution.imageResult.delivery));
}

function createNewsImageProviderRegistryBroken() {
  const { createNewsImageProviderRegistry } = require(path.join(root, "news-images", "registry"));
  return createNewsImageProviderRegistry({
    providers: {
      openai: {
        name: "openai",
        async generateBackground() {
          throw new Error("timeout while calling OpenAI");
        },
      },
      fallback: {
        name: "fallback",
        async generateBackground() {
          throw new Error("fallback_down");
        },
      },
    },
  });
}

async function testDuplicateBlockedBeforeAiInGateway() {
  resetOpenAiImageCallCountForTests();
  const gateway = createNewsPublisherGateway({ runtimeMode: "test", forceMemory: true });
  const publication = {
    eventType: "US_NFP",
    country: "US",
    releaseDate: "2026-08-06T12:30:00.000Z",
    publicationType: PT.RELEASE,
    sourceType: ST.TELEGRAM_ECONOMIC,
    sourceId: "ForexBreakingNews",
    title: "NFP",
    body: "🚨 NFP\nالحالي: 199K\nالمتوقع: 180K\nالسابق: 175K\n\nتأثير السوق: إيجابي للدولار",
    destination: "both",
    sourceLink: "telegram:ForexBreakingNews/9001",
    importance: "HIGH",
    facts: { actual: "199K", forecast: "180K", previous: "175K" },
    metadata: {
      premiumImageContext: {
        eventKey: "US_NFP",
        eventName: "Non Farm Payrolls",
        country: "US",
        releaseTime: "2026-08-06T12:30:00.000Z",
      },
    },
  };

  const deps = {
    registry: makeOpenAiRegistry(),
    cacheDir: TEST_CACHE_DIR,
    outputDir: TEST_OUTPUT_DIR,
    sendTelegramMessage: async () => ({ ok: true }),
    saveNewsPostToSupabase: async () => ({}),
    savePublishedNewsToSupabase: async () => ({}),
    savePublishedNewsLink: () => {},
  };

  const first = await gateway.publish(publication, deps);
  assert.strictEqual(first.blocked, undefined);
  assert.ok(first.published || first.partial || first.dryRun !== true);

  const callsAfterFirst = getOpenAiImageCallCountForTests();
  assert.ok(callsAfterFirst >= 0);

  const second = await gateway.publish(
    { ...publication, sourceLink: "telegram:ForexBreakingNews/9002" },
    deps
  );
  assert.strictEqual(second.blocked, true);
  assert.strictEqual(second.reason, "DUPLICATE_BLOCKED");
  assert.strictEqual(getOpenAiImageCallCountForTests(), callsAfterFirst);
}

async function testImageFailureDoesNotBlockPublication() {
  const gateway = createNewsPublisherGateway({ runtimeMode: "test", forceMemory: true });
  const publication = {
    eventType: "US_INITIAL_JOBLESS_CLAIMS",
    country: "US",
    releaseDate: "2026-08-06T12:30:00.000Z",
    publicationType: PT.RELEASE,
    sourceType: ST.TELEGRAM_ECONOMIC,
    sourceId: "ForexBreakingNews",
    title: "Jobless Claims",
    body: "🚨 Jobless Claims\nالحالي: 199K\nالمتوقع: 203K\nالسابق: 197K\n\nتأثير السوق: إيجابي للدولار",
    destination: "both",
    sourceLink: "telegram:ForexBreakingNews/jobless-1",
    importance: "HIGH",
    facts: { actual: "199K", forecast: "203K", previous: "197K" },
    metadata: {
      premiumImageContext: {
        eventKey: "US_INITIAL_JOBLESS_CLAIMS",
        eventName: "Initial Jobless Claims",
        country: "US",
        releaseTime: "2026-08-06T12:30:00.000Z",
      },
    },
  };

  const result = await gateway.publish(publication, {
    registry: createNewsImageProviderRegistryBroken(),
    cacheDir: TEST_CACHE_DIR,
    outputDir: TEST_OUTPUT_DIR,
    sendTelegramMessage: async () => ({ ok: true }),
    saveNewsPostToSupabase: async () => ({}),
    savePublishedNewsToSupabase: async () => ({}),
    savePublishedNewsLink: () => {},
  });

  assert.notStrictEqual(result.blocked, true);
  assert.ok(result.telegramSent || result.partial || result.published);
}

async function testPostPublishAuditorAcceptsTextOnlyWarning() {
  const audit = auditPublishedRecord({
    publication: {
      publicationType: "RELEASE",
      sourceId: "ForexBreakingNews",
      image: null,
      imageUrl: null,
    },
    publicationRecord: { eventKey: "US:US_NFP:2026-08-06T12:30:00.000Z" },
    requiredImage: true,
  });
  assert.strictEqual(audit.ok, true);
  assert.deepStrictEqual(audit.warnings, ["IMPORTANT_NEWS_PUBLISHED_WITHOUT_IMAGE"]);
}

async function run() {
  await testRssPolicyNeverUsesAi();
  await testImportantTelegramUsesAiPrimary();
  await testEconomicReleaseAiPrimaryTextOnlyOnFailure();
  await testDuplicateBlockedBeforeAiInGateway();
  await testImageFailureDoesNotBlockPublication();
  await testPostPublishAuditorAcceptsTextOnlyWarning();
  console.log("news-image-policy.test.cjs: all tests passed");
}

run().catch((error) => {
  console.error("news-image-policy.test.cjs FAIL", error);
  process.exit(1);
});
