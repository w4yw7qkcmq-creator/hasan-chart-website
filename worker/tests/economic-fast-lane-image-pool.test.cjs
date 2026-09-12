#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..", "lib");
const {
  resolveImageCategory,
  selectEconomicFastLaneImage,
  selectPoolIndex,
  stableHash,
  isTelegramEconomicFastLaneEligible,
  resolveTelegramEconomicFastLaneImagePolicy,
  SELECTION_STATUS,
  IMAGE_MODES,
} = require(path.join(root, "news-images", "economic-image-pool"));
const { validateQualityGateV2, BLOCK_REASONS: QG_BLOCK_REASONS } = require(path.join(
  root,
  "news-intelligence/economic-editorial/quality-gate-v2"
));
const { auditPublishedRecord } = require(path.join(root, "news-intelligence/autonomy/post-publish-auditor"));
const {
  resolvePublicationImageResult,
  resetOpenAiImageCallCountForTests,
  getOpenAiImageCallCountForTests,
} = require(path.join(root, "news-images", "image-orchestrator"));
const {
  resolveNewsImagePolicy,
  IMAGE_POLICY_MODES,
} = require(path.join(root, "news-images", "image-policy"));
const {
  createNewsPublisherGateway,
  createPublicationStore,
  PUBLICATION_TYPES,
  SOURCE_TYPES,
} = require(path.join(root, "news-intelligence"));
const { resetEventImageCacheForTests } = require(path.join(root, "news-images", "event-image-cache"));
const { resetEconomicLatencyForTests } = require(path.join(root, "news-intelligence", "economic-latency-telemetry"));

const TEST_POOL_DIR = path.join(__dirname, "..", ".cache", "economic-fast-lane-pool-test");

function ensureTestPool() {
  fs.mkdirSync(TEST_POOL_DIR, { recursive: true });
  const categories = [
    "fed",
    "cpi",
    "nfp",
    "jobs",
    "pmi-ism",
    "eia",
    "ecb",
    "generic-us-economic",
    "generic-economic",
  ];
  for (const category of categories) {
    const dir = path.join(TEST_POOL_DIR, category);
    fs.mkdirSync(dir, { recursive: true });
    for (let i = 1; i <= 3; i += 1) {
      const file = path.join(dir, `0${i}.jpg`);
      if (!fs.existsSync(file)) {
        fs.writeFileSync(file, Buffer.from("fake-jpeg-test-image"));
      }
    }
  }
}

function buildTelegramEconomicPublication(eventType, overrides = {}) {
  return {
    eventType,
    eventKey: overrides.eventKey || eventType,
    country: overrides.country || "US",
    releaseDate: overrides.releaseDate || "2026-09-11T12:30:00.000Z",
    publicationType: PUBLICATION_TYPES.RELEASE,
    sourceType: SOURCE_TYPES.TELEGRAM_ECONOMIC,
    sourceId: "ForexBreakingNews",
    title: overrides.title || "قرار الفائدة الفيدرالي",
    body:
      overrides.body ||
      "🚨 قرار الفائدة الفيدرالي\nالحالي: 5.25%\nالمتوقع: 5.25%\nالسابق: 5.00%\n\nتأثير السوق: إيجابي للدولار الأمريكي.",
    destination: "both",
    sourceLink: overrides.sourceLink || `telegram:ForexBreakingNews/${overrides.messageId || "1"}`,
    importance: "HIGH",
    visualPriority: "REQUIRED",
    facts: overrides.facts || { actual: "1", forecast: "2", previous: "3" },
    metadata: {
      rawMessageId: overrides.messageId || "1",
      premiumImageContext: {
        eventKey: eventType,
        country: overrides.country || "US",
      },
      ...(overrides.metadata || {}),
    },
    ...overrides,
  };
}

