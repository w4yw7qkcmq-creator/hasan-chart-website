const SOURCE_HEALTH_THRESHOLDS = Object.freeze({
  minimumSampleSize: 8,
  startupGraceMs: 10 * 60_000,
  degraded: {
    sourceCausedConsecutiveFailures: 5,
    sourceCausedInvalidStructure: 6,
    parseSuccessRateMin: 0.65,
  },
  quarantined: {
    sourceCausedConsecutiveFailures: 10,
    sourceCausedInvalidStructure: 12,
    parseSuccessRateMin: 0.4,
  },
  recoveryHealthyStreak: 6,
  hysteresisMs: 5 * 60_000,
  quarantineCooldownMs: 15 * 60_000,
  networkOutageMinSources: 3,
  networkOutageWindowMs: 60_000,
});

const CONFIDENCE_POLICY = Object.freeze({
  autoApproveMin: 90,
  degradedMin: 80,
  blockBelow: 80,
  structuredEconomicMin: 85,
});

const ANOMALY_THRESHOLDS = Object.freeze({
  duplicateSpikeCount: 8,
  duplicateSpikeWindowMs: 60_000,
  sameEventTypeBurstCount: 10,
  sameEventTypeBurstWindowMs: 15_000,
  qualityBlockSpikeCount: 6,
  imageFailureSpikeCount: 5,
  pollSilenceMs: 45 * 60_000,
  cycleIncompleteMs: 20 * 60_000,
  pipelineStallEligibleMin: 3,
  pipelineStallWindowCycles: 6,
  pipelineStallPublicationMax: 0,
  pipelineRecoveryWindowCycles: 3,
  latencyDegradationMs: 500,
  latencyDegradationStreak: 5,
});

const CIRCUIT_BREAKER_DEFAULTS = Object.freeze({
  failureThreshold: 5,
  openMs: 60_000,
  halfOpenSuccessThreshold: 2,
});

const RETENTION_POLICY = Object.freeze({
  decisionRecordsDays: 30,
  incidentsDays: 180,
  metricSnapshotsDays: 365,
});

const SLO_THRESHOLDS_MS = Object.freeze({
  ingestToNormalized: 100,
  normalizedToEditorial: 200,
  editorialToPublication: 150,
  totalIngestToPublication: 500,
  familyAggregationMaxMs: 6000,
});

const ROLLING_WINDOWS_MS = Object.freeze({
  short: 15 * 60_000,
  hour: 60 * 60_000,
  day: 24 * 60 * 60_000,
});

module.exports = {
  SOURCE_HEALTH_THRESHOLDS,
  CONFIDENCE_POLICY,
  ANOMALY_THRESHOLDS,
  CIRCUIT_BREAKER_DEFAULTS,
  RETENTION_POLICY,
  SLO_THRESHOLDS_MS,
  ROLLING_WINDOWS_MS,
};
