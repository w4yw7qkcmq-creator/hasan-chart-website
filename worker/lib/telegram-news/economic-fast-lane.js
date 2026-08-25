const { HIGH_IMPORTANCE } = require("../news-intelligence/economic-editorial/interpretation-catalog");
const { getInterpretationMetadata } = require("../news-intelligence/economic-editorial/interpretation-registry");

const BURST_BEFORE_MS = Number(process.env.TELEGRAM_BURST_BEFORE_MS || 2 * 60 * 1000);
const BURST_AFTER_MS = Number(process.env.TELEGRAM_BURST_AFTER_MS || 3 * 60 * 1000);
const BURST_POLL_MS = Number(process.env.TELEGRAM_BURST_POLL_MS || 3000);

/** @type {Array<{ eventKey: string, scheduledAt: string, importance?: string }>} */
let scheduledEvents = [];

/** @type {{ active: boolean, burstPolls: number, lastCheckedAt: string|null, activeEventKeys: string[] }} */
let runtimeState = {
  active: false,
  burstPolls: 0,
  lastCheckedAt: null,
  activeEventKeys: [],
};

function resetFastLaneStateForTests() {
  scheduledEvents = [];
  runtimeState = {
    active: false,
    burstPolls: 0,
    lastCheckedAt: null,
    activeEventKeys: [],
  };
}

function isHighImpactEventKey(eventKey) {
  if (!eventKey) {
    return false;
  }
  if (HIGH_IMPORTANCE.has(eventKey)) {
    return true;
  }
  const meta = getInterpretationMetadata(eventKey);
  return meta.importance === "HIGH";
}

function registerScheduledEvents(events = []) {
  scheduledEvents = events
    .filter((event) => event?.scheduledAt && (event.eventKey || event.eventType))
    .map((event) => ({
      eventKey: event.eventKey || event.eventType,
      scheduledAt: event.scheduledAt,
      importance: event.importance || (isHighImpactEventKey(event.eventKey || event.eventType) ? "HIGH" : "MEDIUM"),
    }))
    .filter((event) => isHighImpactEventKey(event.eventKey));
}

function getActiveBurstEvents(now = Date.now()) {
  return scheduledEvents.filter((event) => {
    const releaseMs = new Date(event.scheduledAt).getTime();
    if (Number.isNaN(releaseMs)) {
      return false;
    }
    return now >= releaseMs - BURST_BEFORE_MS && now <= releaseMs + BURST_AFTER_MS;
  });
}

function isFastLaneActive(now = Date.now()) {
  const activeEvents = getActiveBurstEvents(now);
  runtimeState.active = activeEvents.length > 0;
  runtimeState.activeEventKeys = activeEvents.map((event) => event.eventKey);
  runtimeState.lastCheckedAt = new Date(now).toISOString();
  return runtimeState.active;
}

function getTelegramBurstPollIntervalMs(now = Date.now()) {
  if (isFastLaneActive(now)) {
    return BURST_POLL_MS;
  }
  return null;
}

function recordBurstPoll(now = Date.now()) {
  if (isFastLaneActive(now)) {
    runtimeState.burstPolls += 1;
  }
}

function getFastLaneRuntimeState() {
  return {
    ...runtimeState,
    scheduledCount: scheduledEvents.length,
    burstBeforeMs: BURST_BEFORE_MS,
    burstAfterMs: BURST_AFTER_MS,
    burstPollMs: BURST_POLL_MS,
  };
}

module.exports = {
  BURST_BEFORE_MS,
  BURST_AFTER_MS,
  BURST_POLL_MS,
  registerScheduledEvents,
  getActiveBurstEvents,
  isFastLaneActive,
  getTelegramBurstPollIntervalMs,
  recordBurstPoll,
  getFastLaneRuntimeState,
  resetFastLaneStateForTests,
  isHighImpactEventKey,
};