async function testCategoryMapping() {
  assert.strictEqual(resolveImageCategory("US_FED_RATE_DECISION"), "fed");
  assert.strictEqual(resolveImageCategory("US_CPI_MOM"), "cpi");
  assert.strictEqual(resolveImageCategory("US_NFP"), "nfp");
  assert.strictEqual(resolveImageCategory("US_ISM_NON_MANUFACTURING_PMI"), "pmi-ism");
  assert.strictEqual(resolveImageCategory("US_EIA_CRUDE_OIL_INVENTORIES"), "eia");
  assert.strictEqual(resolveImageCategory("EZ_ECB_RATE_DECISION"), "ecb");
  assert.strictEqual(resolveImageCategory("US_UNKNOWN_EVENT_XYZ", "US"), "generic-us-economic");
}

async function testDeterministicRotation() {
  ensureTestPool();
  const first = selectEconomicFastLaneImage({
    canonicalEventId: "US_NFP",
    countryCode: "US",
    sourceMessageId: "msg-100",
    poolBaseDir: TEST_POOL_DIR,
  });
  const second = selectEconomicFastLaneImage({
    canonicalEventId: "US_NFP",
    countryCode: "US",
    sourceMessageId: "msg-200",
    poolBaseDir: TEST_POOL_DIR,
  });
  assert.strictEqual(first.status, SELECTION_STATUS.SELECTED);
  assert.strictEqual(second.status, SELECTION_STATUS.SELECTED);
  assert.notStrictEqual(first.poolIndex, second.poolIndex);
  assert.ok(first.selectionMs < 100, `expected fast selection, got ${first.selectionMs}ms`);
}

async function testMissingAssetFailOpen() {
  const missingDir = path.join(os.tmpdir(), `fast-lane-missing-${Date.now()}`);
  fs.mkdirSync(path.join(missingDir, "fed"), { recursive: true });
  const result = selectEconomicFastLaneImage({
    canonicalEventId: "US_FED_RATE_DECISION",
    poolBaseDir: missingDir,
  });
  assert.strictEqual(result.status, SELECTION_STATUS.MISSING);
}

async function testSelectionExceptionFailOpen() {
  const result = selectEconomicFastLaneImage({
    canonicalEventId: "US_FED_RATE_DECISION",
    poolBaseDir: "\0invalid",
  });
  assert.ok([SELECTION_STATUS.MISSING, SELECTION_STATUS.FAILED_OPEN].includes(result.status));
}

async function testOrchestratorUsesPrebuiltNotAi() {
  ensureTestPool();
  resetOpenAiImageCallCountForTests();
  resetEventImageCacheForTests();

  const events = [
    ["US_FED_RATE_DECISION", "fed"],
    ["US_CPI_MOM", "cpi"],
    ["US_NFP", "nfp"],
    ["US_ISM_SERVICES", "pmi-ism"],
    ["US_EIA_CRUDE_OIL_INVENTORIES", "eia"],
    ["EZ_ECB_RATE_DECISION", "ecb"],
  ];

  process.env.ECONOMIC_FAST_LANE_IMAGE_POOL_DIR = TEST_POOL_DIR;
  for (const [eventType, category] of events) {
    const resolution = await resolvePublicationImageResult(
      buildTelegramEconomicPublication(eventType, { messageId: `orch-${eventType}` })
    );
    assert.strictEqual(getOpenAiImageCallCountForTests(), 0, `AI called for ${eventType}`);
    assert.strictEqual(resolution.fastLane, true);
    assert.strictEqual(resolution.telemetry.imageMode, IMAGE_MODES.PREBUILT_FAST_LANE);
    assert.strictEqual(resolution.telemetry.prebuiltCategory, category);
    assert.ok(
      resolution.imageResult.delivery === "photo",
      `${eventType} delivery=${resolution.imageResult.delivery} status=${resolution.telemetry?.imageSelectionStatus} fastLane=${resolution.fastLane} env=${process.env.ECONOMIC_FAST_LANE_IMAGE_POOL_DIR}`
    );
    assert.strictEqual(resolution.imageResult.source, "prebuilt_pool");
  }
  delete process.env.ECONOMIC_FAST_LANE_IMAGE_POOL_DIR;
}

