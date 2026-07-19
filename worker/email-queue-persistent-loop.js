const MIN_POLL_INTERVAL_MS = 1000;

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function isOneShotMode(env = process.env) {
  const value = String(env.EMAIL_QUEUE_WORKER_ONESHOT || "")
    .trim()
    .toLowerCase();

  return value === "1" || value === "true" || value === "yes";
}

function getPersistentWorkerConfig(env = process.env) {
  const pollIntervalMs = Math.max(
    MIN_POLL_INTERVAL_MS,
    parsePositiveInt(env.EMAIL_QUEUE_POLL_INTERVAL_MS, 2000)
  );

  return {
    pollIntervalMs,
    errorDelayMs: parsePositiveInt(env.EMAIL_QUEUE_ERROR_DELAY_MS, 5000),
    idleDelayMs: parsePositiveInt(env.EMAIL_QUEUE_IDLE_DELAY_MS, 2000),
  };
}

function logPersistentEvent(event, meta = {}) {
  const payload = {
    level: meta.level || "info",
    event,
    timestamp: new Date().toISOString(),
  };

  const allowedFields = [
    "cycleNumber",
    "claimed",
    "sent",
    "retried",
    "failed",
    "skipped",
    "durationMs",
    "sleepMs",
  ];

  for (const field of allowedFields) {
    if (meta[field] !== undefined && meta[field] !== null) {
      payload[field] = meta[field];
    }
  }

  if (meta.error) {
    payload.error = meta.error;
  }

  const line = JSON.stringify(payload);

  if (payload.level === "error") {
    console.error(line);
    return;
  }

  console.log(line);
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runPersistentEmailQueueLoop({
  runCycle,
  sleep = defaultSleep,
  config = getPersistentWorkerConfig(),
  shouldStop = () => false,
  onStopping,
} = {}) {
  let cycleNumber = 0;
  let cycleInProgress = false;
  let stopping = false;

  const requestStop = () => {
    stopping = true;
    if (typeof onStopping === "function") {
      onStopping();
    }
  };

  logPersistentEvent("EMAIL_QUEUE_PERSISTENT_WORKER_STARTED");

  while (!stopping) {
    if (cycleInProgress) {
      await sleep(config.pollIntervalMs);
      continue;
    }

    if (shouldStop()) {
      stopping = true;
      break;
    }

    cycleInProgress = true;
    cycleNumber += 1;
    const cycleStartedAt = Date.now();

    logPersistentEvent("EMAIL_QUEUE_PERSISTENT_CYCLE_STARTED", { cycleNumber });

    try {
      const result = await runCycle();
      const summary = result?.summary || {};
      const claimed = Number(summary.claimed || 0);
      const durationMs = Date.now() - cycleStartedAt;

      logPersistentEvent("EMAIL_QUEUE_PERSISTENT_CYCLE_FINISHED", {
        cycleNumber,
        claimed: summary.claimed || 0,
        sent: summary.sent || 0,
        retried: summary.retried || 0,
        failed: summary.failed || 0,
        skipped: summary.skipped || 0,
        durationMs,
      });

      cycleInProgress = false;

      if (stopping || shouldStop()) {
        stopping = true;
        break;
      }

      if (claimed === 0) {
        logPersistentEvent("EMAIL_QUEUE_PERSISTENT_IDLE", {
          cycleNumber,
          sleepMs: config.idleDelayMs,
        });
        await sleep(config.idleDelayMs);
      }
    } catch (error) {
      cycleInProgress = false;

      logPersistentEvent("EMAIL_QUEUE_PERSISTENT_CYCLE_FAILED", {
        cycleNumber,
        level: "error",
        error: error?.message || String(error),
        sleepMs: config.errorDelayMs,
      });

      if (stopping || shouldStop()) {
        stopping = true;
        break;
      }

      await sleep(config.errorDelayMs);
    }
  }

  logPersistentEvent("EMAIL_QUEUE_PERSISTENT_WORKER_STOPPING", { cycleNumber });
  logPersistentEvent("EMAIL_QUEUE_PERSISTENT_WORKER_STOPPED", { cycleNumber });

  return {
    cycleNumber,
    stopped: true,
  };
}

module.exports = {
  MIN_POLL_INTERVAL_MS,
  isOneShotMode,
  getPersistentWorkerConfig,
  logPersistentEvent,
  runPersistentEmailQueueLoop,
};
