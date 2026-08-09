const HEARTBEAT_WINDOW_KEY = "worker_heartbeat";

export function deriveOverallHealth({ openIncidents = [], sources = [] } = {}) {
  const critical = openIncidents.filter((i) => i.severity === "CRITICAL");
  if (critical.length) return "CRITICAL";
  if (sources.some((s) => s.state === "QUARANTINED")) return "DEGRADED";
  if (openIncidents.some((i) => i.severity === "HIGH")) return "DEGRADED";
  if (sources.some((s) => s.state === "DEGRADED")) return "DEGRADED";
  return "HEALTHY";
}

function percentile(values, ratio) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

function mapSourceRow(row) {
  return {
    sourceType: row.source_type,
    sourceId: row.source_id,
    state: row.state,
    parseSuccessRate: row.evidence?.parseSuccessRate ?? null,
    sourceCausedConsecutive: row.evidence?.sourceCausedConsecutive ?? 0,
    lastSeenAt: row.updated_at,
    lastSuccessAt: row.evidence?.lastSuccessAt ?? null,
    stateReason: row.evidence?.stateReason || null,
  };
}

function mapIncidentRow(row) {
  return {
    incidentId: row.incident_id,
    type: row.incident_type,
    severity: row.severity,
    count: row.count,
    affectedSource: row.affected_source,
    affectedEventType: row.affected_event_type,
    startedAt: row.started_at,
    lastSeenAt: row.last_seen_at,
  };
}

function buildRuntimeFromHeartbeat(metrics = {}) {
  const heartbeat = metrics.heartbeat || {};
  const runtimeFlags = heartbeat.runtimeFlags || {};
  return {
    phase2: runtimeFlags.phase2 || {
      phase2Editorial: null,
      phase2Ai: null,
      productionRuntime: null,
      envFlag: null,
      source: "worker_snapshot_unavailable",
    },
    phase3: runtimeFlags.phase3 || {
      phase3Autonomy: null,
      phase3AutoQuarantine: null,
      envAutonomy: null,
      envAutoQuarantine: null,
      source: "worker_snapshot_unavailable",
    },
  };
}

