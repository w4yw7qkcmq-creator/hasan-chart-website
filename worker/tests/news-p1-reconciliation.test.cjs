#!/usr/bin/env node

const assert = require("assert");
const path = require("path");

const autonomyRoot = path.join(__dirname, "..", "lib", "news-intelligence", "autonomy");
const intelRoot = path.join(__dirname, "..", "lib", "news-intelligence");

const {
  INCIDENT_TYPES,
  SEVERITY,
  openOrUpdateIncident,
  resolveIncident,
  buildSignature,
  getOpenIncidents,
  resetIncidentsForTests,
  resetPhase3IntegrationForTests,
  observeCycleEnd,
  updateHeartbeat,
  resetHeartbeatForTests,
  shouldResolvePipelineStallIncident,
  resolvePipelineStallIncidentIfRecovered,
  isCanaryPublicationRow,
  resolveLegStatesFromEvidence,
  reconcilePublicationRow,
} = require(autonomyRoot);

const { LEG_STATUS } = require(path.join(intelRoot, "publication-store"));

function resetAll() {
  resetIncidentsForTests();
  resetPhase3IntegrationForTests();
  resetHeartbeatForTests();
}

function buildHealthyWindow(cycles = 3) {
  const window = [];
  for (let i = 0; i < cycles; i += 1) {
    window.push({
      eligible: 0,
      economicEligible: 0,
      economicPublished: 1,
      economicPublicationAttempts: 1,
      economicPublicationFailures: 0,
      published: 1,
      newObserved: 1,
      at: Date.now(),
    });
  }
  return window;
}

function buildStallWindow() {
  const window = [];
  for (let i = 0; i < 6; i += 1) {
    window.push({
      eligible: 4,
      economicEligible: 4,
      economicPublished: 0,
      economicPublicationAttempts: 2,
      economicPublicationFailures: 2,
      published: 0,
      newObserved: 2,
      at: Date.now(),
    });
  }
  return window;
}

function testPipelineStallOpensIncident() {
  resetAll();
  openOrUpdateIncident({
    type: INCIDENT_TYPES.NEWS_PUBLICATION_PIPELINE_STALL,
    severity: SEVERITY.HIGH,
    evidenceSummary: { eligibleSum: 12, publishedSum: 0 },
  });
  assert.strictEqual(
    getOpenIncidents().some((i) => i.incidentType === INCIDENT_TYPES.NEWS_PUBLICATION_PIPELINE_STALL),
    true
  );
}

function testRecoveredHealthyWindowsResolveIncident() {
  resetAll();
  const signature = buildSignature(INCIDENT_TYPES.NEWS_PUBLICATION_PIPELINE_STALL, {});
  openOrUpdateIncident({
    type: INCIDENT_TYPES.NEWS_PUBLICATION_PIPELINE_STALL,
    severity: SEVERITY.HIGH,
    signature,
  });
  updateHeartbeat({
    lastRssPollAt: new Date().toISOString(),
    lastTelegramPollAt: new Date().toISOString(),
    lastCycleCompletedAt: new Date().toISOString(),
  });
  const result = resolvePipelineStallIncidentIfRecovered(buildHealthyWindow(3), {
    lastRssPollAt: Date.now(),
    lastTelegramPollAt: Date.now(),
  });
  assert.strictEqual(result.resolved, true);
  assert.strictEqual(getOpenIncidents().length, 0);
}

function testResolvedIncidentRemainsHistory() {
  resetAll();
  const signature = buildSignature(INCIDENT_TYPES.NEWS_PUBLICATION_PIPELINE_STALL, {});
  openOrUpdateIncident({ type: INCIDENT_TYPES.NEWS_PUBLICATION_PIPELINE_STALL, severity: SEVERITY.HIGH, signature });
  resolveIncident(signature, { resolutionReason: "condition_recovered" });
  assert.strictEqual(getOpenIncidents().length, 0);
}

