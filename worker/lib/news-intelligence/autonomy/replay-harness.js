const path = require("path");
const fs = require("fs");
const { createCorrelationId } = require("./structured-log");
const { recordDecision, resetDecisionRecordsForTests } = require("./decision-record");
const { normalizeReasonCode, REASON_CODES } = require("./reason-taxonomy");
const { computeConfidence, evaluateConfidencePolicy } = require("./confidence-engine");
const { getSourceHealthEngine } = require("./source-health");

const REPLAY_MODES = Object.freeze({
  REPLAY_VALIDATE: "REPLAY_VALIDATE",
  REPLAY_COMPARE: "REPLAY_COMPARE",
  REPLAY_DRY_RUN: "REPLAY_DRY_RUN",
});

function loadFixture(name) {
  const filePath = path.join(__dirname, "..", "..", "..", "fixtures", "news-intelligence", "golden", `${name}.json`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadAllGoldenFixtures() {
  const goldenDir = path.join(__dirname, "..", "..", "..", "fixtures", "news-intelligence", "golden");
  const manifest = JSON.parse(fs.readFileSync(path.join(goldenDir, "manifest.json"), "utf8"));
  const jsonlFixtures = new Map();
  const jsonlPath = path.join(goldenDir, "batch-fixtures.jsonl");
  if (fs.existsSync(jsonlPath)) {
    for (const line of fs.readFileSync(jsonlPath, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const fixture = JSON.parse(line);
      jsonlFixtures.set(fixture.name, fixture);
    }
  }
  const loaded = [];
  for (const name of manifest.fixtures) {
    let fixture;
    try {
      fixture = loadFixture(name);
    } catch {
      fixture = jsonlFixtures.get(name);
    }
    if (!fixture) {
      throw new Error(`Golden fixture missing: ${name}`);
    }
    loaded.push({ name, ...fixture });
  }
  return loaded;
}

async function runAllGoldenFixtures(options = {}) {
  const fixtures = loadAllGoldenFixtures();
  const results = [];
  for (const fixture of fixtures) {
    results.push({ name: fixture.name, ...(await runReplay(fixture, options)) });
  }
  return { loadedFixtures: fixtures.length, executedFixtures: results.length, results };
}

async function runReplay(fixture, options = {}) {
  const mode = options.mode || REPLAY_MODES.REPLAY_VALIDATE;
  const correlationId = options.correlationId || createCorrelationId("replay");
  const intelRoot = path.join(__dirname, "..");
  const {
    createNewsPublisherGateway,
    createPublicationStore,
    PUBLICATION_TYPES,
    SOURCE_TYPES,
  } = require(intelRoot);
  const { maybeApplyPhase2Editorial } = require(path.join(intelRoot, "economic-editorial", "integration"));

  const store = createPublicationStore({ memoryOnly: true });
  const gateway = createNewsPublisherGateway({ store });
  const publication = { ...fixture.publication };
  const startedAt = Date.now();

  if (fixture.sourceHealthSample) {
    getSourceHealthEngine().recordSample(fixture.sourceHealthSample, publication.sourceType, publication.sourceId);
  }

  const phase2 = await maybeApplyPhase2Editorial(publication, {
    enablePhase2Editorial: options.enablePhase2Editorial !== false,
    dryRun: true,
    allowPlaceholderImage: true,
    testMode: true,
    skipFamilyAggregation: fixture.skipFamilyAggregation === true,
    familyCoordinator: options.familyCoordinator,
  });

  if (!phase2.ok) {
    const reasonCode = normalizeReasonCode(phase2.reason);
    recordDecision({
      correlationId,
      eventType: publication.eventType,
      sourceType: publication.sourceType,
      sourceId: publication.sourceId,
      reasonCode,
      receivedAt: publication.receivedAt,
      decisionAt: new Date().toISOString(),
      latency: { totalMs: Date.now() - startedAt },
    });
    return {
      mode,
      ok: false,
      reasonCode,
      stage: phase2.stage,
      actual: { decision: "BLOCKED", reasonCode, publications: 0 },
    };
  }

  const enriched = phase2.publication;
  const confidence = computeConfidence(fixture.confidence || {});
  const confidencePolicy = evaluateConfidencePolicy(confidence, {
    structuredEconomic: Boolean(enriched.facts?.actual),
    hardBlockReason: fixture.hardBlockReason || null,
  });

  if (!confidencePolicy.allowed && mode !== REPLAY_MODES.REPLAY_DRY_RUN) {
    recordDecision({
      correlationId,
      eventType: enriched.eventType,
      sourceType: enriched.sourceType,
      sourceId: enriched.sourceId,
      reasonCode: confidencePolicy.reasonCode,
      confidence,
    });
    return {
      mode,
      ok: false,
      reasonCode: confidencePolicy.reasonCode,
      actual: { decision: "BLOCKED", reasonCode: confidencePolicy.reasonCode, publications: 0 },
    };
  }

  const gatewayResult = await gateway.publish(enriched, { dryRun: true });
  const reasonCode = gatewayResult.blocked
    ? normalizeReasonCode(gatewayResult.reason)
    : gatewayResult.published || gatewayResult.dryRun
      ? REASON_CODES.PUBLISHED
      : REASON_CODES.DELIVERY_FAILED;

  recordDecision({
    correlationId,
    eventType: enriched.eventType,
    eventFamily: enriched.eventFamily || fixture.expected?.eventFamily,
    sourceType: enriched.sourceType,
    sourceId: enriched.sourceId,
    reasonCode,
    confidence,
    qualityStatus: phase2.qualityStatus || null,
    imageStatus: enriched.imagePolicy || enriched.metadata?.imagePolicy || null,
    aiUsed: phase2.aiUsed === true,
    aggregationState: phase2.aggregationState || null,
    publicationId: gatewayResult.publicationRecord?.id || null,
    deliveryResult: {
      telegramSent: gatewayResult.telegramSent,
      siteInserted: gatewayResult.siteInserted,
    },
    latency: { totalMs: Date.now() - startedAt },
  });

  const actual = {
    decision: gatewayResult.blocked ? "BLOCKED" : "PUBLISHED",
    reasonCode,
    eventType: enriched.eventType,
    eventFamily: enriched.eventFamily || fixture.expected?.eventFamily,
    facts: enriched.facts,
    familyUsdBias: phase2.familyUsdBias || enriched.metadata?.familyUsdBias,
    publications: gatewayResult.blocked ? 0 : 1,
    qualityStatus: phase2.qualityStatus,
    imagePolicy: enriched.imagePolicy || enriched.metadata?.imagePolicy,
  };

  let compareOk = true;
  const expected = fixture.expected || {};
  if (mode === REPLAY_MODES.REPLAY_COMPARE && expected) {
    if (expected.decision && actual.decision !== expected.decision) compareOk = false;
    if (expected.reasonCode && actual.reasonCode !== expected.reasonCode) compareOk = false;
    if (expected.publications != null && actual.publications !== expected.publications) compareOk = false;
    if (expected.eventFamily && actual.eventFamily !== expected.eventFamily) compareOk = false;
    if (expected.familyUsdBias && actual.familyUsdBias !== expected.familyUsdBias) compareOk = false;
  }

  return {
    mode,
    ok: !gatewayResult.blocked && compareOk,
    reasonCode,
    actual,
    expected,
    gatewayResult,
    compareOk,
  };
}

async function runReplaySuite(names = [], options = {}) {
  const results = [];
  for (const name of names) {
    const fixture = typeof name === "string" ? loadFixture(name) : name;
    results.push({ name: fixture.name || name, ...(await runReplay(fixture, options)) });
  }
  return results;
}

module.exports = {
  REPLAY_MODES,
  loadFixture,
  loadAllGoldenFixtures,
  runReplay,
  runReplaySuite,
  runAllGoldenFixtures,
  resetDecisionRecordsForTests,
};
