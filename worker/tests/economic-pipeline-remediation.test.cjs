#!/usr/bin/env node

const assert = require("assert");
const path = require("path");

const root = path.join(__dirname, "..", "lib");
const intelRoot = path.join(root, "news-intelligence");
const autonomyRoot = path.join(intelRoot, "autonomy");

const {
  buildCanonicalEventFromCandidate,
  createNewsPublisherGateway,
  createPublicationStore,
  PUBLICATION_TYPES,
  SOURCE_TYPES,
} = require(intelRoot);
const {
  validateNumericEconomicSourcePolicy,
  BLOCK_REASONS: SOURCE_BLOCK_REASONS,
  NUMERIC_ECONOMIC_TELEGRAM_SOURCES,
} = require(path.join(intelRoot, "source-policy"));
const { filterGeneralRssItems } = require(path.join(root, "telegram-news", "rss-filter"));
const { buildEventFingerprint, buildFingerprintBundle, buildEconomicTripleKey } = require(path.join(
  root,
  "telegram-news",
  "fingerprint"
));
const { extractLeadingEconomicNumericToken } = require(path.join(root, "economic-releases", "text-normalization"));
const { dedupeTelegramPosts } = require(path.join(root, "telegram-news", "dedupe"));
const { extractFactsFromTelegramPost } = require(path.join(root, "telegram-news", "extractor"));
const { resolvePublicationImageResult } = require(path.join(root, "news-images", "image-orchestrator"));
const {
  resetPhase3IntegrationForTests,
  resetIncidentsForTests,
  resetHeartbeatForTests,
  detectSilentFailures,
  observeCycleEnd,
  getOpenIncidents,
  INCIDENT_TYPES,
} = require(autonomyRoot);
const { getSourceHealthEngine, resetSourceHealthEngineForTests } = require(path.join(
  autonomyRoot,
  "source-health"
));
const { resetCycleFunnelForTests } = require(path.join(root, "news-ingestion", "cycle-funnel"));

const PRODUCTION_RELEASE_BUCKET = "2026-08-27T12:30";
const MSG_A_TIME = "2026-08-27T12:30:09.000Z";
const MSG_B_TIME = "2026-08-27T12:30:16.000Z";

function buildProductionPost(messageId, publishedAt, actualValue) {
  return {
    sourceChannel: "ForexBreakingNews",
    sourceMessageId: String(messageId),
    sourcePublishedAt: publishedAt,
    rawText: `Initial Jobless Claims
Previous: 206K
Forecast: 208K
Actual: ${actualValue}`,
    priority: 1,
  };
}

function buildProductionPublication(releaseDate, sourceLink, actual = "203k") {
  return {
    eventType: "US_INITIAL_JOBLESS_CLAIMS",
    eventFamily: "US_WEEKLY_LABOR_CLAIMS",
    country: "US",
    releaseDate,
    publicationType: PUBLICATION_TYPES.RELEASE,
    sourceType: SOURCE_TYPES.TELEGRAM_ECONOMIC,
    sourceId: "ForexBreakingNews",
    title: "طلبات إعانة البطالة الأمريكية",
    body: "🚨 طلبات إعانة البطالة\nالحالي: 203K\nالمتوقع: 208K\nالسابق: 206K\n\nتأثير السوق: إيجابي للدولار",
    bodySource: "formatted",
    destination: "both",
    sourceLink,
    importance: "HIGH",
    visualPriority: "REQUIRED",
    facts: { actual, forecast: "208k", previous: "206k" },
    metadata: {
      rawMessageId: sourceLink.split("/").pop(),
      sourcePublishedAt: releaseDate,
      premiumImageContext: {
        eventKey: "US_INITIAL_JOBLESS_CLAIMS",
        eventName: "Initial Jobless Claims",
        country: "US",
        releaseTime: releaseDate,
      },
    },
  };
}

function makePhotoDeps(overrides = {}) {
  return {
    sendTelegramPhoto: async () => ({ ok: true }),
    sendTelegramMessage: async () => {
      throw new Error("text-only telegram must not be used for REQUIRED economic release");
    },
    saveNewsPostToSupabase: async () => ({}),
    savePublishedNewsToSupabase: async () => ({}),
    savePublishedNewsLink: () => {},
    resolvePublicationImageResult: async (publication, deps) => ({
      ok: true,
      policy: { mode: "AI_PRIMARY" },
      imageResult: {
        generationAttempted: true,
        delivery: "photo",
        filePath: "/tmp/test-economic-release.png",
        imageUrl: "https://example.test/economic-release.png",
        source: "test",
      },
      telemetry: {},
      imageStatus: "ready",
    }),
    ...overrides,
  };
}

