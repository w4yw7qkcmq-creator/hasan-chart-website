const metrics = {
  machineAuthSuccess: 0,
  legacyAuthAttempt: 0,
  legacyAuthRejected: 0,
  missingMachineHeaders: 0,
  crossServiceRejected: 0,
  byServiceAccount: {},
};

function bump(map, key) {
  map[key] = (map[key] || 0) + 1;
}

export function recordMachineAuthSuccess(serviceAccountId) {
  metrics.machineAuthSuccess += 1;
  if (serviceAccountId) bump(metrics.byServiceAccount, String(serviceAccountId));
}

export function recordLegacyAuthAttempt() {
  metrics.legacyAuthAttempt += 1;
}

export function recordLegacyAuthRejected() {
  metrics.legacyAuthRejected += 1;
}

export function recordMissingMachineHeaders() {
  metrics.missingMachineHeaders += 1;
}

export function recordCrossServiceRejected() {
  metrics.crossServiceRejected += 1;
}

export function getMachineAuthMetricsSnapshot() {
  return {
    machineAuthSuccess: metrics.machineAuthSuccess,
    legacyAuthAttempt: metrics.legacyAuthAttempt,
    legacyAuthRejected: metrics.legacyAuthRejected,
    missingMachineHeaders: metrics.missingMachineHeaders,
    crossServiceRejected: metrics.crossServiceRejected,
    byServiceAccount: { ...metrics.byServiceAccount },
  };
}

export function resetMachineAuthMetricsForTests() {
  metrics.machineAuthSuccess = 0;
  metrics.legacyAuthAttempt = 0;
  metrics.legacyAuthRejected = 0;
  metrics.missingMachineHeaders = 0;
  metrics.crossServiceRejected = 0;
  metrics.byServiceAccount = {};
}
