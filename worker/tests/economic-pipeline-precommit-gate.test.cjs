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
  buildStableReleaseEventKey,
} = require(path.join(intelRoot, "event-normalizer"));
const {
  createInMemoryPublicationStore,
  createPublicationRecord,
  LEG_STATUS,
} = require(path.join(intelRoot, "publication-store"));
const { buildEventFingerprint, buildScheduledBucket } = require(path.join(root, "telegram-news", "fingerprint"));
const { extractFactsFromTelegramPost } = require(path.join(root, "telegram-news", "extractor"));
const { extractLeadingEconomicNumericToken } = require(path.join(root, "economic-releases", "text-normalization"));
const {
  resetPhase3IntegrationForTests,
  resetIncidentsForTests,
  resetHeartbeatForTests,
  detectSilentFailures,
  observeCycleEnd,
  getOpenIncidents,
  INCIDENT_TYPES,
  resolvePipelineStallIncidentIfRecovered,
  shouldResolvePipelineStallIncident,
  evaluatePipelineStallWindow,
} = require(autonomyRoot);
const { getSourceHealthEngine, resetSourceHealthEngineForTests } = require(path.join(autonomyRoot, "source-health"));
const { resetCycleFunnelForTests } = require(path.join(root, "news-ingestion", "cycle-funnel"));
const { ANOMALY_THRESHOLDS } = require(path.join(autonomyRoot, "config"));

const results = [];

function record(name, pass, detail = "") {
  results.push({ name, pass, detail });
  if (!pass) {
    throw new Error(`${name} FAILED${detail ? `: ${detail}` : ""}`);
  }
}

function resetStallHarness() {
  resetPhase3IntegrationForTests();
  resetIncidentsForTests();
  resetHeartbeatForTests();
  resetCycleFunnelForTests();
  resetSourceHealthEngineForTests();
  getSourceHealthEngine().setStartupGrace(0);
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
    resolvePublicationImageResult: async () => ({
      ok: true,
      policy: { mode: "AI_PRIMARY" },
      imageResult: {
        generationAttempted: true,
        delivery: "photo",
        filePath: "/tmp/precommit-economic.png",
        imageUrl: "https://example.test/precommit.png",
        source: "test",
      },
      telemetry: {},
      imageStatus: "ready",
    }),
    ...overrides,
  };
}

function buildReleasePublication({ releaseDate, sourceLink, facts, eventType = "US_INITIAL_JOBLESS_CLAIMS" }) {
  return {
    eventType,
    eventFamily: "US_WEEKLY_LABOR_CLAIMS",
    country: "US",
    releaseDate,
    publicationType: PUBLICATION_TYPES.RELEASE,
    sourceType: SOURCE_TYPES.TELEGRAM_ECONOMIC,
    sourceId: "ForexBreakingNews",
    title: "طلبات إعانة البطالة الأمريكية",
    body: `🚨 طلبات إعانة البطالة\nالحالي: ${facts.actual}\nالمتوقع: ${facts.forecast}\nالسابق: ${facts.previous}`,
    bodySource: "formatted",
    destination: "both",
    sourceLink,
    importance: "HIGH",
    visualPriority: "REQUIRED",
    facts,
    metadata: {
      rawMessageId: sourceLink.split("/").pop(),
      sourcePublishedAt: releaseDate,
    },
  };
}

