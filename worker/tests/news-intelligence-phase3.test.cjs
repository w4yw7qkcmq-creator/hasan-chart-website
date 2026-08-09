#!/usr/bin/env node

const assert = require("assert");
const path = require("path");
const fs = require("fs");

const autonomyRoot = path.join(__dirname, "..", "lib", "news-intelligence", "autonomy");
const intelRoot = path.join(__dirname, "..", "lib", "news-intelligence");
const {
  FAILURE_ATTRIBUTION,
} = require(path.join(autonomyRoot, "failure-attribution"));

const {
  REASON_CODES,
  normalizeReasonCode,
  INCIDENT_TYPES,
  SEVERITY,
  isPhase3AutonomyEnabled,
  isPhase3AutoQuarantineEnabled,
  computeConfidence,
  evaluateConfidencePolicy,
  getSourceHealthEngine,
  HEALTH_STATES,
  resetSourceHealthEngineForTests,
  getCircuitBreakerRegistry,
  resetCircuitBreakersForTests,
  BREAKER_STATES,
  openOrUpdateIncident,
  getOpenIncidents,
  resetIncidentsForTests,
  observeAnomaly,
  resetAnomalyStateForTests,
  recordDecision,
  getRecentDecisions,
  resetDecisionRecordsForTests,
  getMetricsAggregator,
  resetMetricsAggregatorForTests,
  updateHeartbeat,
  resetHeartbeatForTests,
  auditPublishedRecord,
  reconcileDelivery,
  buildDailyOperationalSummary,
  getNewsSystemStatus,
  runReplay,
  runReplaySuite,
  REPLAY_MODES,
  observeCycleStart,
  observeCycleEnd,
  detectSilentFailures,
  evaluateLatencySlo,
  checkSourceQuarantine,
  resetPhase3IntegrationForTests,
} = require(autonomyRoot);

const {
  createNewsPublisherGateway,
  createPublicationStore,
  PUBLICATION_TYPES,
  SOURCE_TYPES,
} = require(intelRoot);

const {
  createFamilyAggregationCoordinator,
} = require(path.join(intelRoot, "economic-editorial"));

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

function resetAll() {
  resetSourceHealthEngineForTests();
  resetCircuitBreakersForTests();
  resetIncidentsForTests();
  resetAnomalyStateForTests();
  resetDecisionRecordsForTests();
  resetMetricsAggregatorForTests();
  resetHeartbeatForTests();
  resetPhase3IntegrationForTests();
}

function withEnv(key, value, fn) {
  const prev = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (prev === undefined) delete process.env[key];
      else process.env[key] = prev;
    });
}

function buildProfessionalBody(facts) {
  return `🚨 مطالبات البطالة\nالحالي: ${facts.actual}\nالمتوقع: ${facts.forecast}\nالسابق: ${facts.previous}\nتحليل احترافي كافٍ لتجاوز الحد الأدنى للنشر.`;
}

async function testFeatureFlags() {
  await withEnv("NEWS_PHASE3_AUTONOMY", undefined, async () => {
    assert.strictEqual(isPhase3AutonomyEnabled({}), false);
  });
  await withEnv("NEWS_PHASE3_AUTONOMY", "1", async () => {
    assert.strictEqual(isPhase3AutonomyEnabled({}), true);
    assert.strictEqual(isPhase3AutoQuarantineEnabled({}), false);
  });
  await withEnv("NEWS_PHASE3_AUTO_QUARANTINE", "1", async () => {
    assert.strictEqual(isPhase3AutoQuarantineEnabled({ enablePhase3Autonomy: true }), true);
  });
}

function testReasonTaxonomy() {
  assert.strictEqual(normalizeReasonCode("DUPLICATE_BLOCKED"), REASON_CODES.DUPLICATE_BLOCKED);
  assert.strictEqual(normalizeReasonCode("COPY_SIMILARITY_BLOCKED"), REASON_CODES.SOURCE_COPY_SIMILARITY_TOO_HIGH);
  assert.ok(REASON_CODES.PUBLISHED);
  assert.ok(INCIDENT_TYPES.DUPLICATE_SPIKE);
}