async function testUnknownEventGenericFallback() {
  ensureTestPool();
  process.env.ECONOMIC_FAST_LANE_IMAGE_POOL_DIR = TEST_POOL_DIR;
  resetOpenAiImageCallCountForTests();
  const withPool = await resolvePublicationImageResult(
    buildTelegramEconomicPublication("US_DURABLE_GOODS", {
      messageId: "unknown-2",
      metadata: { premiumImageContext: { eventKey: "US_DURABLE_GOODS", country: "US" } },
    })
  );
  delete process.env.ECONOMIC_FAST_LANE_IMAGE_POOL_DIR;
  assert.strictEqual(withPool.telemetry.prebuiltCategory, "generic-us-economic");
  assert.ok(["photo", "text"].includes(withPool.imageResult.delivery));
  assert.strictEqual(getOpenAiImageCallCountForTests(), 0);
  assert.strictEqual(withPool.fastLane, true);
}

async function testMissingImagePublishesTextAnyway() {
  const store = createPublicationStore({ runtimeMode: "test", forceMemory: true });
  const gateway = createNewsPublisherGateway({ store, runtimeMode: "test" });
  let textCalls = 0;
  let photoCalls = 0;
  const releaseDate = "2026-09-11T18:00:01.000Z";
  const messageId = `missing-image-${Date.now()}`;

  const result = await gateway.publish(
    {
      eventType: "US_INITIAL_JOBLESS_CLAIMS",
      eventFamily: "US_WEEKLY_LABOR_CLAIMS",
      country: "US",
      releaseDate,
      publicationType: PUBLICATION_TYPES.RELEASE,
      sourceType: SOURCE_TYPES.TELEGRAM_ECONOMIC,
      sourceId: "ForexBreakingNews",
      title: "طلبات إعانة البطالة الأمريكية",
      body: "🚨 طلبات إعانة البطالة\nالحالي: 203K\nالمتوقع: 208K\nالسابق: 206K\n\nتأثير السوق: إيجابي للدولار الأمريكي.",
      bodySource: "formatted",
      destination: "both",
      sourceLink: `telegram:ForexBreakingNews/${messageId}`,
      importance: "HIGH",
      visualPriority: "REQUIRED",
      facts: { actual: "203k", forecast: "208k", previous: "206k" },
      metadata: {
        rawMessageId: messageId,
        sourcePublishedAt: releaseDate,
        premiumImageContext: {
          eventKey: "US_INITIAL_JOBLESS_CLAIMS",
          eventName: "Initial Jobless Claims",
          country: "US",
          releaseTime: releaseDate,
        },
      },
    },
    {
      resolvePublicationImageResult,
      sendTelegramPhoto: async () => {
        photoCalls += 1;
      },
      sendTelegramMessage: async () => {
        textCalls += 1;
        return { ok: true };
      },
      saveNewsPostToSupabase: async () => ({}),
      savePublishedNewsToSupabase: async () => ({}),
      savePublishedNewsLink: () => {},
    }
  );

  assert.ok(result.telegramSent || result.partial || result.published, "must publish without blocking");
  assert.strictEqual(textCalls, 1);
  assert.strictEqual(photoCalls, 0);
}

async function testRssPathUnchanged() {
  resetOpenAiImageCallCountForTests();
  const policy = resolveNewsImagePolicy({
    sourceType: SOURCE_TYPES.RSS_GENERAL,
    publicationType: PUBLICATION_TYPES.GENERAL_NEWS,
    importance: "HIGH",
  });
  assert.strictEqual(policy.mode, IMAGE_POLICY_MODES.SOURCE_ONLY);
  assert.strictEqual(isTelegramEconomicFastLaneEligible({ sourceType: SOURCE_TYPES.RSS_GENERAL }), false);

  const resolution = await resolvePublicationImageResult({
    sourceType: SOURCE_TYPES.RSS_GENERAL,
    publicationType: PUBLICATION_TYPES.GENERAL_NEWS,
    importance: "HIGH",
    title: "Gold jumps",
    body: "Gold jumps",
  });
  assert.strictEqual(getOpenAiImageCallCountForTests(), 0);
  assert.strictEqual(resolution.imageResult.delivery, "text");
  assert.notStrictEqual(resolution.telemetry?.imageMode, IMAGE_MODES.PREBUILT_FAST_LANE);
}