function testBucketCollisionMatrix() {
  const keys = {};

  keys.a1 = buildCanonicalEventFromCandidate({
    eventType: "US_INITIAL_JOBLESS_CLAIMS",
    country: "US",
    releaseDate: "2026-08-27T12:30:09.000Z",
    actual: "203K",
    forecast: "208K",
    previous: "206K",
  }).eventKey;

  keys.a2 = buildCanonicalEventFromCandidate({
    eventType: "US_INITIAL_JOBLESS_CLAIMS",
    country: "US",
    releaseDate: "2026-08-27T12:30:16.000Z",
    actual: "203K",
    forecast: "208K",
    previous: "206K",
  }).eventKey;

  keys.b = buildCanonicalEventFromCandidate({
    eventType: "US_INITIAL_JOBLESS_CLAIMS",
    country: "US",
    releaseDate: "2026-08-27T13:00:09.000Z",
    actual: "203K",
    forecast: "208K",
    previous: "206K",
  }).eventKey;

  keys.cAug = buildStableReleaseEventKey({
    country: "US",
    eventType: "US_CPI_MOM",
    releaseDate: "2026-08-27T12:30:00.000Z",
    period: "AUG2026",
  });
  keys.cSep = buildStableReleaseEventKey({
    country: "US",
    eventType: "US_CPI_MOM",
    releaseDate: "2026-08-27T12:30:00.000Z",
    period: "SEP2026",
  });

  keys.dNfp = buildCanonicalEventFromCandidate({
    eventType: "US_NFP",
    country: "US",
    releaseDate: "2026-08-27T12:30:00.000Z",
  }).eventKey;
  keys.dClaims = buildCanonicalEventFromCandidate({
    eventType: "US_INITIAL_JOBLESS_CLAIMS",
    country: "US",
    releaseDate: "2026-08-27T12:30:00.000Z",
  }).eventKey;

  keys.eUs = buildCanonicalEventFromCandidate({
    eventType: "US_INITIAL_JOBLESS_CLAIMS",
    country: "US",
    releaseDate: "2026-08-27T12:30:00.000Z",
  }).eventKey;
  keys.eUk = buildCanonicalEventFromCandidate({
    eventType: "UK_INITIAL_JOBLESS_CLAIMS",
    country: "UK",
    releaseDate: "2026-08-27T12:30:00.000Z",
  }).eventKey;

  assert.strictEqual(keys.a1, keys.a2, "A same bucket");
  assert.notStrictEqual(keys.a1, keys.b, "B different bucket");
  assert.strictEqual(keys.cAug, "US:US_CPI_MOM:2026-08-27T12:30:AUG2026");
  assert.strictEqual(keys.cSep, "US:US_CPI_MOM:2026-08-27T12:30:SEP2026");
  assert.notStrictEqual(keys.cAug, keys.cSep, "C different period");
  assert.notStrictEqual(keys.dNfp, keys.dClaims, "D different event types");
  assert.notStrictEqual(keys.eUs, keys.eUk, "E different countries");

  record("bucket-collision-matrix", true, JSON.stringify(keys));
  return keys;
}

async function testHistoricalCompatibility() {
  const store = createInMemoryPublicationStore();
  const oldIsoKey = "US:US_INITIAL_JOBLESS_CLAIMS:2026-08-20T12:30:09.000Z";
  const oldFingerprint = buildEventFingerprint({
    country: "US",
    canonicalEventKey: "US_INITIAL_JOBLESS_CLAIMS",
    scheduledAt: "2026-08-20T12:30:09.000Z",
  });
  const oldRecord = createPublicationRecord({
    eventKey: oldIsoKey,
    publicationType: PUBLICATION_TYPES.RELEASE,
    sourceType: SOURCE_TYPES.TELEGRAM_ECONOMIC,
    sourceId: "ForexBreakingNews",
    metadata: { eventFingerprint: oldFingerprint },
    telegramLegStatus: LEG_STATUS.SUCCESS,
    siteLegStatus: LEG_STATUS.SUCCESS,
  });
  store._identities.set(`${oldIsoKey}|${PUBLICATION_TYPES.RELEASE}`, oldRecord);
  store._eventFingerprints.set(`${oldFingerprint}|${PUBLICATION_TYPES.RELEASE}`, oldRecord);

  const gateway = createNewsPublisherGateway({ store, runtimeMode: "test" });
  const futureRelease = buildReleasePublication({
    releaseDate: "2026-08-27T12:30:09.000Z",
    sourceLink: "telegram:ForexBreakingNews/future-week",
    facts: { actual: "203k", forecast: "208k", previous: "206k" },
  });
  const future = await gateway.publish(futureRelease, makePhotoDeps());
  assert.ok(future.published || future.telegramSent, "future week must publish");

  const replay = await gateway.publish(futureRelease, makePhotoDeps());
  assert.strictEqual(replay.blocked, true);
  assert.strictEqual(replay.reason, "DUPLICATE_BLOCKED");

  const replayOldBucket = buildReleasePublication({
    releaseDate: "2026-08-20T12:30:16.000Z",
    sourceLink: "telegram:ForexBreakingNews/old-week-replay",
    facts: { actual: "199k", forecast: "203k", previous: "197k" },
  });
  const oldReplay = await gateway.publish(replayOldBucket, makePhotoDeps());
  assert.strictEqual(oldReplay.blocked, true, "same historical bucket replay must block");
  assert.strictEqual(oldReplay.reason, "DUPLICATE_BLOCKED");

  record("historical-compatibility", true);
}

