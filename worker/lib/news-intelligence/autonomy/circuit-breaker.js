const { CIRCUIT_BREAKER_DEFAULTS } = require("./config");
const { logAutonomyEvent } = require("./structured-log");

const BREAKER_STATES = Object.freeze({
  CLOSED: "CLOSED",
  OPEN: "OPEN",
  HALF_OPEN: "HALF_OPEN",
});

function createCircuitBreaker(name, options = {}) {
  const config = { ...CIRCUIT_BREAKER_DEFAULTS, ...(options.config || {}) };
  let state = BREAKER_STATES.CLOSED;
  let failures = 0;
  let halfOpenSuccesses = 0;
  let openedAt = 0;

  function getState() {
    if (state === BREAKER_STATES.OPEN && Date.now() - openedAt >= config.openMs) {
      state = BREAKER_STATES.HALF_OPEN;
      halfOpenSuccesses = 0;
    }
    return state;
  }

  function canExecute() {
    const current = getState();
    return current !== BREAKER_STATES.OPEN;
  }

  function recordSuccess() {
    if (getState() === BREAKER_STATES.HALF_OPEN) {
      halfOpenSuccesses += 1;
      if (halfOpenSuccesses >= config.halfOpenSuccessThreshold) {
        state = BREAKER_STATES.CLOSED;
        failures = 0;
        logAutonomyEvent("NEWS_CIRCUIT_BREAKER_CLOSED", { breaker: name });
      }
      return;
    }
    failures = 0;
    state = BREAKER_STATES.CLOSED;
  }

  function recordFailure() {
    failures += 1;
    if (state === BREAKER_STATES.HALF_OPEN) {
      state = BREAKER_STATES.OPEN;
      openedAt = Date.now();
      logAutonomyEvent("NEWS_CIRCUIT_BREAKER_OPEN", { breaker: name, reason: "half_open_failure" });
      return;
    }
    if (failures >= config.failureThreshold) {
      state = BREAKER_STATES.OPEN;
      openedAt = Date.now();
      logAutonomyEvent("NEWS_CIRCUIT_BREAKER_OPEN", { breaker: name, failures });
    }
  }

  function snapshot() {
    return { name, state: getState(), failures, halfOpenSuccesses, openedAt: openedAt || null };
  }

  return { name, canExecute, recordSuccess, recordFailure, snapshot, BREAKER_STATES };
}

function createCircuitBreakerRegistry() {
  const breakers = new Map();

  function get(name, options = {}) {
    if (!breakers.has(name)) breakers.set(name, createCircuitBreaker(name, options));
    return breakers.get(name);
  }

  function snapshotAll() {
    return [...breakers.values()].map((b) => b.snapshot());
  }

  function resetForTests() {
    breakers.clear();
  }

  return { get, snapshotAll, resetForTests };
}

let registry = null;

function getCircuitBreakerRegistry() {
  if (!registry) registry = createCircuitBreakerRegistry();
  return registry;
}

function resetCircuitBreakersForTests() {
  registry = null;
}

module.exports = {
  BREAKER_STATES,
  createCircuitBreaker,
  createCircuitBreakerRegistry,
  getCircuitBreakerRegistry,
  resetCircuitBreakersForTests,
};