function testProductionDuplicateIdentity() {
  const canonicalA = buildCanonicalEventFromCandidate({
    eventType: "US_INITIAL_JOBLESS_CLAIMS",
    country: "US",
    releaseDate: MSG_A_TIME,
    actual: "203K",
    forecast: "208K",
    previous: "206K",
  });
  const canonicalB = buildCanonicalEventFromCandidate({
    eventType: "US_INITIAL_JOBLESS_CLAIMS",
    country: "US",
    releaseDate: MSG_B_TIME,
    actual: "203K - تعليق...\nقراءة...",
    forecast: "208K",
    previous: "206K",
  });

  assert.strictEqual(canonicalA.eventKey, `US:US_INITIAL_JOBLESS_CLAIMS:${PRODUCTION_RELEASE_BUCKET}`);
  assert.strictEqual(canonicalB.eventKey, canonicalA.eventKey);
  assert.strictEqual(extractLeadingEconomicNumericToken("203K - تعليق"), "203k");
  assert.strictEqual(canonicalB.actual, "203k");

  const fingerprintA = buildEventFingerprint({
    country: "US",
    canonicalEventKey: "US_INITIAL_JOBLESS_CLAIMS",
    scheduledAt: MSG_A_TIME,
  });
  const fingerprintB = buildEventFingerprint({
    country: "US",
    canonicalEventKey: "US_INITIAL_JOBLESS_CLAIMS",
    scheduledAt: MSG_B_TIME,
  });
  assert.strictEqual(fingerprintA, fingerprintB);

  const postA = buildProductionPost(42100, MSG_A_TIME, "203K");
  const postB = buildProductionPost(42101, MSG_B_TIME, "203K - تعليق...\nقراءة...");
  const factsA = extractFactsFromTelegramPost(postA);
  const factsB = extractFactsFromTelegramPost(postB);
  const tripleA = buildEconomicTripleKey({ ...factsA, scheduledAt: MSG_A_TIME });
  const tripleB = buildEconomicTripleKey({ ...factsB, scheduledAt: MSG_B_TIME });
  assert.strictEqual(tripleA, tripleB);

  const deduped = dedupeTelegramPosts([postA, postB]);
  assert.strictEqual(deduped.length, 1);
  assert.notStrictEqual(deduped[0].action, "skipped_conflict");
}

async function testProductionGatewayDuplicateBlocked() {
  const store = createPublicationStore({ runtimeMode: "test", forceMemory: true });
  const gateway = createNewsPublisherGateway({ store, runtimeMode: "test" });
  const deps = makePhotoDeps();
  let photoCalls = 0;

  const first = await gateway.publish(buildProductionPublication(MSG_A_TIME, "telegram:ForexBreakingNews/42100"), {
    ...deps,
    sendTelegramPhoto: async () => {
      photoCalls += 1;
      return { ok: true };
    },
  });
  assert.ok(first.published || first.partial || first.telegramSent);
  assert.strictEqual(first.blocked, undefined);
  assert.strictEqual(photoCalls, 1);

  const second = await gateway.publish(
    buildProductionPublication(MSG_B_TIME, "telegram:ForexBreakingNews/42101", "203K - تعليق"),
    deps
  );
  assert.strictEqual(second.blocked, true);
  assert.strictEqual(second.reason, "DUPLICATE_BLOCKED");

  const forexNewspaper = await gateway.publish(
    {
      ...buildProductionPublication(MSG_B_TIME, "telegram:ForexNewspaper/99999"),
      sourceId: "ForexNewspaper",
      sourceLink: "telegram:ForexNewspaper/99999",
    },
    deps
  );
  assert.strictEqual(forexNewspaper.blocked, true);
  assert.strictEqual(forexNewspaper.reason, "ECONOMIC_SOURCE_NOT_ALLOWED");
  assert.strictEqual(forexNewspaper.stage, "source_policy");
  assert.strictEqual(forexNewspaper.detail, "numeric_economic_channel_not_allowed");
  assert.strictEqual(photoCalls, 1);
}

