const { RSS_IMAGE_SOURCES } = require("../rss-image-telemetry");

const EDITOR_V2_MODE = "SHADOW";

function createEmptyV2Bucket() {
  return {
    mode: EDITOR_V2_MODE,
    shadowAttempted: 0,
    shadowPassed: 0,
    shadowFailed: 0,
    shadowCuratorSkipped: 0,
    shadowInsufficientEvidence: 0,
    shadowNumericMismatch: 0,
    shadowEntityMismatch: 0,
    shadowRoleMismatch: 0,
    shadowEntityRoleConflict: 0,
    shadowAttributionMismatch: 0,
    shadowQuoteMismatch: 0,
    shadowUncertaintyMismatch: 0,
    shadowHeadlineBodyMismatch: 0,
    shadowLowInformation: 0,
    shadowEditorialTimeout: 0,
    shadowEditorialAiFailed: 0,
    shadowLatencyTotalMs: 0,
    shadowLatencySamples: 0,
    shadowAiCalls: 0,
  };
}

const globalCounters = createEmptyV2Bucket();
const bySource = Object.fromEntries(RSS_IMAGE_SOURCES.map((source) => [source, createEmptyV2Bucket()]));

const REASON_TO_FIELD = {
  V2_NUMERIC_MISMATCH: "shadowNumericMismatch",
  V2_ENTITY_MISMATCH: "shadowEntityMismatch",
  V2_ROLE_MISMATCH: "shadowRoleMismatch",
  V2_ENTITY_ROLE_CONFLICT: "shadowEntityRoleConflict",
  V2_ATTRIBUTION_MISMATCH: "shadowAttributionMismatch",
  V2_QUOTE_MISMATCH: "shadowQuoteMismatch",
  V2_UNCERTAINTY_UPGRADE: "shadowUncertaintyMismatch",
  V2_HEADLINE_BODY_MISMATCH: "shadowHeadlineBodyMismatch",
  V2_LOW_INFORMATION: "shadowLowInformation",
  V2_INSUFFICIENT_EVIDENCE: "shadowInsufficientEvidence",
  V2_CURATOR_SKIPPED: "shadowCuratorSkipped",
  V2_EDITORIAL_TIMEOUT: "shadowEditorialTimeout",
  V2_EDITORIAL_AI_FAILED: "shadowEditorialAiFailed",
};

function normalizeSource(source = "") {
  const match = RSS_IMAGE_SOURCES.find((key) => key.toLowerCase() === String(source || "").trim().toLowerCase());
  return match || null;
}

function bump(bucket, field, amount = 1) {
  if (!bucket || !field) return;
  bucket[field] = (bucket[field] || 0) + amount;
}

function recordV2TelemetryEvent(source, event, amount = 1) {
  bump(globalCounters, event, amount);
  const sourceKey = normalizeSource(source);
  if (sourceKey) bump(bySource[sourceKey], event, amount);
}

function recordEditorV2ShadowOutcome(source, outcome = {}) {
  recordV2TelemetryEvent(source, "shadowAttempted");
  if (outcome.aiCall) recordV2TelemetryEvent(source, "shadowAiCalls");
  if (typeof outcome.latencyMs === "number") {
    recordV2TelemetryEvent(source, "shadowLatencyTotalMs", outcome.latencyMs);
    recordV2TelemetryEvent(source, "shadowLatencySamples");
  }
  if (outcome.passed) recordV2TelemetryEvent(source, "shadowPassed");
  if (outcome.failed) recordV2TelemetryEvent(source, "shadowFailed");
  if (outcome.curatorSkipped) recordV2TelemetryEvent(source, "shadowCuratorSkipped");
  if (outcome.insufficientEvidence) recordV2TelemetryEvent(source, "shadowInsufficientEvidence");
  if (outcome.timeout) recordV2TelemetryEvent(source, "shadowEditorialTimeout");
  if (outcome.aiFailed) recordV2TelemetryEvent(source, "shadowEditorialAiFailed");

  const field = REASON_TO_FIELD[outcome.reasonCode];
  if (field) recordV2TelemetryEvent(source, field);
}

function getEditorV2TelemetrySnapshot() {
  const avgLatencyMs =
    globalCounters.shadowLatencySamples > 0
      ? Math.round(globalCounters.shadowLatencyTotalMs / globalCounters.shadowLatencySamples)
      : null;

  return {
    mode: EDITOR_V2_MODE,
    global: {
      ...globalCounters,
      shadowAverageLatencyMs: avgLatencyMs,
      shadowAiCallsPerAttempt:
        globalCounters.shadowAttempted > 0
          ? Number((globalCounters.shadowAiCalls / globalCounters.shadowAttempted).toFixed(2))
          : 0,
    },
    bySource: Object.fromEntries(
      RSS_IMAGE_SOURCES.map((source) => {
        const bucket = bySource[source];
        const avg =
          bucket.shadowLatencySamples > 0
            ? Math.round(bucket.shadowLatencyTotalMs / bucket.shadowLatencySamples)
            : null;
        return [
          source,
          {
            ...bucket,
            shadowAverageLatencyMs: avg,
            shadowAiCallsPerAttempt:
              bucket.shadowAttempted > 0
                ? Number((bucket.shadowAiCalls / bucket.shadowAttempted).toFixed(2))
                : 0,
          },
        ];
      })
    ),
  };
}

function resetEditorV2TelemetryForTests() {
  Object.assign(globalCounters, createEmptyV2Bucket());
  for (const source of RSS_IMAGE_SOURCES) {
    Object.assign(bySource[source], createEmptyV2Bucket());
  }
}

module.exports = {
  EDITOR_V2_MODE,
  recordEditorV2ShadowOutcome,
  getEditorV2TelemetrySnapshot,
  resetEditorV2TelemetryForTests,
};