function testConfidenceEngine() {
  const high = computeConfidence({ factExtractionConfidence: 98, sourceHealthConfidence: 95 });
  const policy = evaluateConfidencePolicy(high, { structuredEconomic: true });
  assert.strictEqual(policy.allowed, true);
  assert.strictEqual(policy.band, "AUTO_APPROVED");

  const hard = evaluateConfidencePolicy(high, { hardBlockReason: REASON_CODES.SOURCE_NOT_ALLOWED });
  assert.strictEqual(hard.allowed, false);
  assert.strictEqual(hard.band, "HARD_BLOCK");
}

function testSourceHealthLifecycle() {
  const engine = getSourceHealthEngine({
    reset: true,
    thresholds: { quarantineCooldownMs: 0 },
  });
  engine.setStartupGrace(0);
  const sourceType = SOURCE_TYPES.TELEGRAM_ECONOMIC;
  const sourceId = "ForexBreakingNews";

  for (let i = 0; i < 8; i++) {
    engine.recordSample({ parseSuccess: 1, attribution: FAILURE_ATTRIBUTION.EXPECTED_NO_DATA }, sourceType, sourceId);
  }
  for (let i = 0; i < 5; i++) {
    engine.recordSample({ parseFailure: 1, attribution: FAILURE_ATTRIBUTION.SOURCE_CAUSED }, sourceType, sourceId);
  }
  assert.strictEqual(engine.getSourceHealth(sourceType, sourceId).state, HEALTH_STATES.DEGRADED);

  for (let i = 0; i < 8; i++) {
    engine.recordSample({ parseFailure: 1, invalidStructure: 1, attribution: FAILURE_ATTRIBUTION.SOURCE_CAUSED }, sourceType, sourceId);
  }
  assert.strictEqual(engine.getSourceHealth(sourceType, sourceId).state, HEALTH_STATES.QUARANTINED);

  for (let i = 0; i < 25; i++) {
    engine.recordSample({ parseSuccess: 1, attribution: FAILURE_ATTRIBUTION.EXPECTED_NO_DATA }, sourceType, sourceId);
  }
  const state = engine.getSourceHealth(sourceType, sourceId).state;
  assert.notStrictEqual(state, HEALTH_STATES.QUARANTINED);
  assert.ok(state === HEALTH_STATES.RECOVERING || state === HEALTH_STATES.HEALTHY);
}

async function testQuarantineBlocksPublication() {
  resetAll();
  const engine = getSourceHealthEngine({
    reset: true,
    thresholds: { quarantineCooldownMs: 0 },
  });
  engine.setStartupGrace(0);
  for (let i = 0; i < 8; i++) {
    engine.recordSample({ parseSuccess: 1, attribution: FAILURE_ATTRIBUTION.EXPECTED_NO_DATA }, SOURCE_TYPES.TELEGRAM_ECONOMIC, "BadChannel");
  }
  for (let i = 0; i < 12; i++) {
    engine.recordSample({ parseFailure: 1, invalidStructure: 1, attribution: FAILURE_ATTRIBUTION.SOURCE_CAUSED }, SOURCE_TYPES.TELEGRAM_ECONOMIC, "BadChannel");
  }
  const blocked = checkSourceQuarantine(
    { sourceType: SOURCE_TYPES.TELEGRAM_ECONOMIC, sourceId: "BadChannel" },
    { enablePhase3Autonomy: true, enablePhase3AutoQuarantine: true }
  );
  assert.strictEqual(blocked.allowed, false);
  assert.strictEqual(blocked.reason, REASON_CODES.SOURCE_QUARANTINED);
}

function testCircuitBreaker() {
  const breaker = getCircuitBreakerRegistry().get("rss_fetch");
  assert.strictEqual(breaker.canExecute(), true);
  for (let i = 0; i < 5; i++) breaker.recordFailure();
  assert.strictEqual(breaker.snapshot().state, BREAKER_STATES.OPEN);
  breaker.recordSuccess();
  breaker.recordSuccess();
}