async function testRequiredImageUsesTelegramPhoto() {
  const store = createPublicationStore({ runtimeMode: "test", forceMemory: true });
  const gateway = createNewsPublisherGateway({ store, runtimeMode: "test" });
  let photoCalls = 0;
  let textCalls = 0;

  const result = await gateway.publish(
    buildProductionPublication("2026-08-06T12:30:00.000Z", "telegram:ForexBreakingNews/required-photo"),
    makePhotoDeps({
      sendTelegramPhoto: async () => {
        photoCalls += 1;
        return { ok: true };
      },
      sendTelegramMessage: async () => {
        textCalls += 1;
        return { ok: true };
      },
    })
  );

  assert.ok(result.published || result.partial || result.telegramSent);
  assert.strictEqual(photoCalls, 1);
  assert.strictEqual(textCalls, 0);
}

async function testRequiredImageUnavailableBlocksPublication() {
  const store = createPublicationStore({ runtimeMode: "test", forceMemory: true });
  const gateway = createNewsPublisherGateway({ store, runtimeMode: "test" });
  let textCalls = 0;

  const result = await gateway.publish(
    buildProductionPublication("2026-08-06T12:30:01.000Z", "telegram:ForexBreakingNews/required-blocked"),
    makePhotoDeps({
      resolvePublicationImageResult: async () => ({
        ok: true,
        policy: { mode: "AI_PRIMARY" },
        imageResult: {
          generationAttempted: true,
          delivery: "text",
          filePath: null,
          imageUrl: null,
          source: "none",
        },
        telemetry: { publishedWithoutImage: true },
        imageStatus: "missing",
      }),
      sendTelegramMessage: async () => {
        textCalls += 1;
        return { ok: true };
      },
    })
  );

  assert.strictEqual(result.blocked, true);
  assert.strictEqual(result.reason, "IMAGE_REQUIRED_UNAVAILABLE");
  assert.strictEqual(textCalls, 0);
}

function testNumericEconomicSourcePolicyMatrix() {
  assert.deepStrictEqual(NUMERIC_ECONOMIC_TELEGRAM_SOURCES, ["ForexBreakingNews"]);

  const caseA = validateNumericEconomicSourcePolicy({
    eventType: "US_CPI",
    sourceType: SOURCE_TYPES.TELEGRAM_ECONOMIC,
    sourceId: "ForexBreakingNews",
    publicationType: PUBLICATION_TYPES.RELEASE,
  });
  assert.strictEqual(caseA.ok, true);

  const caseB = validateNumericEconomicSourcePolicy({
    eventType: "US_CPI",
    sourceType: SOURCE_TYPES.TELEGRAM_ECONOMIC,
    sourceId: "ForexNewspaper",
    publicationType: PUBLICATION_TYPES.RELEASE,
  });
  assert.strictEqual(caseB.ok, false);
  assert.strictEqual(caseB.reason, SOURCE_BLOCK_REASONS.ECONOMIC_SOURCE_NOT_ALLOWED);

  const caseC = validateNumericEconomicSourcePolicy({
    eventType: "US_INITIAL_JOBLESS_CLAIMS",
    sourceType: SOURCE_TYPES.TELEGRAM_ECONOMIC,
    sourceId: "ForexNewspaper",
    publicationType: PUBLICATION_TYPES.RELEASE,
  });
  assert.strictEqual(caseC.ok, false);
  assert.strictEqual(caseC.detail, "numeric_economic_channel_not_allowed");

  const caseE = validateNumericEconomicSourcePolicy({
    eventType: "US_NFP",
    sourceType: SOURCE_TYPES.RSS_GENERAL,
    sourceId: "https://rss.example/nfp",
    publicationType: PUBLICATION_TYPES.RELEASE,
  });
  assert.strictEqual(caseE.ok, false);
  assert.strictEqual(caseE.reason, SOURCE_BLOCK_REASONS.RSS_ECONOMIC_PUBLISH_FORBIDDEN);

  const rssGeneral = filterGeneralRssItems([
    { title: "Gold rises after CPI", contentSnippet: "Gold extended gains in New York trading" },
  ]);
  assert.strictEqual(rssGeneral.length, 1);
}

