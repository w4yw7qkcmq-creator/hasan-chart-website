const ROLLING_WINDOW_MS = 24 * 60 * 60 * 1000;
const WINDOW_KEY = "rss_chart_image_policy";

let memoryState = {
  lastChartPublishedAt: null,
};

const telemetry = {
  chartImageCandidates: 0,
  chartImagesPublished: 0,
  chartImagesRateLimited: 0,
  chartFallbackSourcePhoto: 0,
  chartFallbackTextOnly: 0,
};

async function loadChartPolicyState(options = {}) {
  if (options.stateOverride) return { ...options.stateOverride };
  if (options.supabase) {
    try {
      const { data } = await options.supabase
        .from("news_system_metric_snapshots")
        .select("metrics,bucket_start")
        .eq("window_key", WINDOW_KEY)
        .order("bucket_start", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.metrics?.lastChartPublishedAt) {
        memoryState.lastChartPublishedAt = data.metrics.lastChartPublishedAt;
      }
    } catch (_) {
      // non-blocking
    }
  }
  return { ...memoryState };
}

async function persistChartPolicyState(state = {}, options = {}) {
  memoryState = { ...memoryState, ...state };
  if (options.supabase && state.lastChartPublishedAt) {
    try {
      await options.supabase.from("news_system_metric_snapshots").upsert(
        {
          window_key: WINDOW_KEY,
          bucket_start: new Date().toISOString(),
          metrics: { lastChartPublishedAt: state.lastChartPublishedAt },
        },
        { onConflict: "window_key,bucket_start" }
      );
    } catch (_) {
      // non-blocking
    }
  }
  return memoryState;
}

function isChartRateLimited(nowMs = Date.now(), state = {}) {
  const lastAt = state.lastChartPublishedAt ? Date.parse(state.lastChartPublishedAt) : null;
  if (!lastAt || Number.isNaN(lastAt)) return false;
  return nowMs - lastAt < ROLLING_WINDOW_MS;
}

async function recordChartImagePublished(nowMs = Date.now(), options = {}) {
  const state = await loadChartPolicyState(options);
  state.lastChartPublishedAt = new Date(nowMs).toISOString();
  await persistChartPolicyState(state, options);
  telemetry.chartImagesPublished += 1;
  return state;
}

function recordChartCandidate() {
  telemetry.chartImageCandidates += 1;
}

function recordChartRateLimited() {
  telemetry.chartImagesRateLimited += 1;
}

function recordChartFallback(kind = "source_photo") {
  if (kind === "text_only") telemetry.chartFallbackTextOnly += 1;
  else telemetry.chartFallbackSourcePhoto += 1;
}

function getChartPolicyTelemetrySnapshot() {
  return {
    ...telemetry,
    chartImageLastPublishedAt: memoryState.lastChartPublishedAt,
  };
}

function resetChartPolicyStateForTests() {
  memoryState = { lastChartPublishedAt: null };
  telemetry.chartImageCandidates = 0;
  telemetry.chartImagesPublished = 0;
  telemetry.chartImagesRateLimited = 0;
  telemetry.chartFallbackSourcePhoto = 0;
  telemetry.chartFallbackTextOnly = 0;
}

module.exports = {
  ROLLING_WINDOW_MS,
  WINDOW_KEY,
  loadChartPolicyState,
  persistChartPolicyState,
  isChartRateLimited,
  recordChartImagePublished,
  recordChartCandidate,
  recordChartRateLimited,
  recordChartFallback,
  getChartPolicyTelemetrySnapshot,
  resetChartPolicyStateForTests,
};