function testIncidentDedup() {
  resetIncidentsForTests();
  const first = openOrUpdateIncident({
    type: INCIDENT_TYPES.RSS_FETCH_OUTAGE,
    severity: SEVERITY.WARNING,
    affectedSource: "forexnews",
  });
  const second = openOrUpdateIncident({
    type: INCIDENT_TYPES.RSS_FETCH_OUTAGE,
    severity: SEVERITY.WARNING,
    affectedSource: "forexnews",
  });
  assert.strictEqual(first.incidentId, second.incidentId);
  assert.strictEqual(second.count, 2);
  assert.strictEqual(getOpenIncidents().length, 1);
}

function testAnomalyDetection() {
  resetIncidentsForTests();
  resetAnomalyStateForTests();
  for (let i = 0; i < 8; i++) {
    observeAnomaly({ reasonCode: REASON_CODES.DUPLICATE_BLOCKED, sourceId: "ForexBreakingNews" });
  }
  assert.ok(getOpenIncidents().some((i) => i.incidentType === INCIDENT_TYPES.DUPLICATE_SPIKE));
}

function testDecisionRecordsAndMetrics() {
  recordDecision({
    correlationId: "test-corr-1",
    eventType: "US_INITIAL_JOBLESS_CLAIMS",
    sourceType: SOURCE_TYPES.TELEGRAM_ECONOMIC,
    sourceId: "ForexBreakingNews",
    reasonCode: REASON_CODES.PUBLISHED,
    latency: { totalMs: 120 },
  });
  recordDecision({
    correlationId: "test-corr-2",
    sourceType: SOURCE_TYPES.TELEGRAM_ECONOMIC,
    sourceId: "ForexBreakingNews",
    reasonCode: REASON_CODES.DUPLICATE_BLOCKED,
  });
  assert.strictEqual(getRecentDecisions().length, 2);
  const snap = getMetricsAggregator().getSnapshot();
  assert.strictEqual(snap.global.publications_success, 1);
  assert.strictEqual(snap.global.duplicates_blocked, 1);
}

function testHeartbeatAndSilentFailure() {
  resetAll();
  const engine = getSourceHealthEngine({ reset: true });
  engine.setStartupGrace(0);
  observeCycleStart();
  updateHeartbeat({ lastTelegramPollAt: new Date(Date.now() - 46 * 60_000).toISOString() });
  detectSilentFailures();
  assert.ok(getOpenIncidents().some((i) => i.incidentType === INCIDENT_TYPES.SILENT_FAILURE));
  observeCycleEnd(450, {});
}

function testLatencySlo() {
  const breaches = evaluateLatencySlo({
    ingestToNormalized: 600,
    normalizedToEditorial: 600,
    editorialToPublication: 600,
    totalMs: 600,
  });
  assert.strictEqual(breaches.length, 4);
}

function testPostPublishAudit() {
  const audit = auditPublishedRecord({
    publication: { sourceId: "ForexBreakingNews", imagePolicy: "REQUIRED" },
    publicationRecord: { eventKey: "test-key", telegramLegStatus: "success", siteLegStatus: "failed" },
    canonicalFacts: { actual: "199K" },
    requiredImage: true,
  });
  assert.strictEqual(audit.ok, false);
  assert.ok(audit.issues.includes("missing_required_image_reference"));
}

async function testDeliveryReconciliation() {
  const store = createPublicationStore({ memoryOnly: true });
  const gateway = createNewsPublisherGateway({ store });
  let siteRetried = false;
  gateway.retryDelivery = async () => {
    siteRetried = true;
    return { siteInserted: true };
  };
  const result = await reconcileDelivery(
    { eventKey: "k1", publicationType: PUBLICATION_TYPES.RELEASE, telegramLegStatus: "success", siteLegStatus: "failed", metadata: {} },
    gateway,
    { correlationId: "rec-1" }
  );
  assert.strictEqual(result.action, "site_retry");
  assert.strictEqual(siteRetried, true);
}

