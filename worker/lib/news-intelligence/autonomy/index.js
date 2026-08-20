const reasonTaxonomy = require("./reason-taxonomy");
const featureFlags = require("./feature-flags");
const config = require("./config");
const structuredLog = require("./structured-log");
const decisionRecord = require("./decision-record");
const decisionPersistence = require("./decision-persistence");
const metricsAggregator = require("./metrics-aggregator");
const sourceHealth = require("./source-health");
const confidenceEngine = require("./confidence-engine");
const circuitBreaker = require("./circuit-breaker");
const anomalyDetector = require("./anomaly-detector");
const incidentEngine = require("./incident-engine");
const heartbeat = require("./heartbeat");
const postPublishAuditor = require("./post-publish-auditor");
const deliveryReconciliation = require("./delivery-reconciliation");
const replayHarness = require("./replay-harness");
const dailySummary = require("./daily-summary");
const diagnosticService = require("./diagnostic-service");
const integration = require("./integration");
const failureAttribution = require("./failure-attribution");
const sourceHealthPersistence = require("./source-health-persistence");
const incidentPersistence = require("./incident-persistence");
const incidentRecovery = require("./incident-recovery");
const publicationLegReconciliation = require("./publication-leg-reconciliation");

module.exports = {
  ...reasonTaxonomy,
  ...featureFlags,
  ...config,
  ...structuredLog,
  ...decisionRecord,
  ...decisionPersistence,
  ...metricsAggregator,
  ...sourceHealth,
  ...confidenceEngine,
  ...circuitBreaker,
  ...anomalyDetector,
  ...incidentEngine,
  ...heartbeat,
  ...postPublishAuditor,
  ...deliveryReconciliation,
  ...replayHarness,
  ...dailySummary,
  ...diagnosticService,
  ...integration,
  ...failureAttribution,
  ...sourceHealthPersistence,
  ...incidentPersistence,
  ...incidentRecovery,
  ...publicationLegReconciliation,
};
