#!/usr/bin/env node

const assert = require("assert");
const path = require("path");

const autonomyRoot = path.join(__dirname, "..", "lib", "news-intelligence", "autonomy");
const {
  FAILURE_ATTRIBUTION,
  classifyBlockReason,
} = require(path.join(autonomyRoot, "failure-attribution"));
const {
  getSourceHealthEngine,
  HEALTH_STATES,
  resetSourceHealthEngineForTests,
} = require(path.join(autonomyRoot, "source-health"));
const {
  detectSilentFailures,
  observeRssPoll,
  observeTelegramPoll,
  resetPhase3IntegrationForTests,
  checkSourceQuarantine,
} = require(path.join(autonomyRoot, "integration"));
const { resetIncidentsForTests, getOpenIncidents } = require(path.join(autonomyRoot, "incident-engine"));
const { resetHeartbeatForTests, updateHeartbeat } = require(path.join(autonomyRoot, "heartbeat"));
const { REASON_CODES } = require(path.join(autonomyRoot, "reason-taxonomy"));
const { SOURCE_TYPES } = require(path.join(__dirname, "..", "lib", "news-intelligence"));

function resetAll() {
  resetSourceHealthEngineForTests();
  resetIncidentsForTests();
  resetHeartbeatForTests();
  resetPhase3IntegrationForTests();
}

function testDuplicateBlocksDoNotQuarantineSource() {
  resetAll();
  const engine = getSourceHealthEngine({ reset: true });
  engine.setStartupGrace(0);
  const sourceType = SOURCE_TYPES.TELEGRAM_ECONOMIC;
  const sourceId = "ForexBreakingNews";
  for (let i = 0; i < 20; i++) {
    engine.recordSample({ duplicateBlocks: 1, attribution: FAILURE_ATTRIBUTION.PIPELINE_CAUSED }, sourceType, sourceId);
  }
  assert.strictEqual(engine.getSourceHealth(sourceType, sourceId).state, HEALTH_STATES.HEALTHY);
}

function testQualityGateIsPipelineCaused() {
  assert.strictEqual(
    classifyBlockReason(REASON_CODES.QUALITY_GATE_BLOCKED, "editorial"),
    FAILURE_ATTRIBUTION.PIPELINE_CAUSED
  );
}

function testSmallSampleStaysHealthyDespiteFailures() {
  resetAll();
  const engine = getSourceHealthEngine({ reset: true });
  engine.setStartupGrace(0);
  for (let i = 0; i < 3; i++) {
    engine.recordSample({ parseFailure: 1, attribution: FAILURE_ATTRIBUTION.SOURCE_CAUSED }, SOURCE_TYPES.TELEGRAM_ECONOMIC, "ForexBreakingNews");
  }
  assert.strictEqual(engine.getSourceHealth(SOURCE_TYPES.TELEGRAM_ECONOMIC, "ForexBreakingNews").state, HEALTH_STATES.HEALTHY);
  assert.strictEqual(engine.getSourceHealth(SOURCE_TYPES.TELEGRAM_ECONOMIC, "ForexBreakingNews").minimumSamplesMet, false);
}

function testStartupGracePreventsQuarantine() {
  resetAll();
  const engine = getSourceHealthEngine({ reset: true });
  for (let i = 0; i < 20; i++) {
    engine.recordSample({ parseFailure: 1, attribution: FAILURE_ATTRIBUTION.SOURCE_CAUSED }, SOURCE_TYPES.TELEGRAM_ECONOMIC, "BadChannel");
  }
  assert.strictEqual(engine.inStartupGrace(), true);
  assert.strictEqual(engine.isQuarantined(SOURCE_TYPES.TELEGRAM_ECONOMIC, "BadChannel"), false);
  const blocked = checkSourceQuarantine(
    { sourceType: SOURCE_TYPES.TELEGRAM_ECONOMIC, sourceId: "BadChannel" },
    { enablePhase3Autonomy: true, enablePhase3AutoQuarantine: true }
  );
  assert.strictEqual(blocked.allowed, true);
}

function testRssEmptyFeedIsExpectedNoData() {
  resetAll();
  const engine = getSourceHealthEngine({ reset: true });
  engine.setStartupGrace(0);
  observeRssPoll(true, "forexnews", { zeroArticles: true });
  assert.strictEqual(engine.getSourceHealth("rss", "forexnews").state, HEALTH_STATES.HEALTHY);
}

