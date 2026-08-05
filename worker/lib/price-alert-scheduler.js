const PROCESS_STARTED_AT = new Date().toISOString();
const DEPLOYMENT_ID =
  process.env.RAILWAY_DEPLOYMENT_ID || process.env.RAILWAY_REPLICA_ID || null;

let schedulerStarted = false;
let startupRunDone = false;
let intervalTimer = null;
let cycleInFlight = false;

function getProcessMetadata() {
  return {
    processStartedAt: PROCESS_STARTED_AT,
    deploymentId: DEPLOYMENT_ID,
  };
}

function startPriceAlertScheduler({ intervalMs, runCycle, enabled = true }) {
  if (!enabled) {
    return { started: false, reason: "disabled" };
  }
  if (schedulerStarted) {
    return { started: false, reason: "already_started" };
  }
  schedulerStarted = true;

  const scheduleInterval = () => {
    if (intervalTimer) {
      clearTimeout(intervalTimer);
    }
    intervalTimer = setTimeout(async () => {
      if (!cycleInFlight) {
        cycleInFlight = true;
        try {
          await runCycle({ triggerSource: "interval" });
        } finally {
          cycleInFlight = false;
        }
      }
      scheduleInterval();
    }, intervalMs);
    if (typeof intervalTimer.unref === "function") {
      intervalTimer.unref();
    }
  };

  (async () => {
    if (!startupRunDone) {
      startupRunDone = true;
      cycleInFlight = true;
      try {
        await runCycle({ triggerSource: "startup" });
      } finally {
        cycleInFlight = false;
      }
    }
    scheduleInterval();
  })();

  return { started: true, intervalMs, processStartedAt: PROCESS_STARTED_AT, deploymentId: DEPLOYMENT_ID };
}

function resetSchedulerForTests() {
  schedulerStarted = false;
  startupRunDone = false;
  cycleInFlight = false;
  if (intervalTimer) {
    clearTimeout(intervalTimer);
    intervalTimer = null;
  }
}

module.exports = {
  startPriceAlertScheduler,
  getProcessMetadata,
  resetSchedulerForTests,
};
