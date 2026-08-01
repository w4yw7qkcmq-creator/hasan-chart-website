const SCHEDULE_POLL_MS = Number(process.env.ECONOMIC_SCHEDULE_POLL_MS || 20 * 60 * 1000);
const MIN_SCHEDULE_POLL_MS = 15 * 60 * 1000;
const MAX_SCHEDULE_POLL_MS = 30 * 60 * 1000;

function clampSchedulePollMs(value) {
  return Math.max(MIN_SCHEDULE_POLL_MS, Math.min(MAX_SCHEDULE_POLL_MS, value));
}

function getPollIntervalMs({ scheduledAt, now = Date.now() } = {}) {
  if (!scheduledAt) {
    return clampSchedulePollMs(SCHEDULE_POLL_MS);
  }

  const releaseMs = new Date(scheduledAt).getTime();
  if (Number.isNaN(releaseMs)) {
    return clampSchedulePollMs(SCHEDULE_POLL_MS);
  }

  const deltaMs = releaseMs - now;

  if (deltaMs <= 5 * 60 * 1000 && deltaMs > 60 * 1000) {
    return 60_000;
  }

  if (deltaMs <= 60 * 1000 && deltaMs >= -2 * 60 * 1000) {
    return 15_000;
  }

  if (deltaMs < -2 * 60 * 1000 && deltaMs >= -5 * 60 * 1000) {
    return 30_000;
  }

  if (deltaMs < -5 * 60 * 1000) {
    return clampSchedulePollMs(SCHEDULE_POLL_MS);
  }

  return clampSchedulePollMs(SCHEDULE_POLL_MS);
}

function shouldFetchNow({ lastFetchAt, scheduledAt, now = Date.now() } = {}) {
  const intervalMs = getPollIntervalMs({ scheduledAt, now });
  if (!lastFetchAt) {
    return true;
  }
  return now - lastFetchAt >= intervalMs;
}

module.exports = {
  SCHEDULE_POLL_MS,
  getPollIntervalMs,
  shouldFetchNow,
};