async function testNonFastLanePathDoesNotUsePrebuiltPool() {
  resetOpenAiImageCallCountForTests();
  const resolution = await resolvePublicationImageResult(
    {
      sourceType: SOURCE_TYPES.TELEGRAM_GENERAL,
      publicationType: PUBLICATION_TYPES.GENERAL_NEWS,
      importance: "HIGH",
      title: "Gold surges after geopolitical tension in markets",
      body: "Gold surges after geopolitical tension in the Middle East with safe haven demand rising across major pairs.",
    },
    { skipOpenAiCall: true, forceEnabled: true }
  );
  assert.notStrictEqual(resolution.telemetry?.imageMode, IMAGE_MODES.PREBUILT_FAST_LANE);
  assert.strictEqual(resolution.fastLane, undefined);
}

async function testGuardEligibility() {
  assert.strictEqual(
    isTelegramEconomicFastLaneEligible(buildTelegramEconomicPublication("US_NFP")),
    true
  );
  assert.strictEqual(
    isTelegramEconomicFastLaneEligible({
      ...buildTelegramEconomicPublication("US_NFP"),
      sourceType: SOURCE_TYPES.RSS_GENERAL,
    }),
    false
  );
  assert.strictEqual(
    isTelegramEconomicFastLaneEligible({
      ...buildTelegramEconomicPublication("US_NFP"),
      publicationType: PUBLICATION_TYPES.GENERAL_NEWS,
    }),
    false
  );
}

async function testStableHashDeterminism() {
  const hashA = stableHash("US_NFP:msg-1");
  const hashB = stableHash("US_NFP:msg-1");
  assert.deepStrictEqual(hashA, hashB);
  assert.strictEqual(selectPoolIndex(hashA, 3), selectPoolIndex(hashB, 3));
}

function buildQualityGateFixture() {
  return {
    structured: {
      headline: "تقرير الوظائف الأمريكية NFP",
      factsBlock: "السابق: 200K\nالمتوقع: 180K\nالحالي: 190K",
      visualPriority: "REQUIRED",
    },
    body: "🚨 تقرير الوظائف الأمريكية NFP\nالحالي: 190K\nالمتوقع: 180K\nالسابق: 200K\n\nتأثير السوق: إيجابي للدولار الأمريكي.",
    structuredEvent: {
      eventType: "US_NFP",
      actual: "190K",
      forecast: "180K",
      previous: "200K",
      canonicalFacts: { actual: "190K", forecast: "180K", previous: "200K" },
    },
    telegramStructuredEconomic: true,
    imageRequired: true,
    imageResolved: false,
  };
}

async function testQualityGatePassesFastLaneWithoutImage() {
  const publication = buildTelegramEconomicPublication("US_NFP");
  const gate = validateQualityGateV2({
    ...buildQualityGateFixture(),
    publication,
  });
  assert.strictEqual(gate.ok, true, `expected pass, got ${gate.detail}`);
  const policy = resolveTelegramEconomicFastLaneImagePolicy(publication);
  assert.strictEqual(policy.imageRequired, false);
  assert.strictEqual(policy.imageBlocking, false);
}

async function testQualityGateBlocksNonFastLaneMissingImage() {
  const gate = validateQualityGateV2({
    ...buildQualityGateFixture(),
    publication: {
      sourceType: SOURCE_TYPES.TELEGRAM_GENERAL,
      publicationType: PUBLICATION_TYPES.GENERAL_NEWS,
      sourceId: "ForexNewspaper",
      eventType: "US_NFP",
    },
  });
  assert.strictEqual(gate.ok, false);
  assert.strictEqual(gate.detail, QG_BLOCK_REASONS.IMAGE_REQUIRED_MISSING);
}