async function testConcurrentDuplicateRace() {
  const store = createPublicationStore({ runtimeMode: "test", forceMemory: true });
  const gateway = createNewsPublisherGateway({ store, runtimeMode: "test" });
  let photoCalls = 0;
  let siteCalls = 0;
  const pub = buildReleasePublication({
    releaseDate: "2026-08-27T12:30:09.000Z",
    sourceLink: "telegram:ForexBreakingNews/race-base",
    facts: { actual: "203k", forecast: "208k", previous: "206k" },
  });
  const deps = makePhotoDeps({
    sendTelegramPhoto: async () => {
      photoCalls += 1;
      return { ok: true };
    },
    saveNewsPostToSupabase: async () => {
      siteCalls += 1;
      return {};
    },
  });

  const attempts = await Promise.all(
    Array.from({ length: 6 }, (_, index) =>
      gateway.publish(
        {
          ...pub,
          sourceLink: `telegram:ForexBreakingNews/race-${index}`,
          metadata: { ...pub.metadata, rawMessageId: `race-${index}` },
        },
        deps
      )
    )
  );

  const published = attempts.filter((result) => result.published || result.telegramSent);
  const blocked = attempts.filter((result) => result.blocked && result.reason === "DUPLICATE_BLOCKED");
  assert.strictEqual(published.length, 1, `expected one publish, got ${published.length}`);
  assert.strictEqual(blocked.length, 5, `expected five duplicates, got ${blocked.length}`);
  assert.strictEqual(photoCalls, 1);
  assert.strictEqual(siteCalls, 1);
  record("concurrent-duplicate-race", true);
}

