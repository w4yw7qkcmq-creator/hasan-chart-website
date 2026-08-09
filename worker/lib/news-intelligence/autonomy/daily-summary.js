const { getMetricsAggregator } = require("./metrics-aggregator");
const { getOpenIncidents, getAllIncidents } = require("./incident-engine");
const { getSourceHealthEngine } = require("./source-health");
const { getHeartbeat } = require("./heartbeat");
const { getPhase3RuntimeConfig } = require("./feature-flags");
const { RETENTION_POLICY } = require("./config");

function buildDailyOperationalSummary(options = {}) {
  const sinceMs = options.sinceMs || 24 * 60 * 60_000;
  const since = Date.now() - sinceMs;
  const metrics = getMetricsAggregator().getSnapshot();
  const incidents = getAllIncidents().filter((i) => new Date(i.startedAt).getTime() >= since);
  const sources = getSourceHealthEngine().getAllSources();
  const heartbeat = getHeartbeat();

  return {
    windowHours: Math.round(sinceMs / (60 * 60_000)),
    generatedAt: new Date().toISOString(),
    runtime: getPhase3RuntimeConfig(options),
    processed: metrics.global.candidates_total,
    published: metrics.global.publications_success,
    duplicatesBlocked: metrics.global.duplicates_blocked,
    economicReleases: metrics.byEventType.US_INITIAL_JOBLESS_CLAIMS?.publications_success || 0,
    generalRss: metrics.global.publications_success - (metrics.byEventType.US_INITIAL_JOBLESS_CLAIMS?.publications_success || 0),
    failedOrBlocked:
      metrics.global.source_policy_blocked +
      metrics.global.quality_blocked +
      metrics.global.copy_blocked +
      metrics.global.numeric_integrity_blocked +
      metrics.global.image_required_failures,
    sourceHealth: {
      healthy: sources.filter((s) => s.state === "HEALTHY").length,
      degraded: sources.filter((s) => s.state === "DEGRADED").length,
      quarantined: sources.filter((s) => s.state === "QUARANTINED").length,
      recovering: sources.filter((s) => s.state === "RECOVERING").length,
      sources,
    },
    incidents: {
      open: getOpenIncidents().length,
      recent: incidents,
    },
    imageFallbacks: metrics.global.image_required_failures,
    averageLatencyMs: metrics.latency.avgMs,
    aiUsage: {
      calls: metrics.global.ai_calls,
      skipped: metrics.global.ai_skipped,
      failures: metrics.global.ai_failures,
    },
    heartbeat,
    retentionPolicy: RETENTION_POLICY,
  };
}

module.exports = {
  buildDailyOperationalSummary,
};
