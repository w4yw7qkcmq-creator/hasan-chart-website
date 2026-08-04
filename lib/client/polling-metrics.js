/** Dev/QA polling counters — no user data, not exposed in production health. */

const counters = {
  pollingRequestsStarted: 0,
  pollingRequestsSkippedOverlap: 0,
  pollingPausedHidden: 0,
  pollingRetries: 0,
  realtimeEvents: 0,
  fallbackPolls: 0,
};

let debugEnabled = false;

export function setPollingMetricsDebug(enabled) {
  debugEnabled = Boolean(enabled);
}

export function incrementPollingMetric(name, amount = 1) {
  if (!Object.prototype.hasOwnProperty.call(counters, name)) return;
  counters[name] += amount;
  if (debugEnabled && typeof console !== "undefined") {
    console.debug(`[polling-metrics] ${name}=${counters[name]}`);
  }
}

export function getPollingMetricsSnapshot() {
  return { ...counters };
}

export function resetPollingMetrics() {
  for (const key of Object.keys(counters)) {
    counters[key] = 0;
  }
}
