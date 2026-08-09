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
  };
}

function createMetricsAggregator() {
  const globalCounters = createEmptyCounters();
  const bySource = new Map();
  const byEventType = new Map();
  const latencySamples = [];

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
      global: { ...globalCounters },
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
  }

  return {
    recordDecision,
    recordNormalized,
    recordPublicationAllowed,
    recordAiSkipped,
    recordAiFailure,
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