async function testCentralFastLaneImagePolicy() {
  const policy = resolveTelegramEconomicFastLaneImagePolicy(buildTelegramEconomicPublication("US_CPI_MOM"));
  assert.deepStrictEqual(policy, {
    imageMode: IMAGE_MODES.PREBUILT_FAST_LANE,
    imagePreferred: true,
    imageRequired: false,
    imageBlocking: false,
  });
}

async function testSelectorThrowPublishesText() {
  resetOpenAiImageCallCountForTests();
  const store = createPublicationStore({ runtimeMode: "test", forceMemory: true });
  const gateway = createNewsPublisherGateway({ store, runtimeMode: "test" });
  let textCalls = 0;
  const messageId = `selector-throw-${Date.now()}`;

  const result = await gateway.publish(
    {
      eventType: "US_NFP",
      country: "US",
      releaseDate: "2026-09-11T19:00:01.000Z",
      publicationType: PUBLICATION_TYPES.RELEASE,
      sourceType: SOURCE_TYPES.TELEGRAM_ECONOMIC,
      sourceId: "ForexBreakingNews",
      title: "تقرير الوظائف الأمريكية NFP",
      body: "🚨 تقرير الوظائف الأمريكية NFP\nالحالي: 190K\nالمتوقع: 180K\nالسابق: 200K\n\nتأثير السوق: إيجابي للدولار الأمريكي.",
      bodySource: "formatted",
      destination: "both",
      sourceLink: `telegram:ForexBreakingNews/${messageId}`,
      importance: "HIGH",
      visualPriority: "REQUIRED",
      facts: { actual: "190K", forecast: "180K", previous: "200K" },
      metadata: { rawMessageId: messageId, premiumImageContext: { eventKey: "US_NFP", country: "US" } },
    },
    {
      resolvePublicationImageResult: async () => ({
        ok: true,
        policy: { mode: "AI_PRIMARY", prebuiltFastLane: true, allowAi: false },
        imageResult: { generationAttempted: false, delivery: "text", filePath: null, imageUrl: null },
        telemetry: {
          imageMode: IMAGE_MODES.PREBUILT_FAST_LANE,
          imageSelectionStatus: SELECTION_STATUS.PREBUILT_FAILED_OPEN,
          imageSelectionMs: 1,
          aiImageAttempted: false,
        },
        imageStatus: SELECTION_STATUS.PREBUILT_FAILED_OPEN,
        fastLane: true,
        failOpen: true,
      }),
      sendTelegramMessage: async () => {
        textCalls += 1;
        return { ok: true };
      },
      saveNewsPostToSupabase: async (payload) => {
        assert.strictEqual(payload.image_url, null);
        return {};
      },
      savePublishedNewsToSupabase: async () => ({}),
      savePublishedNewsLink: () => {},
    }
  );

  assert.ok(result.telegramSent || result.published || result.partial);
  assert.strictEqual(textCalls, 1);
}