async function testForexNewspaperOnlyDoesNotFallbackPublish() {
  const store = createPublicationStore({ runtimeMode: "test", forceMemory: true });
  const gateway = createNewsPublisherGateway({ store, runtimeMode: "test" });
  let photoCalls = 0;

  const blocked = await gateway.publish(
    {
      ...buildProductionPublication(MSG_A_TIME, "telegram:ForexNewspaper/only-source"),
      sourceId: "ForexNewspaper",
      sourceLink: "telegram:ForexNewspaper/only-source",
    },
    makePhotoDeps({
      sendTelegramPhoto: async () => {
        photoCalls += 1;
        return { ok: true };
      },
    })
  );

  assert.strictEqual(blocked.blocked, true);
  assert.strictEqual(blocked.stage, "source_policy");
  assert.strictEqual(photoCalls, 0);
}

function resetStallHarness() {
  resetPhase3IntegrationForTests();
  resetIncidentsForTests();
  resetHeartbeatForTests();
  resetCycleFunnelForTests();
  resetSourceHealthEngineForTests();
  getSourceHealthEngine().setStartupGrace(0);
}

function testStallDetectorDoesNotFireWithoutEconomicAttempts() {
  resetStallHarness();

  for (let i = 0; i < 6; i += 1) {
    observeCycleEnd(100, {
      funnel: {
        rssEligible: 5,
        rssNew: 2,
        telegramEconomicEligible: 0,
        telegramEconomicQualityBlocked: 0,
        telegramEconomicPublished: 0,
        telegramEconomicPublicationAttempts: 0,
        telegramEconomicPublicationFailures: 0,
        publicationsSuccess: 0,
        editorialEvaluated: 0,
      },
    });
  }

  detectSilentFailures();
  assert.strictEqual(
    getOpenIncidents().some((incident) => incident.incidentType === INCIDENT_TYPES.NEWS_PUBLICATION_PIPELINE_STALL),
    false
  );
}

function testStallDetectorDoesNotFireForQualityBlockedOnly() {
  resetStallHarness();

  for (let i = 0; i < 6; i += 1) {
    observeCycleEnd(100, {
      funnel: {
        rssEligible: 0,
        rssNew: 1,
        telegramEconomicEligible: 4,
        telegramEconomicQualityBlocked: 4,
        telegramEconomicPublished: 0,
        telegramEconomicPublicationAttempts: 0,
        telegramEconomicPublicationFailures: 0,
        publicationsSuccess: 0,
        editorialEvaluated: 0,
      },
    });
  }

  detectSilentFailures();
  assert.strictEqual(
    getOpenIncidents().some((incident) => incident.incidentType === INCIDENT_TYPES.NEWS_PUBLICATION_PIPELINE_STALL),
    false
  );
}

function testStallDetectorFiresForRepeatedEconomicPublishFailures() {
  resetStallHarness();

  for (let i = 0; i < 6; i += 1) {
    observeCycleEnd(100, {
      funnel: {
        rssEligible: 0,
        rssNew: 1,
        telegramEconomicEligible: 3,
        telegramEconomicQualityBlocked: 0,
        telegramEconomicPublished: 0,
        telegramEconomicPublicationAttempts: 2,
        telegramEconomicPublicationFailures: 2,
        publicationsSuccess: 0,
        editorialEvaluated: 0,
      },
    });
  }

  detectSilentFailures();
  assert.strictEqual(
    getOpenIncidents().some((incident) => incident.incidentType === INCIDENT_TYPES.NEWS_PUBLICATION_PIPELINE_STALL),
    true
  );
}

async function run() {
  testProductionDuplicateIdentity();
  testNumericEconomicSourcePolicyMatrix();
  await testForexNewspaperOnlyDoesNotFallbackPublish();
  await testProductionGatewayDuplicateBlocked();
  await testRequiredImageUsesTelegramPhoto();
  await testRequiredImageUnavailableBlocksPublication();
  testStallDetectorDoesNotFireWithoutEconomicAttempts();
  testStallDetectorDoesNotFireForQualityBlockedOnly();
  testStallDetectorFiresForRepeatedEconomicPublishFailures();
  console.log("economic-pipeline-remediation.test.cjs: all tests passed");
}

run().catch((error) => {
  console.error("economic-pipeline-remediation.test.cjs FAIL", error);
  process.exit(1);
});