async function testImageAtomicity() {
  const store = createPublicationStore({ runtimeMode: "test", forceMemory: true });
  const gateway = createNewsPublisherGateway({ store, runtimeMode: "test" });
  const base = buildReleasePublication({
    releaseDate: "2026-08-06T12:30:00.000Z",
    sourceLink: "telegram:ForexBreakingNews/image-a",
    facts: { actual: "203k", forecast: "208k", previous: "206k" },
  });

  let photoCalls = 0;
  let textCalls = 0;
  let siteCalls = 0;
  const success = await gateway.publish(base, makePhotoDeps({
    sendTelegramPhoto: async () => {
      photoCalls += 1;
      return { ok: true };
    },
    saveNewsPostToSupabase: async () => {
      siteCalls += 1;
      return {};
    },
    sendTelegramMessage: async () => {
      textCalls += 1;
      return { ok: true };
    },
  }));
  assert.ok(success.telegramSent);
  assert.strictEqual(photoCalls, 1);
  assert.strictEqual(textCalls, 0);
  assert.strictEqual(siteCalls, 1);
  record("image-atomicity-success", true);

  const storeB = createPublicationStore({ runtimeMode: "test", forceMemory: true });
  const gatewayB = createNewsPublisherGateway({ store: storeB, runtimeMode: "test" });
  photoCalls = 0;
  textCalls = 0;
  siteCalls = 0;
  const fallback = await gatewayB.publish(
    {
      ...base,
      releaseDate: "2026-08-06T12:30:01.000Z",
      sourceLink: "telegram:ForexBreakingNews/image-b",
    },
    makePhotoDeps({
      resolvePublicationImageResult: async () => ({
        ok: true,
        policy: { mode: "AI_PRIMARY" },
        imageResult: {
          generationAttempted: true,
          delivery: "photo",
          filePath: "/tmp/fallback-economic.png",
          imageUrl: "https://example.test/fallback.png",
          source: "branded_fallback",
          fallbackFrom: "openai",
        },
        telemetry: { fallbackUsed: true },
        imageStatus: "ready",
      }),
      sendTelegramPhoto: async () => {
        photoCalls += 1;
        return { ok: true };
      },
      saveNewsPostToSupabase: async () => {
        siteCalls += 1;
        return {};
      },
      sendTelegramMessage: async () => {
        textCalls += 1;
        return { ok: true };
      },
    })
  );
  assert.ok(fallback.telegramSent);
  assert.strictEqual(photoCalls, 1);
  assert.strictEqual(textCalls, 0);
  assert.strictEqual(siteCalls, 1);
  record("image-atomicity-fallback-success", true);

  const storeC = createPublicationStore({ runtimeMode: "test", forceMemory: true });
  const gatewayC = createNewsPublisherGateway({ store: storeC, runtimeMode: "test" });
  photoCalls = 0;
  textCalls = 0;
  siteCalls = 0;
  const blocked = await gatewayC.publish(
    {
      ...base,
      releaseDate: "2026-08-06T12:30:02.000Z",
      sourceLink: "telegram:ForexBreakingNews/image-c",
    },
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
      sendTelegramPhoto: async () => {
        photoCalls += 1;
        return { ok: true };
      },
      sendTelegramMessage: async () => {
        textCalls += 1;
        return { ok: true };
      },
      saveNewsPostToSupabase: async () => {
        siteCalls += 1;
        return {};
      },
    })
  );
  assert.strictEqual(blocked.blocked, true);
  assert.strictEqual(blocked.reason, "IMAGE_REQUIRED_UNAVAILABLE");
  assert.strictEqual(photoCalls, 0);
  assert.strictEqual(textCalls, 0);
  assert.strictEqual(siteCalls, 0);
  record("image-atomicity-required-unavailable", true);

  const storeD = createPublicationStore({ runtimeMode: "test", forceMemory: true });
  const gatewayD = createNewsPublisherGateway({ store: storeD, runtimeMode: "test" });
  photoCalls = 0;
  textCalls = 0;
  const photoFail = await gatewayD.publish(
    {
      ...base,
      releaseDate: "2026-08-06T12:30:03.000Z",
      sourceLink: "telegram:ForexBreakingNews/image-d",
    },
    makePhotoDeps({
      sendTelegramPhoto: async () => {
        photoCalls += 1;
        throw new Error("telegram photo transport failed");
      },
      sendTelegramMessage: async () => {
        textCalls += 1;
        return { ok: true };
      },
    })
  );
  assert.strictEqual(photoFail.failed, true);
  assert.strictEqual(photoCalls, 1);
  assert.strictEqual(textCalls, 0);
  record("image-atomicity-photo-failure-no-text-fallback", true);

  const retry = await gatewayD.publish(
    {
      ...base,
      releaseDate: "2026-08-06T12:30:03.000Z",
      sourceLink: "telegram:ForexBreakingNews/image-d-retry",
    },
    makePhotoDeps()
  );
  assert.strictEqual(retry.blocked, true);
  assert.strictEqual(retry.reason, "DUPLICATE_BLOCKED");
  record("image-atomicity-retry-no-duplicate", true);
}

async function testCanonicalFirstPostPreservation() {
  const store = createPublicationStore({ runtimeMode: "test", forceMemory: true });
  const gateway = createNewsPublisherGateway({ store, runtimeMode: "test" });
  let photoAttached = false;
  const pub = buildReleasePublication({
    releaseDate: "2026-08-27T12:30:09.000Z",
    sourceLink: "telegram:ForexBreakingNews/42100",
    facts: { actual: "203k", forecast: "208k", previous: "206k" },
  });
  const result = await gateway.publish(pub, makePhotoDeps({
    sendTelegramPhoto: async (_body, photoPath) => {
      photoAttached = Boolean(photoPath);
      return { ok: true };
    },
  }));

  assert.ok(result.published || result.telegramSent);
  assert.strictEqual(result.canonical.actual, "203k");
  assert.strictEqual(result.canonical.forecast, "208k");
  assert.strictEqual(result.canonical.previous, "206k");
  assert.strictEqual(result.canonical.eventKey, "US:US_INITIAL_JOBLESS_CLAIMS:2026-08-27T12:30");
  assert.strictEqual(pub.sourceType, SOURCE_TYPES.TELEGRAM_ECONOMIC);
  assert.strictEqual(pub.sourceId, "ForexBreakingNews");
  assert.ok(photoAttached);
  record("canonical-first-post-preservation", true);
}

