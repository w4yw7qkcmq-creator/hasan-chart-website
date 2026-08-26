const HEARTBEAT_WINDOW_KEY = "worker_heartbeat";
const PUBLIC_CHART_QUOTA_WINDOW_KEY = "public_chart_quota";
const PUBLIC_CHART_QUOTA_AUTHORITY_BUCKET = "1970-01-01T00:00:00.000Z";
const CHART_ROLLING_WINDOW_MS = 24 * 60 * 60 * 1000;

function isCanaryDecision(row = {}) {
  const metadata = row.metadata || {};
  return (
    metadata.canary === true ||
    metadata.test === true ||
    metadata.synthetic === true ||
    metadata.replay === true ||
    row.decision === "REPLAY" ||
    String(row.correlation_id || "").startsWith("CANARY-")
  );
}

function isProductionDecision(row = {}) {
  return !isCanaryDecision(row);
}

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
    evidenceSummary: row.evidence_summary || null,
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

function isChartWithinRollingWindow(lastAtIso, nowMs = Date.now()) {
  const lastAt = lastAtIso ? Date.parse(lastAtIso) : null;
  if (!lastAt || Number.isNaN(lastAt)) return false;
  return nowMs - lastAt < CHART_ROLLING_WINDOW_MS;
}

function computeNextChartEligibleAt(lastAtIso) {
  const lastAt = lastAtIso ? Date.parse(lastAtIso) : null;
  if (!lastAt || Number.isNaN(lastAt)) return null;
  return new Date(lastAt + CHART_ROLLING_WINDOW_MS).toISOString();
}

async function loadPublicChartQuotaAuthoritySnapshot(supabase) {
  try {
    const { data, error } = await supabase
      .from("news_system_metric_snapshots")
      .select("metrics,bucket_start,created_at")
      .eq("window_key", PUBLIC_CHART_QUOTA_WINDOW_KEY)
      .eq("bucket_start", PUBLIC_CHART_QUOTA_AUTHORITY_BUCKET)
      .maybeSingle();

    if (error) {
      return { snapshot: null, queryFailed: true, rowMissing: false, error: error.message };
    }
    return { snapshot: data || null, queryFailed: false, rowMissing: !data, error: null };
  } catch (error) {
    return {
      snapshot: null,
      queryFailed: true,
      rowMissing: false,
      error: error?.message || "authority_query_failed",
    };
  }
}