async function loadWorkerHeartbeatSnapshot(supabase) {
  const { data, error } = await supabase
    .from("news_system_metric_snapshots")
    .select("metrics,bucket_start,created_at")
    .eq("window_key", HEARTBEAT_WINDOW_KEY)
    .order("bucket_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

function summarizeDecisions(recentDecisions, counts) {
  const latencies = (recentDecisions || [])
    .map((d) => d.latency?.totalMs)
    .filter((v) => typeof v === "number");
  const aiCalls = (recentDecisions || []).filter((d) => d.ai_used === true).length;

  return {
    processed: (recentDecisions || []).length,
    published: counts.publishedCount || 0,
    economicReleases: counts.economicReleaseCount || 0,
    duplicatesBlocked: counts.duplicateCount || 0,
    qualityBlocks: counts.qualityCount || 0,
    copyBlocks: counts.copyCount || 0,
    imageFailures: counts.imageFailureCount || 0,
    averageLatencyMs: latencies.length
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : null,
    p95LatencyMs: percentile(latencies, 0.95),
    aiCalls,
    lastPublication: counts.lastPublished?.[0] || null,
    heartbeatSnapshot: counts.heartbeatSnapshot || null,
  };
}

export async function getNewsSystemStatusFromDb(supabase) {
  if (!supabase) {
    throw new Error("Supabase client is required for news system status");
  }

  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();

  const [
    sourceResult,
    incidentResult,
    decisionResult,
    publishedCount,
    duplicateCount,
    qualityCount,
    copyCount,
    imageFailureCount,
    lastPublished,
    economicReleaseCount,
    heartbeatSnapshot,
  ] = await Promise.all([
    supabase.from("news_source_health_states").select("*").order("updated_at", { ascending: false }),
    supabase
      .from("news_incidents")
      .select("*")
      .eq("current_state", "open")
      .order("last_seen_at", { ascending: false })
      .limit(50),
    supabase
      .from("news_decision_records")
      .select("reason_code,decision,latency,source_id,source_type,event_type,decision_at,ai_used")
      .gte("decision_at", since)
      .order("decision_at", { ascending: false })
      .limit(500),
    supabase
      .from("news_decision_records")
      .select("*", { count: "exact", head: true })
      .eq("reason_code", "PUBLISHED")
      .gte("decision_at", since),
    supabase
      .from("news_decision_records")
      .select("*", { count: "exact", head: true })
      .eq("reason_code", "DUPLICATE_BLOCKED")
      .gte("decision_at", since),
    supabase
      .from("news_decision_records")
      .select("*", { count: "exact", head: true })
      .eq("reason_code", "QUALITY_GATE_BLOCKED")
      .gte("decision_at", since),
    supabase
      .from("news_decision_records")
      .select("*", { count: "exact", head: true })
      .eq("reason_code", "SOURCE_COPY_SIMILARITY_TOO_HIGH")
      .gte("decision_at", since),
    supabase
      .from("news_decision_records")
      .select("*", { count: "exact", head: true })
      .eq("reason_code", "IMAGE_REQUIRED_UNAVAILABLE")
      .gte("decision_at", since),
    supabase
      .from("news_decision_records")
      .select("decision_at,event_type,source_type")
      .eq("reason_code", "PUBLISHED")
      .order("decision_at", { ascending: false })
      .limit(1),
    supabase
      .from("news_decision_records")
      .select("*", { count: "exact", head: true })
      .eq("event_type", "US_INITIAL_JOBLESS_CLAIMS")
      .eq("reason_code", "PUBLISHED")
      .gte("decision_at", since),
    loadWorkerHeartbeatSnapshot(supabase),
  ]);

  const queryError = sourceResult.error || incidentResult.error || decisionResult.error;
  if (queryError) {
    throw queryError;
  }

  const sources = (sourceResult.data || []).map(mapSourceRow);
  const incidents = (incidentResult.data || []).map(mapIncidentRow);
  const recentDecisions = decisionResult.data || [];
  const summary = summarizeDecisions(recentDecisions, {
    publishedCount: publishedCount.count || 0,
    duplicateCount: duplicateCount.count || 0,
    qualityCount: qualityCount.count || 0,
    copyCount: copyCount.count || 0,
    imageFailureCount: imageFailureCount.count || 0,
    lastPublished: lastPublished.data || [],
    economicReleaseCount: economicReleaseCount.count || 0,
    heartbeatSnapshot,
  });

  const heartbeat = heartbeatSnapshot?.metrics?.heartbeat || {};
  const runtime = buildRuntimeFromHeartbeat(heartbeatSnapshot?.metrics || {});

  return {
    overallHealth: deriveOverallHealth({ openIncidents: incidents, sources }),
    workerStatus: heartbeat.lastCycleCompletedAt ? "active" : "db_backed",
    runtime,
    dbAvailable: true,
    dataSource: "persisted_telemetry",
    sources: {
      healthy: sources.filter((s) => s.state === "HEALTHY").length,
      degraded: sources.filter((s) => s.state === "DEGRADED").length,
      quarantined: sources.filter((s) => s.state === "QUARANTINED").length,
      recovering: sources.filter((s) => s.state === "RECOVERING").length,
      details: sources,
    },
    last24h: {
      processed: summary.processed,
      published: summary.published,
      economicReleases: summary.economicReleases,
      duplicatesBlocked: summary.duplicatesBlocked,
      qualityBlocks: summary.qualityBlocks,
      copyBlocks: summary.copyBlocks,
      imageFailures: summary.imageFailures,
      averageLatencyMs: summary.averageLatencyMs,
      p95LatencyMs: summary.p95LatencyMs,
      aiCalls: summary.aiCalls,
    },
    lastPublication: summary.lastPublication,
    lastSuccessfulCycleAt: heartbeat.lastCycleCompletedAt || null,
    lastCycleDurationMs: heartbeat.lastCycleDurationMs || null,
    heartbeat: {
      lastCycleStartedAt: heartbeat.lastCycleStartedAt || null,
      lastCycleCompletedAt: heartbeat.lastCycleCompletedAt || null,
      lastTelegramPollAt: heartbeat.lastTelegramPollAt || null,
      lastRssPollAt: heartbeat.lastRssPollAt || null,
      lastSuccessfulPublicationAt: heartbeat.lastSuccessfulPublicationAt || null,
      snapshotAt: heartbeatSnapshot?.bucket_start || heartbeatSnapshot?.created_at || null,
    },
    openIncidents: incidents,
    aiUsage: {
      calls: summary.aiCalls,
      skipped: null,
      failures: null,
    },
    averageIngestToPublishLatencyMs: summary.averageLatencyMs,
    p95IngestToPublishLatencyMs: summary.p95LatencyMs,
    metrics: {
      candidates_total: summary.processed,
      publications_success: summary.published,
      duplicates_blocked: summary.duplicatesBlocked,
      quality_blocked: summary.qualityBlocks,
      copy_blocked: summary.copyBlocks,
      image_required_failures: summary.imageFailures,
      incidents_open: incidents.length,
    },
  };
}

export async function buildDailyOperationalSummaryFromDb(supabase, options = {}) {
  const status = await getNewsSystemStatusFromDb(supabase);
  const windowHours = Math.round((options.sinceMs || 24 * 60 * 60_000) / (60 * 60_000));

  return {
    windowHours,
    generatedAt: new Date().toISOString(),
    runtime: status.runtime,
    processed: status.last24h.processed,
    published: status.last24h.published,
    duplicatesBlocked: status.last24h.duplicatesBlocked,
    economicReleases: status.last24h.economicReleases,
    generalRss: Math.max(0, (status.last24h.published || 0) - (status.last24h.economicReleases || 0)),
    failedOrBlocked:
      (status.last24h.qualityBlocks || 0) +
      (status.last24h.copyBlocks || 0) +
      (status.last24h.duplicatesBlocked || 0) +
      (status.last24h.imageFailures || 0),
    sourceHealth: status.sources,
    incidents: {
      open: status.openIncidents.length,
      recent: status.openIncidents,
    },
    imageFallbacks: status.last24h.imageFailures,
    averageLatencyMs: status.last24h.averageLatencyMs,
    aiUsage: status.aiUsage,
    heartbeat: status.heartbeat,
    dataSource: "persisted_telemetry",
  };
}