function testPollutionExtractorAndDuplicateReplay() {
  const polluted = extractFactsFromTelegramPost({
    sourceChannel: "ForexBreakingNews",
    sourceMessageId: "42101",
    sourcePublishedAt: "2026-08-27T12:30:16.000Z",
    rawText: `Initial Jobless Claims
Previous: 206K
Forecast: 208K
Actual: 203K - تعليق...
قراءة إضافية 999K`,
  });

  assert.strictEqual(extractLeadingEconomicNumericToken(polluted.actual), "203k");
  assert.strictEqual(extractLeadingEconomicNumericToken(polluted.forecast), "208k");
  assert.strictEqual(extractLeadingEconomicNumericToken(polluted.previous), "206k");
  record("pollution-extractor", true);
}

async function testPollutionDuplicateReplayTogether() {
  const store = createPublicationStore({ runtimeMode: "test", forceMemory: true });
  const gateway = createNewsPublisherGateway({ store, runtimeMode: "test" });
  const facts = { actual: "203k", forecast: "208k", previous: "206k" };
  const first = await gateway.publish(
    buildReleasePublication({
      releaseDate: "2026-08-27T12:30:09.000Z",
      sourceLink: "telegram:ForexBreakingNews/42100",
      facts,
    }),
    makePhotoDeps()
  );
  const second = await gateway.publish(
    buildReleasePublication({
      releaseDate: "2026-08-27T12:30:16.000Z",
      sourceLink: "telegram:ForexBreakingNews/42101",
      facts: { actual: "203k", forecast: "208k", previous: "206k" },
    }),
    makePhotoDeps()
  );
  assert.ok(first.published || first.telegramSent);
  assert.strictEqual(second.blocked, true);
  assert.strictEqual(second.reason, "DUPLICATE_BLOCKED");
  record("pollution-a-plus-b-single-publication", true);
}

function testStallDetectorSafetyMatrix() {
  resetStallHarness();

  for (let i = 0; i < 6; i += 1) {
    observeCycleEnd(100, {
      funnel: {
        rssEligible: 8,
        rssPublished: 3,
        publicationsSuccess: 3,
        telegramEconomicEligible: 0,
        telegramEconomicQualityBlocked: 0,
        telegramEconomicPublished: 0,
        telegramEconomicPublicationAttempts: 0,
        telegramEconomicPublicationFailures: 0,
      },
    });
  }
  detectSilentFailures();
  assert.strictEqual(
    getOpenIncidents().some((i) => i.incidentType === INCIDENT_TYPES.NEWS_PUBLICATION_PIPELINE_STALL),
    false
  );
  record("stall-rss-only-no-high", true);

  resetStallHarness();
  for (let i = 0; i < 6; i += 1) {
    observeCycleEnd(100, {
      funnel: {
        rssEligible: 0,
        publicationsSuccess: 0,
        telegramEconomicEligible: 0,
        telegramEconomicQualityBlocked: 0,
        telegramEconomicPublished: 0,
        telegramEconomicPublicationAttempts: 0,
        telegramEconomicPublicationFailures: 0,
      },
    });
  }
  detectSilentFailures();
  assert.strictEqual(getOpenIncidents().length, 0);
  record("stall-no-economic-idle", true);

  resetStallHarness();
  for (let i = 0; i < 6; i += 1) {
    observeCycleEnd(100, {
      funnel: {
        rssEligible: 0,
        publicationsSuccess: 0,
        telegramEconomicEligible: 5,
        telegramEconomicQualityBlocked: 5,
        telegramEconomicPublished: 0,
        telegramEconomicPublicationAttempts: 0,
        telegramEconomicPublicationFailures: 0,
      },
    });
  }
  detectSilentFailures();
  assert.strictEqual(
    getOpenIncidents().some((i) => i.incidentType === INCIDENT_TYPES.NEWS_PUBLICATION_PIPELINE_STALL),
    false
  );
  record("stall-quality-blocked-no-high", true);

  resetStallHarness();
  for (let i = 0; i < 6; i += 1) {
    observeCycleEnd(100, {
      funnel: {
        rssEligible: 0,
        publicationsSuccess: 0,
        telegramEconomicEligible: 3,
        telegramEconomicQualityBlocked: 0,
        telegramEconomicPublished: 0,
        telegramEconomicPublicationAttempts: 2,
        telegramEconomicPublicationFailures: 2,
      },
    });
  }
  detectSilentFailures();
  assert.strictEqual(
    getOpenIncidents().some((i) => i.incidentType === INCIDENT_TYPES.NEWS_PUBLICATION_PIPELINE_STALL),
    true
  );
  record("stall-economic-failures-high", true);

  resetStallHarness();
  const failureWindow = [];
  for (let i = 0; i < 6; i += 1) {
    failureWindow.push({
      economicEligible: 3,
      economicPublished: 0,
      economicPublicationAttempts: 2,
      economicPublicationFailures: 2,
      published: 0,
      eligible: 0,
      newObserved: 1,
      at: Date.now(),
    });
  }
  assert.strictEqual(evaluatePipelineStallWindow(failureWindow).active, true);
  failureWindow.push({
    economicEligible: 3,
    economicPublished: 0,
    economicPublicationAttempts: 2,
    economicPublicationFailures: 2,
    published: 8,
    eligible: 10,
    newObserved: 2,
    at: Date.now(),
  });
  failureWindow.push({
    economicEligible: 3,
    economicPublished: 0,
    economicPublicationAttempts: 2,
    economicPublicationFailures: 2,
    published: 8,
    eligible: 10,
    newObserved: 2,
    at: Date.now(),
  });
  failureWindow.push({
    economicEligible: 3,
    economicPublished: 0,
    economicPublicationAttempts: 2,
    economicPublicationFailures: 2,
    published: 8,
    eligible: 10,
    newObserved: 2,
    at: Date.now(),
  });
  const resolveDecision = shouldResolvePipelineStallIncident(failureWindow, {
    lastRssPollAt: Date.now(),
    lastTelegramPollAt: Date.now(),
  });
  assert.strictEqual(resolveDecision.shouldResolve, false, "RSS-only success must not resolve active economic failure window");
  record("stall-rss-success-does-not-resolve-economic-failure", true);
}

