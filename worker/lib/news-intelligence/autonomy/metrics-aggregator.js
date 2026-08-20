const { REASON_CODES } = require("./reason-taxonomy");

let instance = null;

function createEmptyCounters() {
  return {
    candidates_total: 0,
    events_normalized: 0,
    publications_allowed: 0,
    publications_success: 0,
    duplicates_blocked: 0,
    source_policy_blocked: 0,
    quality_blocked: 0,
    copy_blocked: 0,
    numeric_integrity_blocked: 0,
    image_required_failures: 0,
    family_merged: 0,
    family_timeout: 0,
    rss_fetch_failures: 0,
    telegram_parse_failures: 0,
    delivery_failures: 0,
    delivery_retries: 0,
    incidents_open: 0,
    sources_degraded: 0,
    sources_quarantined: 0,
    ai_calls: 0,
    ai_skipped: 0,
    ai_failures: 0,
    ai_image_attempts: 0,
    ai_image_successes: 0,
    ai_image_failures: 0,
    ai_image_retries: 0,
    branded_fallback_attempts: 0,
    branded_fallback_successes: 0,
    published_with_ai_image: 0,
    published_with_fallback_image: 0,
    published_without_image: 0,
    image_storage_uploaded: 0,
    image_storage_failed: 0,
    rss_source_image_found: 0,
    rss_source_image_missing: 0,
    rss_published_without_image: 0,
  };
}

