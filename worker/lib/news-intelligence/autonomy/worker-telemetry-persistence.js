const { logAutonomyEvent } = require("./structured-log");
const { getHeartbeat } = require("./heartbeat");
const { getMetricsAggregator } = require("./metrics-aggregator");
const { getCycleFunnel } = require("../../news-ingestion/cycle-funnel");

const HEARTBEAT_WINDOW_KEY = "worker_heartbeat";

function currentHeartbeatBucketStart() {
  const minuteMs = 60_000;
  return new Date(Math.floor(Date.now() / minuteMs) * minuteMs).toISOString();
}

async function flushWorkerTelemetrySnapshot(supabase) {
  if (!supabase) return { flushed: 0, skipped: true };

  const heartbeat = getHeartbeat();
  const metrics = getMetricsAggregator().getSnapshot();
  const row = {
    window_key: HEARTBEAT_WINDOW_KEY,
    bucket_start: currentHeartbeatBucketStart(),
    metrics: {
      heartbeat,
      global: metrics.global,
      latency: metrics.latency,
      funnel: getCycleFunnel(),
      externalNewsEditor: (() => {
        try {
          return require("../../general-rss/external-news-editor/telemetry").getEditorTelemetrySnapshot();
        } catch {
          return null;
        }
      })(),
      chartVisualPolicy: (() => {
        try {
          return require("../../general-rss/chart-visual-policy").getChartPolicyTelemetrySnapshot();
        } catch {
          return null;
        }
      })(),
      editorV2: (() => {
        try {
          return require("../../general-rss/editor-v2/telemetry").getEditorV2TelemetrySnapshot();
        } catch {
          return null;
        }
      })(),
      economicLatency: (() => {
        try {
          return require("../economic-latency-telemetry").getEconomicLatencyMetrics();
        } catch {
          return null;
        }
      })(),
      economicFastLane: (() => {
        try {
          return require("../../telegram-news/economic-fast-lane").getFastLaneRuntimeState();
        } catch {
          return null;
        }
      })(),
      economicEventImageCache: (() => {
        try {
          return require("../event-image-cache-store").getEventImageCacheMetrics();
        } catch {
          return null;
        }
      })(),
    },
  };

  try {
    const { error } = await supabase
      .from("news_system_metric_snapshots")
      .upsert(row, { onConflict: "window_key,bucket_start" });
    if (error) throw error;
    return { flushed: 1, windowKey: HEARTBEAT_WINDOW_KEY };
  } catch (error) {
    logAutonomyEvent("NEWS_WORKER_TELEMETRY_SNAPSHOT_FAILED", {
      error: error.message,
      windowKey: HEARTBEAT_WINDOW_KEY,
    });
    return { flushed: 0, error: error.message, nonBlocking: true };
  }
}

module.exports = {
  HEARTBEAT_WINDOW_KEY,
  flushWorkerTelemetrySnapshot,
};