async function testLegacyCompatibilityMatrix() {
  const {
    legacyEventKeyMatchesReleaseBucket,
    buildReleaseBucketIdentity,
    releaseBucketIdentitiesMatch,
  } = require(path.join(intelRoot, "release-identity-compat"));

  const target1230 = buildReleaseBucketIdentity({
    country: "US",
    eventType: "US_INITIAL_JOBLESS_CLAIMS",
    releaseDate: "2026-08-27T12:30:09.000Z",
  });

  assert.strictEqual(
    legacyEventKeyMatchesReleaseBucket("US:US_INITIAL_JOBLESS_CLAIMS:2026-08-27T12:30:09.000Z", target1230),
    true,
    "A"
  );
  assert.strictEqual(
    legacyEventKeyMatchesReleaseBucket("US:US_INITIAL_JOBLESS_CLAIMS:2026-08-27T12:30:59.000Z", target1230),
    true,
    "B"
  );

  const target1300 = buildReleaseBucketIdentity({
    country: "US",
    eventType: "US_INITIAL_JOBLESS_CLAIMS",
    releaseDate: "2026-08-27T13:00:09.000Z",
  });
  assert.strictEqual(
    legacyEventKeyMatchesReleaseBucket("US:US_INITIAL_JOBLESS_CLAIMS:2026-08-27T12:59:59.000Z", target1300),
    false,
    "C"
  );

  const prevWeek = buildReleaseBucketIdentity({
    country: "US",
    eventType: "US_INITIAL_JOBLESS_CLAIMS",
    releaseDate: "2026-08-20T12:30:09.000Z",
  });
  assert.strictEqual(releaseBucketIdentitiesMatch(target1230, prevWeek), false, "D");

  const cpiAug = buildReleaseBucketIdentity({
    country: "US",
    eventType: "US_CPI_MOM",
    releaseDate: "2026-08-27T12:30:00.000Z",
    period: "AUG2026",
  });
  const cpiSep = buildReleaseBucketIdentity({
    country: "US",
    eventType: "US_CPI_MOM",
    releaseDate: "2026-08-27T12:30:00.000Z",
    period: "SEP2026",
  });
  assert.strictEqual(releaseBucketIdentitiesMatch(cpiAug, cpiSep), false, "E");

  const nfp = buildReleaseBucketIdentity({
    country: "US",
    eventType: "US_NFP",
    releaseDate: "2026-08-27T12:30:00.000Z",
  });
  assert.strictEqual(releaseBucketIdentitiesMatch(target1230, nfp), false, "F");

  const uk = buildReleaseBucketIdentity({
    country: "UK",
    eventType: "UK_GDP_QOQ",
    releaseDate: "2026-08-27T12:30:00.000Z",
  });
  assert.strictEqual(releaseBucketIdentitiesMatch(target1230, uk), false, "G");

  record("legacy-matrix-a-g", true);
}

