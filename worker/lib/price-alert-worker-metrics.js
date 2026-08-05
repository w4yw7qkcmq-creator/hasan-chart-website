function createEmptyCycleMetrics() {
  return {
    cyclesTotal: 0,
    cyclesSucceeded: 0,
    cyclesFailed: 0,
    alertsFetched: 0,
    alertsEvaluated: 0,
    alertsTriggered: 0,
    alertsClaimed: 0,
    alertsCompleted: 0,
    duplicateClaimsRejected: 0,
    siteNotificationsSent: 0,
    pushSent: 0,
    pushFailed: 0,
    emailsQueued: 0,
    emailsSent: 0,
    deliveryPartialFailures: 0,
    stalePrices: 0,
    lastCycleAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastDurationMs: null,
  };
}

let metrics = createEmptyCycleMetrics();
let currentCycleInFlight = false;

function getCycleMetrics() {
  return { ...metrics, currentCycleInFlight };
}

function resetCycleMetricsForTests() {
  metrics = createEmptyCycleMetrics();
  currentCycleInFlight = false;
}

function markCycleStart() {
  currentCycleInFlight = true;
  metrics.cyclesTotal += 1;
  metrics.lastCycleAt = new Date().toISOString();
}

function markCycleSuccess(durationMs, partial = {}) {
  currentCycleInFlight = false;
  metrics.cyclesSucceeded += 1;
  metrics.lastSuccessAt = new Date().toISOString();
  metrics.lastDurationMs = durationMs;
  Object.assign(metrics, partial);
}

function markCycleFailed(durationMs, partial = {}) {
  currentCycleInFlight = false;
  metrics.cyclesFailed += 1;
  metrics.lastFailureAt = new Date().toISOString();
  metrics.lastDurationMs = durationMs;
  Object.assign(metrics, partial);
}

function incrementMetric(key, amount = 1) {
  if (typeof metrics[key] !== "number") return;
  metrics[key] += amount;
}

module.exports = {
  createEmptyCycleMetrics,
  getCycleMetrics,
  resetCycleMetricsForTests,
  markCycleStart,
  markCycleSuccess,
  markCycleFailed,
  incrementMetric,
};
