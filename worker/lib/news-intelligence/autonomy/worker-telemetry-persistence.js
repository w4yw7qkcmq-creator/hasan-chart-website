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