async function testSiteLegAcceptsNullImageUrl() {
  const store = createPublicationStore({ runtimeMode: "test", forceMemory: true });
  const gateway = createNewsPublisherGateway({ store, runtimeMode: "test" });
  let savedSitePayload = null;
  const messageId = `site-null-image-${Date.now()}`;

  const result = await gateway.publish(
    {
      eventType: "US_CPI_MOM",
      country: "US",
      releaseDate: "2026-09-11T19:05:01.000Z",
      publicationType: PUBLICATION_TYPES.RELEASE,
      sourceType: SOURCE_TYPES.TELEGRAM_ECONOMIC,
      sourceId: "ForexBreakingNews",
      title: "مؤشر التضخم الأمريكي CPI",
      body: "🚨 مؤشر التضخم الأمريكي CPI\nالحالي: 0.3%\nالمتوقع: 0.2%\nالسابق: 0.2%\n\nتأثير السوق: إيجابي للدولار الأمريكي.",
      bodySource: "formatted",
      destination: "both",
      sourceLink: `telegram:ForexBreakingNews/${messageId}`,
      importance: "HIGH",
      facts: { actual: "0.3%", forecast: "0.2%", previous: "0.2%" },
      metadata: { rawMessageId: messageId, premiumImageContext: { eventKey: "US_CPI_MOM", country: "US" } },
    },
    {
      resolvePublicationImageResult,
      sendTelegramMessage: async () => ({ ok: true }),
      saveNewsPostToSupabase: async (payload) => {
        savedSitePayload = payload;
        return {};
      },
      savePublishedNewsToSupabase: async () => ({}),
      savePublishedNewsLink: () => {},
    }
  );

  assert.ok(result.siteInserted);
  assert.ok(savedSitePayload);
  assert.strictEqual(savedSitePayload.image_url, null);
  const audit = auditPublishedRecord({
    publication: { publicationType: PUBLICATION_TYPES.RELEASE, sourceId: "ForexBreakingNews" },
    publicationRecord: result.publicationRecord,
    requiredImage: false,
  });
  assert.strictEqual(audit.ok, true);
  assert.deepStrictEqual(audit.warnings, []);
}

async function testGatewayIdempotencySingleAttempt() {
  const store = createPublicationStore({ runtimeMode: "test", forceMemory: true });
  const gateway = createNewsPublisherGateway({ store, runtimeMode: "test" });
  let publishCalls = 0;
  const messageId = `idempotent-${Date.now()}`;
  const publication = {
    eventType: "US_EIA_CRUDE_OIL_INVENTORIES",
    country: "US",
    releaseDate: "2026-09-11T19:10:01.000Z",
    publicationType: PUBLICATION_TYPES.RELEASE,
    sourceType: SOURCE_TYPES.TELEGRAM_ECONOMIC,
    sourceId: "ForexBreakingNews",
    title: "مخزون النفط الخام الأمريكي",
    body: "🚨 مخزون النفط الخام\nالحالي: -2.5M\nالمتوقع: -1.0M\nالسابق: 3.0M\n\nتأثير السوق: إيجابي للدولار الأمريكي.",
    bodySource: "formatted",
    destination: "both",
    sourceLink: `telegram:ForexBreakingNews/${messageId}`,
    importance: "HIGH",
    facts: { actual: "-2.5M", forecast: "-1.0M", previous: "3.0M" },
    metadata: { rawMessageId: messageId, premiumImageContext: { eventKey: "US_EIA_CRUDE_OIL_INVENTORIES" } },
  };
  const deps = {
    resolvePublicationImageResult,
    sendTelegramMessage: async () => {
      publishCalls += 1;
      return { ok: true };
    },
    saveNewsPostToSupabase: async () => ({}),
    savePublishedNewsToSupabase: async () => ({}),
    savePublishedNewsLink: () => {},
  };

  const first = await gateway.publish(publication, deps);
  assert.ok(first.telegramSent || first.published || first.partial);
  assert.strictEqual(publishCalls, 1);

  const second = await gateway.publish(publication, deps);
  assert.strictEqual(second.blocked, true);
  assert.strictEqual(second.reason, "DUPLICATE_BLOCKED");
  assert.strictEqual(publishCalls, 1);
}

