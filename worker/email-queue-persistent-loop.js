const {
  AdaptiveIdleBackoff,
  parsePositiveInt,
  parseMultiplier,
  resolveAdaptiveIdleBounds,
} = require("./lib/adaptive-idle-backoff.js");

const MIN_POLL_INTERVAL_MS = 1000;
const DEFAULT_IDLE_MIN_MS = 2000;
const DEFAULT_IDLE_MAX_MS = 30_000;
const DEFAULT_IDLE_BACKOFF_MULTIPLIER = 1.5;

function isOneShotMode(env = process.env) {
  const value = String(env.EMAIL_QUEUE_WORKER_ONESHOT || "")
    .trim()
    .toLowerCase();

  return value === "1" || value === "true" || value === "yes";
}

function getPersistentWorkerConfig(env = process.env) {
  const { minMs, maxMs } = resolveAdaptiveIdleBounds(env, {
    minKey: "EMAIL_QUEUE_IDLE_MIN_DELAY_MS",
    maxKey: "EMAIL_QUEUE_IDLE_MAX_DELAY_MS",
    legacyMinKey: "EMAIL_QUEUE_IDLE_DELAY_MS",
    defaultMinMs: DEFAULT_IDLE_MIN_MS,
    defaultMaxMs: DEFAULT_IDLE_MAX_MS,
  });

  const pollIntervalMs = Math.max(
    MIN_POLL_INTERVAL_MS,
    parsePositiveInt(env.EMAIL_QUEUE_POLL_INTERVAL_MS, DEFAULT_IDLE_MIN_MS)
  );

  return {
    pollIntervalMs,
    errorDelayMs: parsePositiveInt(env.EMAIL_QUEUE_ERROR_DELAY_MS, 5000),
    idleDelayMinMs: minMs,
    idleDelayMaxMs: maxMs,
    idleBackoffMultiplier: parseMultiplier(
      env.EMAIL_QUEUE_IDLE_BACKOFF_MULTIPLIER,
      DEFAULT_IDLE_BACKOFF_MULTIPLIER
    ),
    // Legacy field preserved for callers/tests expecting idleDelayMs.
    idleDelayMs: minMs,
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
    "consecutiveEmptyCycles",
    "idleDelayMs",
    "nextIdleDelayMs",
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
  idleBackoff = new AdaptiveIdleBackoff({
    minMs: config.idleDelayMinMs ?? config.idleDelayMs ?? DEFAULT_IDLE_MIN_MS,
    maxMs: config.idleDelayMaxMs ?? DEFAULT_IDLE_MAX_MS,
    multiplier: config.idleBackoffMultiplier ?? DEFAULT_IDLE_BACKOFF_MULTIPLIER,
  }),
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

  logPersistentEvent("EMAIL_QUEUE_PERSISTENT_WORKER_STARTED", {
    idleDelayMs: config.idleDelayMinMs,
    nextIdleDelayMs: config.idleDelayMaxMs,
  });

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
        const idle = idleBackoff.recordEmpty();
        logPersistentEvent("EMAIL_QUEUE_PERSISTENT_IDLE", {
          cycleNumber,
          sleepMs: idle.sleepMs,
          consecutiveEmptyCycles: idle.consecutiveEmptyCycles,
          idleDelayMs: idle.delayMs,
          nextIdleDelayMs: idle.nextDelayMs,
        });
        await sleep(idle.sleepMs);
      } else {
        idleBackoff.recordWork();
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
  DEFAULT_IDLE_MIN_MS,
  DEFAULT_IDLE_MAX_MS,
  DEFAULT_IDLE_BACKOFF_MULTIPLIER,
  isOneShotMode,
  getPersistentWorkerConfig,
  logPersistentEvent,
  runPersistentEmailQueueLoop,
};
