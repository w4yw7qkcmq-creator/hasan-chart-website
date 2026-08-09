const { getPhase2RuntimeConfig } = require("../economic-editorial/runtime-config");
const { getPhase3RuntimeConfig } = require("./feature-flags");

let heartbeat = {
  lastCycleStartedAt: null,
  lastCycleCompletedAt: null,
  lastTelegramPollAt: null,
  lastRssPollAt: null,
  lastSuccessfulPublicationAt: null,
  lastEconomicPublicationAt: null,
  lastErrorAt: null,
  lastCycleDurationMs: null,
  runtimeFlags: {},
};

function updateHeartbeat(patch = {}) {
  heartbeat = {
    ...heartbeat,
    ...patch,
    runtimeFlags: {
      phase2: getPhase2RuntimeConfig(),
      phase3: getPhase3RuntimeConfig(),
    },
  };
  return heartbeat;
}

function getHeartbeat() {
  return { ...heartbeat, runtimeFlags: { phase2: getPhase2RuntimeConfig(), phase3: getPhase3RuntimeConfig() } };
}

function resetHeartbeatForTests() {
  heartbeat = {
    lastCycleStartedAt: null,
    lastCycleCompletedAt: null,
    lastTelegramPollAt: null,
    lastRssPollAt: null,
    lastSuccessfulPublicationAt: null,
    lastEconomicPublicationAt: null,
    lastErrorAt: null,
    lastCycleDurationMs: null,
    runtimeFlags: {},
  };
}

module.exports = {
  updateHeartbeat,
  getHeartbeat,
  resetHeartbeatForTests,
};