async function testReplayUnapprovedSource() {
  resetAll();
  const result = await runReplay(require(path.join(__dirname, "..", "fixtures", "news-intelligence", "golden", "unapproved-telegram-source.json")), {
    mode: REPLAY_MODES.REPLAY_COMPARE,
    enablePhase2Editorial: true,
  });
  assert.strictEqual(result.actual.decision, "BLOCKED");
  assert.strictEqual(result.actual.reasonCode, REASON_CODES.SOURCE_NOT_ALLOWED);
}

async function testJoblessClaimsIncidentReplay() {
  resetAll();
  const store = createPublicationStore({ memoryOnly: true });
  const gateway = createNewsPublisherGateway({ store });
  const coordinator = createFamilyAggregationCoordinator({ windowMs: 6000 });
  const { maybeApplyPhase2Editorial } = require(path.join(intelRoot, "economic-editorial", "integration"));

  const bodyInitial = buildProfessionalBody(INITIAL.canonicalFacts);
  const bodyContinuing = buildProfessionalBody(CONTINUING.canonicalFacts);

  async function buildMergedPublication(structured, rawMessageId, body) {
    const publication = {
      eventType: structured.eventType,
      eventFamily: structured.eventFamily,
      publicationType: PUBLICATION_TYPES.RELEASE,
      sourceType: SOURCE_TYPES.TELEGRAM_ECONOMIC,
      sourceId: "ForexBreakingNews",
      country: "US",
      releaseDate: RELEASE_TIME,
      receivedAt: RELEASE_TIME,
      title: structured.eventType,
      body,
      bodySource: "formatted",
      destination: "both",
      importance: "HIGH",
      facts: structured.canonicalFacts,
      metadata: { rawMessageId },
    };
    const phase2 = await maybeApplyPhase2Editorial(publication, {
      enablePhase2Editorial: true,
      dryRun: true,
      allowPlaceholderImage: true,
      testMode: true,
      familyCoordinator: coordinator,
    });
    assert.strictEqual(phase2.ok, true, phase2.reason || "phase2 failed");
    return phase2.publication;
  }

  const initialPromise = buildMergedPublication(INITIAL, "jc-inc-1", bodyInitial);
  await new Promise((r) => setTimeout(r, 5));
  const continuingPromise = buildMergedPublication(CONTINUING, "jc-inc-2", bodyContinuing);
  const [initialPub, continuingPub] = await Promise.all([initialPromise, continuingPromise]);
  assert.strictEqual(initialPub.body, continuingPub.body);
  assert.match(initialPub.body, /مختلطة/);

  const first = await gateway.publish(initialPub, { dryRun: true, forcePhase3Diagnostics: true });
  assert.ok(first.dryRun || first.published);

  const dupRaw = await gateway.publish(
    {
      eventType: "US_INITIAL_JOBLESS_CLAIMS",
      publicationType: PUBLICATION_TYPES.RELEASE,
      sourceType: SOURCE_TYPES.TELEGRAM_ECONOMIC,
      sourceId: "ForexBreakingNews",
      country: "US",
      releaseDate: RELEASE_TIME,
      title: "Initial Jobless Claims",
      body: "Initial Jobless Claims previous 197K forecast 203K actual 199K raw copy",
      bodySource: "formatted",
      destination: "both",
      importance: "HIGH",
      facts: INITIAL.canonicalFacts,
      rawSourceText: "Initial Jobless Claims previous 197K forecast 203K actual 199K raw copy",
      metadata: { rawMessageId: "jc-inc-dup" },
    },
    { dryRun: true, forcePhase3Diagnostics: true }
  );
  assert.strictEqual(dupRaw.blocked, true);

  const duplicateFamily = await gateway.publish(initialPub, { dryRun: true, forcePhase3Diagnostics: true });
  assert.strictEqual(duplicateFamily.blocked, true);
  assert.ok(
    duplicateFamily.reason === "DUPLICATE_BLOCKED" || duplicateFamily.reason === REASON_CODES.DUPLICATE_BLOCKED
  );

  const decisions = getRecentDecisions();
  assert.ok(decisions.some((d) => d.reasonCode === REASON_CODES.PUBLISHED));
  assert.ok(decisions.some((d) => d.reasonCode === REASON_CODES.DUPLICATE_BLOCKED));

  const metrics = getMetricsAggregator().getSnapshot();
  assert.ok(metrics.global.duplicates_blocked >= 1);
  assert.ok(metrics.global.publications_success >= 1);
}

