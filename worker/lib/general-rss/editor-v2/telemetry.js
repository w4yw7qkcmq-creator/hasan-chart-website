const crypto = require("crypto");
const { RSS_IMAGE_SOURCES } = require("../rss-image-telemetry");
const { resolveEditorV2Mode, V2_OUTPUT_PATHS } = require("./mode");
const { AI_DIRECT_FAILURE_REASONS } = require("./reason-codes");

const MAX_SHADOW_SAMPLES = 25;

const V2_OUTPUT_PATHS_EXPORT = V2_OUTPUT_PATHS;

function createEmptyV2Bucket(mode = resolveEditorV2Mode()) {
  return {
    mode,
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
    liveAttempted: 0,
    livePassed: 0,
    liveBlocked: 0,
    aiDirectAttempted: 0,
    aiDirectSucceeded: 0,
    aiDirectFailed: 0,
    fallbackAttempted: 0,
    fallbackSucceeded: 0,
    fallbackFailed: 0,
    finalPassed: 0,
    finalFailed: 0,
    aiDirectFailureReasons: {},
  };
}

const globalCounters = createEmptyV2Bucket();
const bySource = Object.fromEntries(RSS_IMAGE_SOURCES.map((source) => [source, createEmptyV2Bucket()]));
const shadowSamples = [];

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
  V2_ACTION_MISMATCH: "shadowActionMismatch",
  V2_PRIMARY_SUBJECT_MISMATCH: "shadowPrimarySubjectMismatch",
  V2_EVENT_TYPE_MISMATCH: "shadowEventTypeMismatch",
  V2_DIRECTION_MISMATCH: "shadowDirectionMismatch",
  V2_NUMERIC_UNIT_MISMATCH: "shadowNumericUnitMismatch",
  V2_ATTRIBUTION_SPECIFICITY_LOST: "shadowAttributionSpecificityLost",
};

function normalizeSource(source = "") {
  const match = RSS_IMAGE_SOURCES.find((key) => key.toLowerCase() === String(source || "").trim().toLowerCase());
  return match || null;
}

function bump(bucket, field, amount = 1) {
  if (!bucket || !field) return;
  if (field === "aiDirectFailureReasons" || typeof field === "object") return;
  bucket[field] = (bucket[field] || 0) + amount;
}

function bumpNested(bucket, nestedField, key, amount = 1) {
  if (!bucket) return;
  if (!bucket[nestedField]) bucket[nestedField] = {};
  bucket[nestedField][key] = (bucket[nestedField][key] || 0) + amount;
}

function recordV2TelemetryEvent(source, event, amount = 1) {
  bump(globalCounters, event, amount);
  const sourceKey = normalizeSource(source);
  if (sourceKey) bump(bySource[sourceKey], event, amount);
}

function buildSourceHash(sourceTitle = "", link = "") {
  return crypto
    .createHash("sha256")
    .update(`${String(sourceTitle || "").trim()}|${String(link || "").trim()}`)
    .digest("hex")
    .slice(0, 16);
}

function recordAiDirectFailureReason(source, reason = "") {
  if (!reason) return;
  const key = String(reason);
  bumpNested(globalCounters, "aiDirectFailureReasons", key);
  const sourceKey = normalizeSource(source);
  if (sourceKey) bumpNested(bySource[sourceKey], "aiDirectFailureReasons", key);
}

function recordEditorV2PathTelemetry(source, editorial = {}, finalOk = false) {
  const outputPath = editorial.outputPath || V2_OUTPUT_PATHS.FAILED;
  if (editorial.aiDirectAttempted) {
    recordV2TelemetryEvent(source, "aiDirectAttempted");
    if (outputPath === V2_OUTPUT_PATHS.AI_DIRECT) {
      recordV2TelemetryEvent(source, "aiDirectSucceeded");
    } else {
      recordV2TelemetryEvent(source, "aiDirectFailed");
      if (editorial.aiDirectFailureReason) {
        recordAiDirectFailureReason(source, editorial.aiDirectFailureReason);
      } else if (outputPath === V2_OUTPUT_PATHS.DETERMINISTIC_FALLBACK) {
        recordAiDirectFailureReason(source, AI_DIRECT_FAILURE_REASONS.AI_DIRECT_OTHER);
      }
    }
  }
  if (outputPath === V2_OUTPUT_PATHS.DETERMINISTIC_FALLBACK) {
    recordV2TelemetryEvent(source, "fallbackAttempted");
    if (finalOk) recordV2TelemetryEvent(source, "fallbackSucceeded");
    else recordV2TelemetryEvent(source, "fallbackFailed");
  }
  if (outputPath === V2_OUTPUT_PATHS.FAILED) {
    recordV2TelemetryEvent(source, "fallbackAttempted");
    recordV2TelemetryEvent(source, "fallbackFailed");
  }
  if (finalOk) recordV2TelemetryEvent(source, "finalPassed");
  else recordV2TelemetryEvent(source, "finalFailed");
}

