const metrics = {
  requestsTotal: 0,
  jobsQueued: 0,
  jobsCompleted: 0,
  jobsFailed: 0,
  jobsTimedOut: 0,
  jobsRejected: 0,
  machineAuthSuccess: 0,
  machineAuthRejected: 0,
  marketFetchFailures: 0,
  aiFailures: 0,
  lastJobAt: null,
  lastSuccessAt: null,
  lastFailureAt: null,
  lastDurationMs: null,
  activeJobs: 0,
};

function getAiWorkerMetrics() {
  return { ...metrics, activeJobs: metrics.activeJobs };
}

function markJobQueued() {
  metrics.requestsTotal += 1;
  metrics.jobsQueued += 1;
  metrics.activeJobs += 1;
  metrics.lastJobAt = new Date().toISOString();
}

function markJobCompleted(durationMs) {
  metrics.jobsCompleted += 1;
  metrics.activeJobs = Math.max(0, metrics.activeJobs - 1);
  metrics.lastSuccessAt = new Date().toISOString();
  metrics.lastDurationMs = durationMs;
}

function markJobFailed(errorCode) {
  metrics.jobsFailed += 1;
  metrics.activeJobs = Math.max(0, metrics.activeJobs - 1);
  metrics.lastFailureAt = new Date().toISOString();
  if (errorCode === "TIMEOUT") metrics.jobsTimedOut += 1;
  if (String(errorCode || "").includes("MARKET")) metrics.marketFetchFailures += 1;
  if (String(errorCode || "").includes("AI") || String(errorCode || "").includes("OPENAI")) {
    metrics.aiFailures += 1;
  }
}

function markJobRejected() {
  metrics.jobsRejected += 1;
}

function recordMachineAuthSuccess() {
  metrics.machineAuthSuccess += 1;
}

function recordMachineAuthRejected() {
  metrics.machineAuthRejected += 1;
}

function resetAiWorkerMetricsForTests() {
  for (const key of Object.keys(metrics)) {
    if (key === "activeJobs") metrics[key] = 0;
    else if (typeof metrics[key] === "number") metrics[key] = 0;
    else metrics[key] = null;
  }
}

module.exports = {
  getAiWorkerMetrics,
  markJobQueued,
  markJobCompleted,
  markJobFailed,
  markJobRejected,
  recordMachineAuthSuccess,
  recordMachineAuthRejected,
  resetAiWorkerMetricsForTests,
};