function testZeroCandidatesAloneDoesNotSilentFail() {
  resetAll();
  const engine = getSourceHealthEngine({ reset: true });
  engine.setStartupGrace(0);
  observeTelegramPoll({ ok: true });
  updateHeartbeat({ lastCycleCompletedAt: new Date().toISOString() });
  detectSilentFailures();
  assert.strictEqual(getOpenIncidents().some((i) => i.incidentType === "SILENT_FAILURE"), false);
}

function testNetworkOutageDoesNotQuarantineIndividualSources() {
  resetAll();
  const engine = getSourceHealthEngine({ reset: true });
  engine.setStartupGrace(0);
  for (const sourceId of ["rss-a", "rss-b", "rss-c"]) {
    for (let i = 0; i < 4; i++) {
      engine.recordSample({ fetchFailure: 1, attribution: FAILURE_ATTRIBUTION.NETWORK_CAUSED }, "rss", sourceId);
    }
  }
  assert.strictEqual(engine.isNetworkOutageActive(), true);
  assert.strictEqual(engine.getSourceHealth("rss", "rss-a").state, HEALTH_STATES.HEALTHY);
}

function testRestartHydrationUsesRecovering() {
  resetAll();
  const engine = getSourceHealthEngine({ reset: true });
  engine.hydrateSourceHealth(SOURCE_TYPES.TELEGRAM_ECONOMIC, "ForexBreakingNews", {
    state: HEALTH_STATES.QUARANTINED,
    updatedAt: new Date().toISOString(),
  });
  assert.strictEqual(engine.getSourceHealth(SOURCE_TYPES.TELEGRAM_ECONOMIC, "ForexBreakingNews").state, HEALTH_STATES.RECOVERING);
}

function testSyntheticQuarantineLifecycle() {
  resetAll();
  const engine = getSourceHealthEngine({
    reset: true,
    thresholds: { quarantineCooldownMs: 0 },
  });
  engine.setStartupGrace(0);
  const sourceType = "telegram_economic";
  const sourceId = "CANARY_SYNTHETIC_SOURCE";
  for (let i = 0; i < 8; i++) engine.recordSample({ parseSuccess: 1, attribution: FAILURE_ATTRIBUTION.EXPECTED_NO_DATA }, sourceType, sourceId);
  for (let i = 0; i < 5; i++) {
    engine.recordSample({ parseFailure: 1, attribution: FAILURE_ATTRIBUTION.SOURCE_CAUSED }, sourceType, sourceId);
  }
  assert.strictEqual(engine.getSourceHealth(sourceType, sourceId).state, HEALTH_STATES.DEGRADED);
  for (let i = 0; i < 8; i++) {
    engine.recordSample({ parseFailure: 1, invalidStructure: 1, attribution: FAILURE_ATTRIBUTION.SOURCE_CAUSED }, sourceType, sourceId);
  }
  assert.strictEqual(engine.getSourceHealth(sourceType, sourceId).state, HEALTH_STATES.QUARANTINED);
  for (let i = 0; i < 30; i++) {
    engine.recordSample({ parseSuccess: 1, attribution: FAILURE_ATTRIBUTION.EXPECTED_NO_DATA }, sourceType, sourceId);
  }
  const finalState = engine.getSourceHealth(sourceType, sourceId).state;
  assert.ok(finalState === HEALTH_STATES.RECOVERING || finalState === HEALTH_STATES.HEALTHY);
}

async function main() {
  testDuplicateBlocksDoNotQuarantineSource();
  testQualityGateIsPipelineCaused();
  testSmallSampleStaysHealthyDespiteFailures();
  testStartupGracePreventsQuarantine();
  testRssEmptyFeedIsExpectedNoData();
  testZeroCandidatesAloneDoesNotSilentFail();
  testNetworkOutageDoesNotQuarantineIndividualSources();
  testRestartHydrationUsesRecovering();
  testSyntheticQuarantineLifecycle();
  console.log("news-intelligence-phase3-false-positive.test.cjs: all tests passed");
}

main().catch((error) => {
  console.error("news-intelligence-phase3-false-positive.test.cjs FAIL", error);
  process.exit(1);
});