function recordEditorV2Sample(sample = {}) {
  const entry = {
    source: String(sample.source || "unknown").slice(0, 40),
    timestamp: sample.timestamp || new Date().toISOString(),
    sourceTitle: String(sample.sourceTitle || "").slice(0, 180),
    headline: String(sample.headline || "").slice(0, 180),
    body: String(sample.body || "").slice(0, 420),
    outputPath: sample.outputPath || V2_OUTPUT_PATHS.FAILED,
    verdict: sample.verdict || "UNKNOWN",
    reasonCode: sample.reasonCode || null,
    latencyMs: typeof sample.latencyMs === "number" ? sample.latencyMs : null,
    sourceHash: sample.sourceHash || null,
    reviewKind: sample.reviewKind || "SHADOW",
    aiDirectFailureReason: sample.aiDirectFailureReason || null,
  };
  shadowSamples.unshift(entry);
  if (shadowSamples.length > MAX_SHADOW_SAMPLES) {
    shadowSamples.length = MAX_SHADOW_SAMPLES;
  }
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

  if (outcome.editorial) {
    recordEditorV2PathTelemetry(source, outcome.editorial, Boolean(outcome.passed));
  }

  if (outcome.recordSample !== false) {
    recordEditorV2Sample({
      source,
      timestamp: new Date().toISOString(),
      sourceTitle: outcome.sourceTitle,
      headline: outcome.headline,
      body: outcome.body,
      outputPath: outcome.outputPath || outcome.editorial?.outputPath,
      verdict: outcome.passed ? "WOULD_PASS" : "WOULD_FAIL",
      reasonCode: outcome.reasonCode || null,
      latencyMs: outcome.latencyMs,
      sourceHash: outcome.sourceHash,
      reviewKind: "SHADOW",
      aiDirectFailureReason: outcome.editorial?.aiDirectFailureReason || null,
    });
  }
}

function recordEditorV2LiveOutcome(source, outcome = {}) {
  recordV2TelemetryEvent(source, "liveAttempted");
  if (outcome.passed) recordV2TelemetryEvent(source, "livePassed");
  else recordV2TelemetryEvent(source, "liveBlocked");
  if (typeof outcome.latencyMs === "number") {
    recordV2TelemetryEvent(source, "shadowLatencyTotalMs", outcome.latencyMs);
    recordV2TelemetryEvent(source, "shadowLatencySamples");
  }
  if (outcome.aiCall) recordV2TelemetryEvent(source, "shadowAiCalls");
  if (outcome.editorial) {
    recordEditorV2PathTelemetry(source, outcome.editorial, Boolean(outcome.passed));
  }
  recordEditorV2Sample({
    source,
    timestamp: new Date().toISOString(),
    sourceTitle: outcome.sourceTitle,
    headline: outcome.headline,
    body: outcome.body,
    outputPath: outcome.outputPath || outcome.editorial?.outputPath,
    verdict: outcome.passed ? "LIVE_PASS" : "LIVE_BLOCK",
    reasonCode: outcome.reasonCode || null,
    latencyMs: outcome.latencyMs,
    sourceHash: outcome.sourceHash,
    reviewKind: "LIVE",
  });
}

function computePathRates(bucket = {}) {
  const aiAttempts = bucket.aiDirectAttempted || 0;
  const fallbackAttempts = bucket.fallbackAttempted || 0;
  const finalTotal = (bucket.finalPassed || 0) + (bucket.finalFailed || 0);
  return {
    aiDirectRate:
      aiAttempts > 0 ? Number(((bucket.aiDirectSucceeded || 0) / aiAttempts).toFixed(3)) : 0,
    fallbackRate:
      fallbackAttempts > 0
        ? Number(((bucket.fallbackSucceeded || 0) / fallbackAttempts).toFixed(3))
        : 0,
    failureRate: finalTotal > 0 ? Number(((bucket.finalFailed || 0) / finalTotal).toFixed(3)) : 0,
  };
}

function enrichBucket(bucket = {}) {
  const avgLatencyMs =
    bucket.shadowLatencySamples > 0
      ? Math.round(bucket.shadowLatencyTotalMs / bucket.shadowLatencySamples)
      : null;
  return {
    ...bucket,
    shadowAverageLatencyMs: avgLatencyMs,
    shadowAiCallsPerAttempt:
      bucket.shadowAttempted > 0
        ? Number((bucket.shadowAiCalls / bucket.shadowAttempted).toFixed(2))
        : 0,
    ...computePathRates(bucket),
  };
}

function getEditorV2TelemetrySnapshot() {
  const mode = resolveEditorV2Mode();
  globalCounters.mode = mode;
  return {
    mode,
    global: enrichBucket(globalCounters),
    bySource: Object.fromEntries(
      RSS_IMAGE_SOURCES.map((source) => [source, enrichBucket(bySource[source])])
    ),
    samples: shadowSamples.slice(),
    sampleLimit: MAX_SHADOW_SAMPLES,
  };
}

function resetEditorV2TelemetryForTests() {
  Object.assign(globalCounters, createEmptyV2Bucket());
  for (const source of RSS_IMAGE_SOURCES) {
    Object.assign(bySource[source], createEmptyV2Bucket());
  }
  shadowSamples.length = 0;
}

module.exports = {
  V2_OUTPUT_PATHS: V2_OUTPUT_PATHS_EXPORT,
  MAX_SHADOW_SAMPLES,
  recordEditorV2ShadowOutcome,
  recordEditorV2LiveOutcome,
  recordEditorV2PathTelemetry,
  recordEditorV2Sample,
  getEditorV2TelemetrySnapshot,
  resetEditorV2TelemetryForTests,
  computePathRates,
};
