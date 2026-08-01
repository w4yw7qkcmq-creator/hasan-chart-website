function createEconomicReleaseCycleMetrics() {
  return {
    economicEventsDetected: 0,
    economicEventsMatched: 0,
    economicEventsComplete: 0,
    economicEventsPending: 0,
    economicEventsPublished: 0,
    economicEventsDroppedIncomplete: 0,
    economicEventsConflict: 0,
    economicProviderBlocked: false,
    economicParserFailures: 0,
    providerMetrics: [],
  };
}

function mergeProviderMetricsIntoCycle(cycleMetrics, providerMetrics) {
  cycleMetrics.providerMetrics = providerMetrics;

  for (const metrics of providerMetrics) {
    if (metrics.providerStatus === "provider_blocked" || metrics.blockedUntil) {
      cycleMetrics.economicProviderBlocked = true;
    }
    cycleMetrics.economicParserFailures += metrics.parserFailures || 0;
    cycleMetrics.economicEventsMatched += metrics.eventsMatched || 0;
  }
}

function recordEconomicCycleDetection(cycleMetrics, { detected = 0, matched = 0, complete = 0, pending = 0, published = 0, dropped = 0, conflict = 0 } = {}) {
  cycleMetrics.economicEventsDetected += detected;
  cycleMetrics.economicEventsMatched += matched;
  cycleMetrics.economicEventsComplete += complete;
  cycleMetrics.economicEventsPending += pending;
  cycleMetrics.economicEventsPublished += published;
  cycleMetrics.economicEventsDroppedIncomplete += dropped;
  cycleMetrics.economicEventsConflict += conflict;
}

module.exports = {
  createEconomicReleaseCycleMetrics,
  mergeProviderMetricsIntoCycle,
  recordEconomicCycleDetection,
};