function buildChartVisualPolicyReadModel(authorityLoad = {}, heartbeatChartPolicy = null) {
  const authoritySnapshot = authorityLoad.snapshot || null;
  const metrics = authoritySnapshot?.metrics || {};
  const lastChartPublishedAt = metrics.lastChartPublishedAt || null;
  const nowMs = Date.now();
  const exhausted = isChartWithinRollingWindow(lastChartPublishedAt, nowMs);
  const chartsInWindow = exhausted && lastChartPublishedAt ? 1 : 0;

  if (authorityLoad.queryFailed) {
    return {
      quotaStatus: "authority_unhealthy",
      chartsPublishedInRolling24h: chartsInWindow,
      lastChartPublishedAt,
      nextChartEligibleAt: exhausted ? computeNextChartEligibleAt(lastChartPublishedAt) : null,
      chartQuotaChecked: metrics.chartQuotaChecked ?? 0,
      chartQuotaGranted: metrics.chartQuotaGranted ?? 0,
      chartQuotaBlocked: metrics.chartQuotaBlocked ?? 0,
      chartFallbackTextOnly: metrics.chartFallbackTextOnly ?? 0,
      chartImagesPublished: chartsInWindow,
      chartImageCandidates: heartbeatChartPolicy?.chartImageCandidates ?? 0,
      chartImagesRateLimited: heartbeatChartPolicy?.chartImagesRateLimited ?? 0,
      chartFallbackSourcePhoto: heartbeatChartPolicy?.chartFallbackSourcePhoto ?? 0,
      authorityHealthy: false,
      authorityMode: "unavailable",
      authorityQueryFailed: true,
      authorityRowMissing: false,
      authorityError: authorityLoad.error || null,
      authorityUpdatedAt: null,
      sourceOfTruth: `news_system_metric_snapshots.${PUBLIC_CHART_QUOTA_WINDOW_KEY}.${PUBLIC_CHART_QUOTA_AUTHORITY_BUCKET}`,
      rollingWindowMs: CHART_ROLLING_WINDOW_MS,
    };
  }

  if (authorityLoad.rowMissing) {
    return {
      quotaStatus: "authority_missing",
      chartsPublishedInRolling24h: 0,
      lastChartPublishedAt: null,
      nextChartEligibleAt: null,
      chartQuotaChecked: 0,
      chartQuotaGranted: 0,
      chartQuotaBlocked: 0,
      chartFallbackTextOnly: 0,
      chartImagesPublished: 0,
      chartImageCandidates: heartbeatChartPolicy?.chartImageCandidates ?? 0,
      chartImagesRateLimited: heartbeatChartPolicy?.chartImagesRateLimited ?? 0,
      chartFallbackSourcePhoto: heartbeatChartPolicy?.chartFallbackSourcePhoto ?? 0,
      authorityHealthy: false,
      authorityMode: "distributed",
      authorityQueryFailed: false,
      authorityRowMissing: true,
      authorityError: null,
      authorityUpdatedAt: null,
      sourceOfTruth: `news_system_metric_snapshots.${PUBLIC_CHART_QUOTA_WINDOW_KEY}.${PUBLIC_CHART_QUOTA_AUTHORITY_BUCKET}`,
      rollingWindowMs: CHART_ROLLING_WINDOW_MS,
    };
  }

  const authorityHealthy = metrics.authorityHealthy !== false;

  return {
    quotaStatus: !authorityHealthy ? "authority_unhealthy" : exhausted ? "exhausted" : "available",
    chartsPublishedInRolling24h: chartsInWindow,
    lastChartPublishedAt,
    nextChartEligibleAt: exhausted ? computeNextChartEligibleAt(lastChartPublishedAt) : null,
    chartQuotaChecked: metrics.chartQuotaChecked ?? heartbeatChartPolicy?.chartQuotaChecked ?? 0,
    chartQuotaGranted: metrics.chartQuotaGranted ?? heartbeatChartPolicy?.chartQuotaGranted ?? 0,
    chartQuotaBlocked: metrics.chartQuotaBlocked ?? heartbeatChartPolicy?.chartQuotaBlocked ?? 0,
    chartFallbackTextOnly: metrics.chartFallbackTextOnly ?? heartbeatChartPolicy?.chartFallbackTextOnly ?? 0,
    chartImagesPublished: chartsInWindow,
    chartImageCandidates: heartbeatChartPolicy?.chartImageCandidates ?? 0,
    chartImagesRateLimited: heartbeatChartPolicy?.chartImagesRateLimited ?? 0,
    chartFallbackSourcePhoto: heartbeatChartPolicy?.chartFallbackSourcePhoto ?? 0,
    authorityHealthy,
    authorityMode: metrics.authorityMode || "distributed",
    authorityQueryFailed: false,
    authorityRowMissing: false,
    authorityError: null,
    authorityUpdatedAt: authoritySnapshot?.created_at || null,
    sourceOfTruth: `news_system_metric_snapshots.${PUBLIC_CHART_QUOTA_WINDOW_KEY}.${PUBLIC_CHART_QUOTA_AUTHORITY_BUCKET}`,
    rollingWindowMs: CHART_ROLLING_WINDOW_MS,
  };
}

async function loadFunnelSnapshots24h(supabase, since) {
  const { data, error } = await supabase
    .from("news_system_metric_snapshots")
    .select("metrics,bucket_start")
    .eq("window_key", HEARTBEAT_WINDOW_KEY)
    .gte("bucket_start", since)
    .order("bucket_start", { ascending: false })
    .limit(500);

  if (error) throw error;
  return data || [];
}

function aggregateFunnelSnapshots(rows = []) {
  const totals = {
    observed: 0,
    evaluated: 0,
    rssNew: 0,
    telegramNew: 0,
    rssEligible: 0,
    publicationsSuccess: 0,
  };

  for (const row of rows) {
    const funnel = row.metrics?.funnel || {};
    totals.observed += (funnel.rssNew || 0) + (funnel.telegramNew || 0);
    totals.evaluated += funnel.editorialEvaluated || 0;
    totals.rssNew += funnel.rssNew || 0;
    totals.telegramNew += funnel.telegramNew || 0;
    totals.rssEligible += funnel.rssEligible || 0;
    totals.publicationsSuccess += funnel.publicationsSuccess || funnel.rssPublished || 0;
  }

  return totals;
}