async function testGoldenFixturesManifest() {
  const manifest = require(path.join(__dirname, "..", "fixtures", "news-intelligence", "golden", "manifest.json"));
  assert.ok(manifest.fixtures.length >= 20);
  for (const name of ["jobless-claims-structured-correct", "unapproved-telegram-source", "rss-copy-paste"]) {
    const fixturePath = path.join(__dirname, "..", "fixtures", "news-intelligence", "golden", `${name}.json`);
    assert.ok(fs.existsSync(fixturePath), `${name}.json missing`);
  }
}

async function testDailySummaryAndDiagnostics() {
  recordDecision({
    correlationId: "summary-1",
    reasonCode: REASON_CODES.PUBLISHED,
    sourceType: SOURCE_TYPES.TELEGRAM_ECONOMIC,
    sourceId: "ForexBreakingNews",
  });
  const summary = buildDailyOperationalSummary();
  assert.ok(summary.processed >= 1);
  const status = getNewsSystemStatus();
  assert.ok(status.overallHealth);
  assert.ok(status.metrics);
}

async function testChaosDoesNotCrash() {
  const store = createPublicationStore({ runtimeMode: "production", allowMemoryIdempotencyFallback: false });
  const gateway = createNewsPublisherGateway({ store });
  const { maybeApplyPhase2Editorial } = require(path.join(intelRoot, "economic-editorial", "integration"));
  const phase2 = await maybeApplyPhase2Editorial(
    {
      eventType: "US_INITIAL_JOBLESS_CLAIMS",
      publicationType: PUBLICATION_TYPES.RELEASE,
      sourceType: SOURCE_TYPES.TELEGRAM_ECONOMIC,
      sourceId: "ForexBreakingNews",
      country: "US",
      releaseDate: RELEASE_TIME,
      title: "Initial Jobless Claims",
      body: buildProfessionalBody(INITIAL.canonicalFacts),
      bodySource: "formatted",
      destination: "both",
      importance: "HIGH",
      facts: INITIAL.canonicalFacts,
    },
    { enablePhase2Editorial: true, dryRun: true, allowPlaceholderImage: true, testMode: true, skipFamilyAggregation: true }
  );
  assert.strictEqual(phase2.ok, true);
  const result = await gateway.publish(phase2.publication, { dryRun: false, forcePhase3Diagnostics: true });
  assert.strictEqual(result.blocked, true);
  assert.strictEqual(result.reason, "IDEMPOTENCY_STORE_UNAVAILABLE");
}

async function main() {
  resetAll();
  await testFeatureFlags();
  testReasonTaxonomy();
  testConfidenceEngine();
  testSourceHealthLifecycle();
  await testQuarantineBlocksPublication();
  testCircuitBreaker();
  testIncidentDedup();
  testAnomalyDetection();
  testDecisionRecordsAndMetrics();
  testHeartbeatAndSilentFailure();
  testLatencySlo();
  testPostPublishAudit();
  await testDeliveryReconciliation();
  await testReplayUnapprovedSource();
  await testJoblessClaimsIncidentReplay();
  await testGoldenFixturesManifest();
  await testDailySummaryAndDiagnostics();
  await testChaosDoesNotCrash();
  console.log("news-intelligence-phase3.test.cjs: all tests passed");
}

main().catch((error) => {
  console.error("news-intelligence-phase3.test.cjs FAIL", error);
  process.exit(1);
});
