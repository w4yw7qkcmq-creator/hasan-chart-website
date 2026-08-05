const metrics = {
  runsTotal: 0,
  runsSucceeded: 0,
  runsFailed: 0,
  dryRuns: 0,
  duplicateRejected: 0,
  machineAuthSuccess: 0,
  machineAuthRejected: 0,
  lastRunAt: null,
  lastSuccessAt: null,
  lastFailureAt: null,
  lastDurationMs: null,
  expiredCount: 0,
  notificationsSent: 0,
  notificationsSkipped: 0,
  callerInvocations: 0,
  callerSuccesses: 0,
  callerFailures: 0,
  callerLastStatus: null,
  callerLastDurationMs: null,
};

function recordRunStart({ dryRun = false } = {}) {
  metrics.runsTotal += 1;
  if (dryRun) metrics.dryRuns += 1;
  metrics.lastRunAt = new Date().toISOString();
}

function recordRunSuccess(summary = {}) {
  metrics.runsSucceeded += 1;
  metrics.lastSuccessAt = new Date().toISOString();
  metrics.lastDurationMs = summary.durationMs ?? null;
  metrics.expiredCount += summary.expired ?? 0;
  metrics.notificationsSent +=
    (summary.emailsSent ?? 0) + (summary.siteNotificationsCreated ?? 0);
  metrics.notificationsSkipped += summary.skippedAlreadyProcessed ?? 0;
}

function recordRunFailure(durationMs = null) {
  metrics.runsFailed += 1;
  metrics.lastFailureAt = new Date().toISOString();
  metrics.lastDurationMs = durationMs;
}

function recordDuplicateRejected() {
  metrics.duplicateRejected += 1;
}

function recordMachineAuthSuccess() {
  metrics.machineAuthSuccess += 1;
}

function recordMachineAuthRejected() {
  metrics.machineAuthRejected += 1;
}

function recordCallerResult({ status, durationMs, success }) {
  metrics.callerInvocations += 1;
  metrics.callerLastStatus = status ?? null;
  metrics.callerLastDurationMs = durationMs ?? null;
  if (success) metrics.callerSuccesses += 1;
  else metrics.callerFailures += 1;
}

function getMetricsSnapshot() {
  return { ...metrics };
}

module.exports = {
  recordRunStart,
  recordRunSuccess,
  recordRunFailure,
  recordDuplicateRejected,
  recordMachineAuthSuccess,
  recordMachineAuthRejected,
  recordCallerResult,
  getMetricsSnapshot,
};
