const MIN_POLL_INTERVAL_MS = 1000;

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

function isOneShotMode(env = process.env) {
  const value = String(env.VIP_STATUS_DELIVERY_WORKER_ONESHOT || "")
    .trim()
    .toLowerCase();

  return value === "1" || value === "true" || value === "yes";
}

function getPersistentWorkerConfig(env = process.env) {
  const pollIntervalMs = Math.max(
    MIN_POLL_INTERVAL_MS,
    parsePositiveInt(env.VIP_STATUS_DELIVERY_POLL_INTERVAL_MS, 2000)
  );

  return {
    pollIntervalMs,
    errorDelayMs: parsePositiveInt(env.VIP_STATUS_DELIVERY_ERROR_DELAY_MS, 5000),
    idleDelayMs: parsePositiveInt(env.VIP_STATUS_DELIVERY_IDLE_DELAY_MS, 2000),
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
}) {
  let cycleNumber = 0;

  logPersistentEvent("VIP_STATUS_DELIVERY_PERSISTENT_LOOP_STARTED", {
    pollIntervalMs: config.pollIntervalMs,
  });

  while (!shouldStop()) {
    cycleNumber += 1;
    const startedAt = Date.now();

    try {
      const summary = await runCycle();
      const sleepMs =
        summary?.claimed > 0 ? config.idleDelayMs : config.pollIntervalMs;

      logPersistentEvent("VIP_STATUS_DELIVERY_PERSISTENT_CYCLE_FINISHED", {
        cycleNumber,
        claimed: summary?.claimed ?? 0,
        processed: summary?.processed ?? 0,
        delivered: summary?.delivered ?? 0,
        failed: summary?.failed ?? 0,
        queued: summary?.queued ?? 0,
        durationMs: Date.now() - startedAt,
        sleepMs,
      });

      await sleep(sleepMs);
    } catch (error) {
      logPersistentEvent("VIP_STATUS_DELIVERY_PERSISTENT_CYCLE_FAILED", {
        level: "error",
        cycleNumber,
        error: error?.message || String(error),
        durationMs: Date.now() - startedAt,
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
