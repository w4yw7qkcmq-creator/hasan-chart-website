const {
  AdaptiveIdleBackoff,
  parsePositiveInt,
  parseMultiplier,
  resolveAdaptiveIdleBounds,
} = require("./lib/adaptive-idle-backoff.js");

const MIN_POLL_INTERVAL_MS = 1000;
const DEFAULT_IDLE_MIN_MS = 2000;
const DEFAULT_EMPTY_MIN_MS = 5000;
const DEFAULT_IDLE_MAX_MS = 30_000;
const DEFAULT_IDLE_BACKOFF_MULTIPLIER = 1.5;

function isOneShotMode(env = process.env) {
  const value = String(env.VIP_STATUS_DELIVERY_WORKER_ONESHOT || "")
    .trim()
    .toLowerCase();

  return value === "1" || value === "true" || value === "yes";
}

function getPersistentWorkerConfig(env = process.env) {
  const emptyBounds = resolveAdaptiveIdleBounds(env, {
    minKey: "VIP_STATUS_DELIVERY_EMPTY_MIN_DELAY_MS",
    maxKey: "VIP_STATUS_DELIVERY_EMPTY_MAX_DELAY_MS",
    legacyMinKey: "VIP_STATUS_DELIVERY_POLL_INTERVAL_MS",
    defaultMinMs: DEFAULT_EMPTY_MIN_MS,
    defaultMaxMs: DEFAULT_IDLE_MAX_MS,
  });

  const activeDelayMs = Math.max(
    MIN_POLL_INTERVAL_MS,
    parsePositiveInt(env.VIP_STATUS_DELIVERY_IDLE_DELAY_MS, DEFAULT_IDLE_MIN_MS)
  );

  const pollIntervalMs = Math.max(
    MIN_POLL_INTERVAL_MS,
    parsePositiveInt(env.VIP_STATUS_DELIVERY_POLL_INTERVAL_MS, DEFAULT_EMPTY_MIN_MS)
  );

  return {
    pollIntervalMs,
    activeDelayMs,
    errorDelayMs: parsePositiveInt(env.VIP_STATUS_DELIVERY_ERROR_DELAY_MS, 5000),
    emptyDelayMinMs: emptyBounds.minMs,
    emptyDelayMaxMs: emptyBounds.maxMs,
    idleBackoffMultiplier: parseMultiplier(
      env.VIP_STATUS_DELIVERY_IDLE_BACKOFF_MULTIPLIER,
      DEFAULT_IDLE_BACKOFF_MULTIPLIER
    ),
    // Legacy alias: empty polling minimum when queue is idle.
    idleDelayMs: activeDelayMs,
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
    "processed",
    "delivered",
    "failed",
    "queued",
    "durationMs",
    "sleepMs",
    "consecutiveEmptyCycles",
    "idleDelayMs",
    "nextIdleDelayMs",
    "pollIntervalMs",
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

async function runPersistentVipStatusDeliveryLoop({
  runCycle,
  sleep = defaultSleep,
  config = getPersistentWorkerConfig(),
  shouldStop = () => false,
  idleBackoff = new AdaptiveIdleBackoff({
    minMs: config.emptyDelayMinMs ?? config.pollIntervalMs ?? DEFAULT_EMPTY_MIN_MS,
    maxMs: config.emptyDelayMaxMs ?? DEFAULT_IDLE_MAX_MS,
    multiplier: config.idleBackoffMultiplier ?? DEFAULT_IDLE_BACKOFF_MULTIPLIER,
  }),
}) {
  let cycleNumber = 0;

  logPersistentEvent("VIP_STATUS_DELIVERY_PERSISTENT_LOOP_STARTED", {
    pollIntervalMs: config.emptyDelayMinMs,
    idleDelayMs: config.activeDelayMs,
    nextIdleDelayMs: config.emptyDelayMaxMs,
  });

  while (!shouldStop()) {
    cycleNumber += 1;
    const startedAt = Date.now();

    try {
      const summary = await runCycle();
      const claimed = Number(summary?.claimed || 0);
      let sleepMs = 0;
      let idleMeta = null;

      if (claimed > 0) {
        idleBackoff.recordWork();
        sleepMs = config.activeDelayMs;
      } else {
        idleMeta = idleBackoff.recordEmpty();
        sleepMs = idleMeta.sleepMs;
      }

      logPersistentEvent("VIP_STATUS_DELIVERY_PERSISTENT_CYCLE_FINISHED", {
        cycleNumber,
        claimed: summary?.claimed ?? 0,
        processed: summary?.processed ?? 0,
        delivered: summary?.delivered ?? 0,
        failed: summary?.failed ?? 0,
        queued: summary?.queued ?? 0,
        durationMs: Date.now() - startedAt,
        sleepMs,
        consecutiveEmptyCycles: idleMeta?.consecutiveEmptyCycles ?? 0,
        idleDelayMs: idleMeta?.delayMs ?? config.activeDelayMs,
        nextIdleDelayMs: idleMeta?.nextDelayMs ?? config.emptyDelayMinMs,
      });

      await sleep(sleepMs);
    } catch (error) {
      logPersistentEvent("VIP_STATUS_DELIVERY_PERSISTENT_CYCLE_FAILED", {
        level: "error",
        cycleNumber,
        error: error?.message || String(error),
        durationMs: Date.now() - startedAt,
        sleepMs: config.errorDelayMs,
      });
      await sleep(config.errorDelayMs);
    }
  }

  logPersistentEvent("VIP_STATUS_DELIVERY_PERSISTENT_LOOP_STOPPED", { cycleNumber });
}

module.exports = {
  isOneShotMode,
  getPersistentWorkerConfig,
  runPersistentVipStatusDeliveryLoop,
};