async function replayImportantEventsWithModes() {
  const events = [
    { eventType: "US_FED_RATE_DECISION", expectedCategory: "fed" },
    { eventType: "US_CPI_MOM", expectedCategory: "cpi" },
    { eventType: "US_NFP", expectedCategory: "nfp" },
    { eventType: "US_ISM_NON_MANUFACTURING_PMI", expectedCategory: "pmi-ism" },
    { eventType: "EZ_ECB_RATE_DECISION", expectedCategory: "ecb", country: "EZ" },
    { eventType: "US_EIA_CRUDE_OIL_INVENTORIES", expectedCategory: "eia" },
  ];
  const reports = [];

  ensureTestPool();
  process.env.ECONOMIC_FAST_LANE_IMAGE_POOL_DIR = path.resolve(TEST_POOL_DIR);

  for (const replay of events) {
    resetOpenAiImageCallCountForTests();
    const withArt = await resolvePublicationImageResult(
      buildTelegramEconomicPublication(replay.eventType, {
        country: replay.country || "US",
        messageId: `replay-a-${replay.eventType}`,
      })
    );
    reports.push({
      mode: "WITH_ARTWORK",
      canonicalEventId: replay.eventType,
      selectedCategory: withArt.telemetry.prebuiltCategory,
      imageSelectionStatus: withArt.telemetry.imageSelectionStatus,
      imageSelectionMs: withArt.telemetry.imageSelectionMs,
      aiImageCalls: getOpenAiImageCallCountForTests(),
      delivery: withArt.imageResult.delivery,
      finalDecision: withArt.imageResult.delivery === "photo" ? "PUBLISH_WITH_IMAGE" : "PUBLISH_TEXT_ONLY",
    });
    assert.strictEqual(withArt.telemetry.imageSelectionStatus, SELECTION_STATUS.PREBUILT_SELECTED);
    assert.ok(withArt.telemetry.imageSelectionMs < 10);
  }

  delete process.env.ECONOMIC_FAST_LANE_IMAGE_POOL_DIR;
  process.env.ECONOMIC_FAST_LANE_IMAGE_POOL_DIR = path.join(os.tmpdir(), `fast-lane-empty-${Date.now()}`);
  fs.mkdirSync(process.env.ECONOMIC_FAST_LANE_IMAGE_POOL_DIR, { recursive: true });

  for (const replay of events) {
    resetOpenAiImageCallCountForTests();
    const withoutArt = await resolvePublicationImageResult(
      buildTelegramEconomicPublication(replay.eventType, {
        country: replay.country || "US",
        messageId: `replay-b-${replay.eventType}`,
      })
    );
    reports.push({
      mode: "WITHOUT_ARTWORK",
      canonicalEventId: replay.eventType,
      selectedCategory: withoutArt.telemetry.prebuiltCategory,
      imageSelectionStatus: withoutArt.telemetry.imageSelectionStatus,
      imageSelectionMs: withoutArt.telemetry.imageSelectionMs,
      aiImageCalls: getOpenAiImageCallCountForTests(),
      delivery: withoutArt.imageResult.delivery,
      finalDecision: "PUBLISH_TEXT_ONLY",
    });
    assert.strictEqual(withoutArt.telemetry.imageSelectionStatus, SELECTION_STATUS.PREBUILT_MISSING);
    assert.strictEqual(withoutArt.imageResult.delivery, "text");
    assert.strictEqual(getOpenAiImageCallCountForTests(), 0);
    assert.ok(withoutArt.telemetry.imageSelectionMs < 10);
  }

  delete process.env.ECONOMIC_FAST_LANE_IMAGE_POOL_DIR;
  return reports;
}

async function run() {
  resetEconomicLatencyForTests();
  await testCategoryMapping();
  await testDeterministicRotation();
  await testMissingAssetFailOpen();
  await testSelectionExceptionFailOpen();
  await testOrchestratorUsesPrebuiltNotAi();
  await testUnknownEventGenericFallback();
  await testMissingImagePublishesTextAnyway();
  await testRssPathUnchanged();
  await testNonFastLanePathDoesNotUsePrebuiltPool();
  await testGuardEligibility();
  await testStableHashDeterminism();
  await testQualityGatePassesFastLaneWithoutImage();
  await testQualityGateBlocksNonFastLaneMissingImage();
  await testCentralFastLaneImagePolicy();
  await testSelectorThrowPublishesText();
  await testSiteLegAcceptsNullImageUrl();
  await testGatewayIdempotencySingleAttempt();
  const replayReports = await replayImportantEventsWithModes();

  console.log("economic-fast-lane-image-pool.test.cjs: all tests passed");
  console.log("REPLAY_REPORTS", JSON.stringify(replayReports, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