async function testLegacyIsoRowWithoutFingerprint() {
  const store = createInMemoryPublicationStore();
  const oldIsoKey = "US:US_INITIAL_JOBLESS_CLAIMS:2026-08-27T12:30:09.000Z";
  const oldRecord = createPublicationRecord({
    eventKey: oldIsoKey,
    publicationType: PUBLICATION_TYPES.RELEASE,
    metadata: {},
    telegramLegStatus: LEG_STATUS.SUCCESS,
    siteLegStatus: LEG_STATUS.SUCCESS,
  });
  store._identities.set(`${oldIsoKey}|${PUBLICATION_TYPES.RELEASE}`, oldRecord);

  const gateway = createNewsPublisherGateway({ store, runtimeMode: "test" });
  const replay = await gateway.publish(
    buildReleasePublication({
      releaseDate: "2026-08-27T12:30:16.000Z",
      sourceLink: "telegram:ForexBreakingNews/legacy-gap",
      facts: { actual: "203k", forecast: "208k", previous: "206k" },
    }),
    makePhotoDeps()
  );

  assert.strictEqual(replay.blocked, true);
  assert.strictEqual(replay.reason, "DUPLICATE_BLOCKED");
  record("legacy-matrix-h", true);
}

async function testLegacyIsoRowWithFingerprintBlocksReplay() {
  const store = createInMemoryPublicationStore();
  const { buildEventFingerprint } = require(path.join(root, "telegram-news", "fingerprint"));
  const oldIsoKey = "US:US_INITIAL_JOBLESS_CLAIMS:2026-08-27T12:30:09.000Z";
  const fingerprint = buildEventFingerprint({
    country: "US",
    canonicalEventKey: "US_INITIAL_JOBLESS_CLAIMS",
    scheduledAt: "2026-08-27T12:30:09.000Z",
  });
  const oldRecord = createPublicationRecord({
    eventKey: oldIsoKey,
    publicationType: PUBLICATION_TYPES.RELEASE,
    metadata: { eventFingerprint: fingerprint },
    telegramLegStatus: LEG_STATUS.SUCCESS,
    siteLegStatus: LEG_STATUS.SUCCESS,
  });
  store._identities.set(`${oldIsoKey}|${PUBLICATION_TYPES.RELEASE}`, oldRecord);
  store._eventFingerprints.set(`${fingerprint}|${PUBLICATION_TYPES.RELEASE}`, oldRecord);

  const gateway = createNewsPublisherGateway({ store, runtimeMode: "test" });
  const replay = await gateway.publish(
    buildReleasePublication({
      releaseDate: "2026-08-27T12:30:16.000Z",
      sourceLink: "telegram:ForexBreakingNews/legacy-fp",
      facts: { actual: "203k", forecast: "208k", previous: "206k" },
    }),
    makePhotoDeps()
  );

  assert.strictEqual(replay.blocked, true);
  assert.strictEqual(replay.reason, "DUPLICATE_BLOCKED");
  record("legacy-matrix-i", true);
}

async function run() {
  const bucketKeys = testBucketCollisionMatrix();
  await testLegacyCompatibilityMatrix();
  await testHistoricalCompatibility();
  await testLegacyIsoRowWithoutFingerprint();
  await testLegacyIsoRowWithFingerprintBlocksReplay();
  await testConcurrentDuplicateRace();
  await testImageAtomicity();
  await testCanonicalFirstPostPreservation();
  testPollutionExtractorAndDuplicateReplay();
  await testPollutionDuplicateReplayTogether();
  testStallDetectorSafetyMatrix();

  console.log("PRE_COMMIT_GATE_RESULTS_START");
  console.log(JSON.stringify({ bucketKeys, results }, null, 2));
  console.log("PRE_COMMIT_GATE_RESULTS_END");
  console.log("economic-pipeline-precommit-gate.test.cjs: all tests passed");
}

run().catch((error) => {
  console.error("economic-pipeline-precommit-gate.test.cjs FAIL", error);
  process.exit(1);
});