function summarizeDecisions(recentDecisions, counts) {
  const productionDecisions = (recentDecisions || []).filter(isProductionDecision);
  const latencies = productionDecisions
    .map((d) => d.latency?.totalMs)
    .filter((v) => typeof v === "number");
  const aiCalls = productionDecisions.filter((d) => d.ai_used === true).length;
  const imageMetrics = counts.imageMetrics || {};

  return {
    observed: counts.funnelTotals?.observed || 0,
    evaluated: counts.funnelTotals?.evaluated || 0,
    processed: productionDecisions.length,
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
    imageMetrics,
    editorInChief: counts.heartbeatSnapshot?.metrics?.externalNewsEditor?.global || null,
    editorMode: counts.heartbeatSnapshot?.metrics?.externalNewsEditor?.mode || "SHADOW",
    editorV2: counts.heartbeatSnapshot?.metrics?.editorV2?.global || null,
    editorV2Mode: counts.heartbeatSnapshot?.metrics?.editorV2?.mode || "SHADOW",
    editorV2Samples: counts.heartbeatSnapshot?.metrics?.editorV2?.samples || [],
    chartVisualPolicy: counts.heartbeatSnapshot?.metrics?.chartVisualPolicy || null,
    lastPublication: counts.lastPublished?.[0] || null,
    lastRealPublication: counts.lastRealPublication?.[0] || null,
    heartbeatSnapshot: counts.heartbeatSnapshot || null,
    funnelTotals: counts.funnelTotals || null,
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
    funnelSnapshots,
    publishedNewsCount,
    duplicateCount,
    qualityCount,
    copyCount,
    imageFailureCount,
    lastPublishedNews,
    lastRealPublication,
    economicReleaseCount,
    heartbeatSnapshot,
    chartQuotaAuthorityLoad,
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
      .select(
        "reason_code,decision,latency,source_id,source_type,event_type,decision_at,ai_used,metadata,correlation_id"
      )
      .gte("decision_at", since)
      .order("decision_at", { ascending: false })
      .limit(500),
    loadFunnelSnapshots24h(supabase, since),
    supabase
      .from("published_news")
      .select("*", { count: "exact", head: true })
      .gte("published_at", since),
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
      .from("published_news")
      .select("published_at,title,link")
      .gte("published_at", since)
      .order("published_at", { ascending: false })
      .limit(1),
    supabase
      .from("published_news")
      .select("published_at,title,link")
      .order("published_at", { ascending: false })
      .limit(1),
    supabase
      .from("news_decision_records")
      .select("*", { count: "exact", head: true })
      .eq("event_type", "US_INITIAL_JOBLESS_CLAIMS")
      .eq("reason_code", "PUBLISHED")
      .gte("decision_at", since),
    loadWorkerHeartbeatSnapshot(supabase),
    loadPublicChartQuotaAuthoritySnapshot(supabase),
  ]);

  const queryError = sourceResult.error || incidentResult.error || decisionResult.error;
  if (queryError) {
    throw queryError;
  }

  const productionIncidents = (incidentResult.data || []).filter(
    (row) => !row.evidence_summary?.canary
  );
  const sources = (sourceResult.data || [])
    .filter((row) => row.source_type !== "canary")
    .map(mapSourceRow);
  const incidents = productionIncidents.map(mapIncidentRow);
  const recentDecisions = (decisionResult.data || []).filter(isProductionDecision);
  const funnelTotals = aggregateFunnelSnapshots(funnelSnapshots);
  const imageMetrics = heartbeatSnapshot?.metrics?.global || {};
  const heartbeatChartPolicy = heartbeatSnapshot?.metrics?.chartVisualPolicy || null;
  const chartVisualPolicy = buildChartVisualPolicyReadModel(chartQuotaAuthorityLoad, heartbeatChartPolicy);

  const summary = summarizeDecisions(recentDecisions, {
    publishedCount: publishedNewsCount.count || 0,
    duplicateCount: duplicateCount.count || 0,
    qualityCount: qualityCount.count || 0,
    copyCount: copyCount.count || 0,
    imageFailureCount: imageFailureCount.count || 0,
    lastPublished: lastPublishedNews.data || [],
    lastRealPublication: lastRealPublication.data || [],
    economicReleaseCount: economicReleaseCount.count || 0,
    heartbeatSnapshot,
    funnelTotals,
    imageMetrics,
  });

  const heartbeat = heartbeatSnapshot?.metrics?.heartbeat || {};
  const runtime = buildRuntimeFromHeartbeat(heartbeatSnapshot?.metrics || {});
  const latestFunnel = heartbeatSnapshot?.metrics?.funnel || null;
  const economicLatency = heartbeatSnapshot?.metrics?.economicLatency || null;
  const economicFastLane = heartbeatSnapshot?.metrics?.economicFastLane || null;
  const economicEventImageCache = heartbeatSnapshot?.metrics?.economicEventImageCache || null;

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
      observed: summary.observed,
      evaluated: summary.evaluated,
      processed: summary.evaluated,
      published: summary.published,
      economicReleases: summary.economicReleases,
      duplicatesBlocked: summary.duplicatesBlocked,
      qualityBlocks: summary.qualityBlocks,
      copyBlocks: summary.copyBlocks,
      imageFailures: summary.imageFailures,
      averageLatencyMs: summary.averageLatencyMs,
      p95LatencyMs: summary.p95LatencyMs,
      aiCalls: summary.aiCalls,
      imageMetrics: {
        importantNews: summary.imageMetrics?.candidates_total || summary.evaluated || 0,
        aiImageAttempts: summary.imageMetrics?.ai_image_attempts || 0,
        aiImageSuccesses: summary.imageMetrics?.ai_image_successes || 0,
        aiImageSuccessRate:
          summary.imageMetrics?.ai_image_attempts > 0
            ? Number(
                (
                  (summary.imageMetrics.ai_image_successes / summary.imageMetrics.ai_image_attempts) *
                  100
                ).toFixed(1)
              )
            : null,
        brandedFallbackSuccesses: summary.imageMetrics?.branded_fallback_successes || 0,
        publishedWithoutImage: summary.imageMetrics?.published_without_image || 0,
        averageAiImageLatencyMs: summary.imageMetrics?.ai_image_latency_avg_ms || null,
        averageImageWorkflowLatencyMs: summary.imageMetrics?.image_workflow_latency_avg_ms || null,
        rssSourceImageFound: summary.imageMetrics?.rss_source_image_found || 0,
        rssSourceImageMissing: summary.imageMetrics?.rss_source_image_missing || 0,
        rssPublishedWithoutImage: summary.imageMetrics?.rss_published_without_image || 0,
        rssAiCalls: 0,
      },
    },
    lastPublication: summary.lastPublication,
    lastRealPublication: summary.lastRealPublication,
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
    funnel: {
      rolling24h: funnelTotals,
      latestCycle: latestFunnel,
    },
    openIncidents: incidents,
    aiUsage: {
      calls: summary.aiCalls,
      skipped: summary.imageMetrics?.ai_skipped || null,
      failures: summary.imageMetrics?.ai_failures || null,
      image: summary.imageMetrics || {},
    },
    averageIngestToPublishLatencyMs: summary.averageLatencyMs,
    p95IngestToPublishLatencyMs: summary.p95LatencyMs,
    editorMode: summary.editorMode || "SHADOW",
    editorV2Mode: summary.editorV2Mode || "SHADOW",
    editorV2Samples: summary.editorV2Samples || [],
    chartVisualPolicy,
    economicLatency,
    economicFastLane,
    economicEventImageCache,
    metrics: {
      candidates_total: summary.observed,
      editorial_evaluated: summary.evaluated,
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
    observed: status.last24h.observed,
    evaluated: status.last24h.evaluated,
    processed: status.last24h.evaluated,
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
    funnel: status.funnel,
    lastRealPublication: status.lastRealPublication,
    dataSource: "persisted_telemetry",
  };
}

export { isProductionDecision, isCanaryDecision, buildChartVisualPolicyReadModel };
