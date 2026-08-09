const { getPhase3RuntimeConfig } = require("./feature-flags");
const { getPhase2RuntimeConfig } = require("../economic-editorial/runtime-config");
const { getHeartbeat } = require("./heartbeat");
const { getMetricsAggregator } = require("./metrics-aggregator");
const { getSourceHealthEngine } = require("./source-health");
const { getOpenIncidents } = require("./incident-engine");
const { getCircuitBreakerRegistry } = require("./circuit-breaker");
const { buildDailyOperationalSummary } = require("./daily-summary");
const { getRecentDecisions } = require("./decision-record");
const { loadOpenIncidentsFromDb } = require("./incident-persistence");

function deriveOverallHealth({ openIncidents = [], sources = [] } = {}) {
  const critical = openIncidents.filter((i) => i.severity === "CRITICAL");
  if (critical.length) return "CRITICAL";
  if (sources.some((s) => s.state === "QUARANTINED")) return "DEGRADED";
  if (openIncidents.some((i) => i.severity === "HIGH")) return "DEGRADED";
  if (sources.some((s) => s.state === "DEGRADED")) return "DEGRADED";
  return "HEALTHY";
}

function getNewsSystemStatus(options = {}) {
  const metrics = getMetricsAggregator().getSnapshot();
  const sources = getSourceHealthEngine().getAllSources();
  const heartbeat = getHeartbeat();
  const openIncidents = getOpenIncidents();

  return {
    overallHealth: deriveOverallHealth({ openIncidents, sources }),
    workerStatus: heartbeat.lastCycleCompletedAt ? "active" : "unknown",
    runtime: {
      phase2: getPhase2RuntimeConfig(options),
      phase3: getPhase3RuntimeConfig(options),
    },
    sources: {
      healthy: sources.filter((s) => s.state === "HEALTHY").length,
      degraded: sources.filter((s) => s.state === "DEGRADED").length,
      quarantined: sources.filter((s) => s.state === "QUARANTINED").length,
      recovering: sources.filter((s) => s.state === "RECOVERING").length,
      details: sources,
    },
    lastEconomicPublicationAt: heartbeat.lastEconomicPublicationAt,
    lastRssPublicationAt: heartbeat.lastRssPollAt,
    duplicateBlocksToday: metrics.global.duplicates_blocked,
    qualityBlocksToday: metrics.global.quality_blocked,
    copyBlocksToday: metrics.global.copy_blocked,
    imageFailuresToday: metrics.global.image_required_failures,
    openIncidents: openIncidents.map((i) => ({
      incidentId: i.incidentId,
      type: i.incidentType,
      severity: i.severity,
      count: i.count,
      affectedSource: i.affectedSource,
      startedAt: i.startedAt,
      lastSeenAt: i.lastSeenAt,
    })),
    aiUsage: {
      calls: metrics.global.ai_calls,
      skipped: metrics.global.ai_skipped,
      failures: metrics.global.ai_failures,
    },
    averageIngestToPublishLatencyMs: metrics.latency.avgMs,
    p95IngestToPublishLatencyMs: metrics.latency.p95Ms,
    lastSuccessfulCycleAt: heartbeat.lastCycleCompletedAt,
    lastCycleDurationMs: heartbeat.lastCycleDurationMs,
    circuitBreakers: getCircuitBreakerRegistry().snapshotAll(),
    heartbeat,
    metrics: metrics.global,
  };
}