function testStaleIncidentNotCountedOpen() {
  resetAll();
  const decision = shouldResolvePipelineStallIncident(buildStallWindow(), {
    lastRssPollAt: Date.now(),
    lastTelegramPollAt: Date.now(),
  });
  assert.strictEqual(decision.shouldResolve, false);
}

function testCanaryIncidentExcluded() {
  assert.strictEqual(
    isCanaryPublicationRow({
      event_key: "CANARY:NEWS_INTELLIGENCE:123",
      metadata: { canary: true },
      telegram_leg_status: "pending",
      site_leg_status: "pending",
    }),
    true
  );
}

function testBothLegsSuccessEvidence() {
  const resolution = resolveLegStatesFromEvidence(
    { telegramPublished: true, sitePublished: true, decisionPublished: false },
    { telegram_leg_status: "pending", site_leg_status: "pending" }
  );
  assert.strictEqual(resolution.telegramLegStatus, LEG_STATUS.SUCCESS);
  assert.strictEqual(resolution.siteLegStatus, LEG_STATUS.SUCCESS);
}

function testTelegramSuccessSiteFailEvidence() {
  const resolution = resolveLegStatesFromEvidence(
    { telegramPublished: true, sitePublished: false, decisionPublished: false },
    { telegram_leg_status: "pending", site_leg_status: "pending" }
  );
  assert.strictEqual(resolution.telegramLegStatus, LEG_STATUS.SUCCESS);
  assert.strictEqual(resolution.siteLegStatus, LEG_STATUS.FAILED);
}

function testSiteSuccessTelegramFailEvidence() {
  const resolution = resolveLegStatesFromEvidence(
    { telegramPublished: false, sitePublished: true, decisionPublished: false },
    { telegram_leg_status: "pending", site_leg_status: "pending" }
  );
  assert.strictEqual(resolution.telegramLegStatus, LEG_STATUS.FAILED);
  assert.strictEqual(resolution.siteLegStatus, LEG_STATUS.SUCCESS);
}

function testNoDeliveryEvidenceMarksFailed() {
  const resolution = resolveLegStatesFromEvidence(
    { telegramPublished: false, sitePublished: false, decisionPublished: false },
    { telegram_leg_status: "pending", site_leg_status: "pending" }
  );
  assert.strictEqual(resolution.telegramLegStatus, LEG_STATUS.FAILED);
  assert.strictEqual(resolution.siteLegStatus, LEG_STATUS.FAILED);
  assert.strictEqual(resolution.reconciliationReason, "stale_pending_no_delivery_evidence");
}

async function testCanaryRowMarkedSkipped() {
  const updates = [];
  const supabase = {
    from() {
      return {
        update(payload) {
          updates.push(payload);
          return {
            eq() {
              return {
                or() {
                  return Promise.resolve({ error: null });
                },
              };
            },
          };
        },
      };
    },
  };

  const result = await reconcilePublicationRow(
    supabase,
    {
      id: "canary-1",
      event_key: "CANARY:TEST",
      metadata: { canary: true },
      telegram_leg_status: "pending",
      site_leg_status: "pending",
    },
    { canaryReason: "canary_excluded_from_prod_health" }
  );

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.action, "canary_skipped");
  assert.strictEqual(updates[0].telegram_leg_status, LEG_STATUS.SKIPPED);
  assert.strictEqual(updates[0].site_leg_status, LEG_STATUS.SKIPPED);
}

async function run() {
  testPipelineStallOpensIncident();
  testRecoveredHealthyWindowsResolveIncident();
  testResolvedIncidentRemainsHistory();
  testStaleIncidentNotCountedOpen();
  testCanaryIncidentExcluded();
  testBothLegsSuccessEvidence();
  testTelegramSuccessSiteFailEvidence();
  testSiteSuccessTelegramFailEvidence();
  testNoDeliveryEvidenceMarksFailed();
  await testCanaryRowMarkedSkipped();
  console.log("news-p1-reconciliation tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
