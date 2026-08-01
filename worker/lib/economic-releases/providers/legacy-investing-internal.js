const { parseInvestingCalendarRows } = require("./investing-calendar");

function createLegacyInvestingInternalProvider() {
  const metrics = {
    provider: "legacy_investing_internal",
    providerEnabled: false,
    providerStatus: "disabled_policy",
    lastFetchAt: null,
    lastSuccessAt: null,
    lastErrorSafe: "internal_endpoint_not_allowed",
    requestsToday: 0,
    cacheHits: 0,
    http200: 0,
    http304: 0,
    http403: 0,
    http429: 0,
    parserFailures: 0,
    schemaChanges: 0,
    eventsFetched: 0,
    eventsMatched: 0,
    eventsComplete: 0,
    eventsIncomplete: 0,
    sourceConflicts: 0,
    blockedUntil: null,
  };

  async function fetchSchedule() {
    metrics.lastErrorSafe = "internal_endpoint_not_allowed";
    return [];
  }

  async function fetchRelease() {
    return [];
  }

  async function findMatchingRelease() {
    return [];
  }

  async function healthCheck() {
    return {
      provider: metrics.provider,
      enabled: false,
      status: metrics.providerStatus,
      reason: "Uses undocumented POST endpoint getCalendarFilteredData — disabled by policy",
    };
  }

  return {
    name: "legacy_investing_internal",
    priority: 99,
    providerEnabled: false,
    fetchSchedule,
    fetchRelease,
    fetchEvents: fetchSchedule,
    findMatchingRelease,
    healthCheck,
    normalizeEvent: (raw) => raw,
    getMetrics: () => ({ ...metrics }),
    parseInvestingCalendarRows,
  };
}

module.exports = {
  createLegacyInvestingInternalProvider,
};