async function getNewsSystemStatusFromDb(supabase, options = {}) {
  const runtime = {
    phase2: getPhase2RuntimeConfig(options),
    phase3: getPhase3RuntimeConfig(options),
  };

  if (!supabase) {
    return { ...getNewsSystemStatus(options), dbAvailable: false };
  }

  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();

  try {
    const [
      { data: sourceRows },
      { data: openIncidents },
      { data: recentDecisions },
      { count: publishedCount },
      { count: duplicateCount },
      { count: qualityCount },
      { count: copyCount },
      { data: lastPublished },
    ] = await Promise.all([
      supabase.from("news_source_health_states").select("*").order("updated_at", { ascending: false }),
      supabase.from("news_incidents").select("*").eq("current_state", "open").order("last_seen_at", { ascending: false }).limit(50),
      supabase.from("news_decision_records").select("reason_code,decision,latency,source_id,source_type,event_type,decision_at").gte("decision_at", since).order("decision_at", { ascending: false }).limit(500),
      supabase.from("news_decision_records").select("*", { count: "exact", head: true }).eq("reason_code", "PUBLISHED").gte("decision_at", since),
      supabase.from("news_decision_records").select("*", { count: "exact", head: true }).eq("reason_code", "DUPLICATE_BLOCKED").gte("decision_at", since),
      supabase.from("news_decision_records").select("*", { count: "exact", head: true }).eq("reason_code", "QUALITY_GATE_BLOCKED").gte("decision_at", since),
      supabase.from("news_decision_records").select("*", { count: "exact", head: true }).eq("reason_code", "SOURCE_COPY_SIMILARITY_TOO_HIGH").gte("decision_at", since),
      supabase.from("news_decision_records").select("decision_at,event_type,source_type").eq("reason_code", "PUBLISHED").order("decision_at", { ascending: false }).limit(1),
    ]);

    const sources = (sourceRows || []).map((row) => ({
      sourceType: row.source_type,
      sourceId: row.source_id,
      state: row.state,
      parseSuccessRate: row.evidence?.parseSuccessRate ?? null,
      sourceCausedConsecutive: row.evidence?.sourceCausedConsecutive ?? 0,
      lastSeenAt: row.updated_at,
      stateReason: row.evidence?.stateReason || null,
    }));

    const latencies = (recentDecisions || [])
      .map((d) => d.latency?.totalMs)
      .filter((v) => typeof v === "number");
    const avgLatency = latencies.length
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : null;
    const p95Latency = latencies.length
      ? latencies.slice().sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)] || null
      : null;

    const incidents = (openIncidents || []).map((row) => ({
      incidentId: row.incident_id,
      type: row.incident_type,
      severity: row.severity,
      count: row.count,
      affectedSource: row.affected_source,
      startedAt: row.started_at,
      lastSeenAt: row.last_seen_at,
    }));

    return {
      overallHealth: deriveOverallHealth({ openIncidents: incidents, sources }),
      workerStatus: "db_backed",
      runtime,
      dbAvailable: true,
      sources: {
        healthy: sources.filter((s) => s.state === "HEALTHY").length,
        degraded: sources.filter((s) => s.state === "DEGRADED").length,
        quarantined: sources.filter((s) => s.state === "QUARANTINED").length,
        recovering: sources.filter((s) => s.state === "RECOVERING").length,
        details: sources,
      },
      last24h: {
        processed: (recentDecisions || []).length,
        published: publishedCount || 0,
        duplicatesBlocked: duplicateCount || 0,
        qualityBlocks: qualityCount || 0,
        copyBlocks: copyCount || 0,
        averageLatencyMs: avgLatency,
        p95LatencyMs: p95Latency,
      },
      lastPublication: lastPublished?.[0] || null,
      openIncidents: incidents,
      metrics: {
        candidates_total: (recentDecisions || []).length,
        publications_success: publishedCount || 0,
        duplicates_blocked: duplicateCount || 0,
        quality_blocked: qualityCount || 0,
        copy_blocked: copyCount || 0,
        incidents_open: incidents.length,
      },
    };
  } catch (error) {
    return {
      ...getNewsSystemStatus(options),
      dbAvailable: false,
      dbError: error.message,
    };
  }
}

function getRecentDecisionAudit(limit = 50) {
  return getRecentDecisions().slice(-limit);
}

module.exports = {
  getNewsSystemStatus,
  getNewsSystemStatusFromDb,
  getRecentDecisionAudit,
  buildDailyOperationalSummary,
  deriveOverallHealth,
  loadOpenIncidentsFromDb,
};