function createMetricsAggregator() {
  const globalCounters = createEmptyCounters();
  const bySource = new Map();
  const byEventType = new Map();
  const latencySamples = [];
  const aiProviderLatencySamples = [];
  const imageWorkflowLatencySamples = [];

  function bump(map, key, field, amount = 1) {
    if (!key) return;
    if (!map.has(key)) map.set(key, createEmptyCounters());
    map.get(key)[field] = (map.get(key)[field] || 0) + amount;
  }

  function recordDecision(record = {}) {
    globalCounters.candidates_total += 1;
    const sourceKey = record.sourceId ? `${record.sourceType || "unknown"}:${record.sourceId}` : null;
    bump(bySource, sourceKey, "candidates_total");
    bump(byEventType, record.eventType, "candidates_total");

    switch (record.reasonCode) {
      case REASON_CODES.PUBLISHED:
        globalCounters.publications_success += 1;
        bump(bySource, sourceKey, "publications_success");
        break;
      case REASON_CODES.DUPLICATE_BLOCKED:
        globalCounters.duplicates_blocked += 1;
        bump(bySource, sourceKey, "duplicates_blocked");
        break;
      case REASON_CODES.SOURCE_NOT_ALLOWED:
      case REASON_CODES.RSS_ECONOMIC_PUBLISH_FORBIDDEN:
      case REASON_CODES.SOURCE_QUARANTINED:
        globalCounters.source_policy_blocked += 1;
        bump(bySource, sourceKey, "source_policy_blocked");
        break;
      case REASON_CODES.QUALITY_GATE_BLOCKED:
        globalCounters.quality_blocked += 1;
        break;
      case REASON_CODES.SOURCE_COPY_SIMILARITY_TOO_HIGH:
      case REASON_CODES.RSS_EDITORIAL_BLOCKED:
        globalCounters.copy_blocked += 1;
        break;
      case REASON_CODES.HALLUCINATED_NUMERIC_TOKEN:
        globalCounters.numeric_integrity_blocked += 1;
        break;
      case REASON_CODES.IMAGE_REQUIRED_UNAVAILABLE:
        globalCounters.image_required_failures += 1;
        break;
      case REASON_CODES.FAMILY_MERGED:
        globalCounters.family_merged += 1;
        break;
      case REASON_CODES.AGGREGATION_TIMEOUT:
        globalCounters.family_timeout += 1;
        break;
      case REASON_CODES.DELIVERY_FAILED:
        globalCounters.delivery_failures += 1;
        break;
      case REASON_CODES.DELIVERY_RETRIED:
        globalCounters.delivery_retries += 1;
        break;
      default:
        break;
    }

    if (record.latency?.totalMs != null) {
      latencySamples.push(record.latency.totalMs);
      if (latencySamples.length > 500) latencySamples.shift();
    }

    if (record.aiUsed) globalCounters.ai_calls += 1;
  }

  function recordNormalized(eventType) {
    globalCounters.events_normalized += 1;
    bump(byEventType, eventType, "events_normalized");
  }

  function recordPublicationAllowed() {
    globalCounters.publications_allowed += 1;
  }

  function recordAiSkipped() {
    globalCounters.ai_skipped += 1;
  }

  function recordAiFailure() {
    globalCounters.ai_failures += 1;
  }

  function recordImageTelemetry(telemetry = {}) {
    if (telemetry.aiImageAttempted) globalCounters.ai_image_attempts += 1;
    if (telemetry.aiImageSucceeded) globalCounters.ai_image_successes += 1;
    if (telemetry.aiImageFailed) globalCounters.ai_image_failures += 1;
    if (telemetry.aiImageRetryCount) globalCounters.ai_image_retries += telemetry.aiImageRetryCount;
    if (telemetry.brandedFallbackAttempted) globalCounters.branded_fallback_attempts += 1;
    if (telemetry.brandedFallbackSucceeded) globalCounters.branded_fallback_successes += 1;
    if (telemetry.publishedWithAiImage) globalCounters.published_with_ai_image += 1;
    if (telemetry.publishedWithFallbackImage) globalCounters.published_with_fallback_image += 1;
    if (telemetry.publishedWithoutImage) globalCounters.published_without_image += 1;
    if (telemetry.imageStorageUploaded) globalCounters.image_storage_uploaded += 1;
    if (telemetry.imageStorageFailed) globalCounters.image_storage_failed += 1;
    if (telemetry.sourceImageFound) globalCounters.rss_source_image_found += 1;
    if (telemetry.sourceImageMissing) globalCounters.rss_source_image_missing += 1;
    if (telemetry.rssPublishedWithoutImage) globalCounters.rss_published_without_image += 1;

    const providerLatency = Number(telemetry.providerRequestMs || telemetry.aiImageLatencyMs || 0);
    if (telemetry.aiImageAttempted && providerLatency > 0) {
      aiProviderLatencySamples.push(providerLatency);
      if (aiProviderLatencySamples.length > 500) aiProviderLatencySamples.shift();
    }

    const workflowLatency = Number(telemetry.totalImageWorkflowMs || 0);
    if (workflowLatency > 0) {
      imageWorkflowLatencySamples.push(workflowLatency);
      if (imageWorkflowLatencySamples.length > 500) imageWorkflowLatencySamples.shift();
    }
  }

  function averageSample(samples = []) {
    if (!samples.length) return null;
    return Math.round(samples.reduce((sum, value) => sum + value, 0) / samples.length);
  }

  function recordRssFetchFailure() {
    globalCounters.rss_fetch_failures += 1;
  }

  function recordTelegramParseFailure(sourceId) {
    globalCounters.telegram_parse_failures += 1;
    bump(bySource, sourceId ? `telegram:${sourceId}` : null, "telegram_parse_failures");
  }

  function setIncidentOpenCount(count) {
    globalCounters.incidents_open = count;
  }

  function setSourceHealthCounts({ degraded = 0, quarantined = 0 } = {}) {
    globalCounters.sources_degraded = degraded;
    globalCounters.sources_quarantined = quarantined;
  }

  function getSnapshot() {
    const latency = latencySamples.length
      ? {
          avgMs: Math.round(latencySamples.reduce((a, b) => a + b, 0) / latencySamples.length),
          p95Ms: latencySamples.slice().sort((a, b) => a - b)[Math.floor(latencySamples.length * 0.95)] || null,
          samples: latencySamples.length,
        }
      : { avgMs: null, p95Ms: null, samples: 0 };

    return {
      global: {
        ...globalCounters,
        ai_image_latency_avg_ms: averageSample(aiProviderLatencySamples),
        image_workflow_latency_avg_ms: averageSample(imageWorkflowLatencySamples),
      },
      bySource: Object.fromEntries(bySource.entries()),
      byEventType: Object.fromEntries(byEventType.entries()),
      latency,
    };
  }

  function resetForTests() {
    for (const key of Object.keys(globalCounters)) globalCounters[key] = 0;
    bySource.clear();
    byEventType.clear();
    latencySamples.length = 0;
    aiProviderLatencySamples.length = 0;
    imageWorkflowLatencySamples.length = 0;
  }

  return {
    recordDecision,
    recordNormalized,
    recordPublicationAllowed,
    recordAiSkipped,
    recordAiFailure,
    recordImageTelemetry,
    recordRssFetchFailure,
    recordTelegramParseFailure,
    setIncidentOpenCount,
    setSourceHealthCounts,
    getSnapshot,
    resetForTests,
  };
}

function getMetricsAggregator() {
  if (!instance) instance = createMetricsAggregator();
  return instance;
}

function resetMetricsAggregatorForTests() {
  instance = null;
}

module.exports = {
  createMetricsAggregator,
  getMetricsAggregator,
  resetMetricsAggregatorForTests,
};
