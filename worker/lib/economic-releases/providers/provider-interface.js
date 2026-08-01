const { normalizeEconomicFieldValue } = require("../normalize");

const UNIFIED_EVENT_FIELDS = [
  "provider",
  "providerEventId",
  "canonicalEventKey",
  "country",
  "title",
  "scheduledAt",
  "period",
  "previous",
  "revisedPrevious",
  "forecast",
  "actual",
  "unit",
  "importance",
  "sourceTimestamp",
];

function createBaseProviderMetrics(providerName) {
  return {
    provider: providerName,
    providerEnabled: true,
    providerStatus: "idle",
    lastFetchAt: null,
    lastSuccessAt: null,
    lastErrorSafe: null,
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
    _delayTotalMs: 0,
    _delayCount: 0,
  };
}

function normalizeProviderEvent(raw = {}) {
  const event = {
    provider: raw.provider || raw.sourceName || "unknown",
    providerEventId: raw.providerEventId || raw.eventId || null,
    canonicalEventKey: raw.canonicalEventKey || raw.eventKey || null,
    country: raw.country || "US",
    title: raw.title || null,
    scheduledAt: raw.scheduledAt || null,
    period: raw.period || null,
    previous: raw.previous ?? null,
    revisedPrevious: raw.revisedPrevious ?? null,
    forecast: raw.forecast ?? null,
    actual: raw.actual ?? null,
    unit: raw.unit || null,
    importance: raw.importance || null,
    sourceTimestamp: raw.sourceTimestamp || new Date().toISOString(),
    sourceName: raw.sourceName || raw.provider || "unknown",
  };

  return event;
}

function toLegacyProviderShape(unifiedEvent) {
  return {
    eventKey: unifiedEvent.canonicalEventKey,
    title: unifiedEvent.title,
    country: unifiedEvent.country,
    scheduledAt: unifiedEvent.scheduledAt,
    previous: unifiedEvent.previous,
    revisedPrevious: unifiedEvent.revisedPrevious,
    forecast: unifiedEvent.forecast,
    actual: unifiedEvent.actual,
    unit: unifiedEvent.unit,
    importance: unifiedEvent.importance,
    sourceName: unifiedEvent.sourceName || unifiedEvent.provider,
    sourceTimestamp: unifiedEvent.sourceTimestamp,
    providerEventId: unifiedEvent.providerEventId,
    period: unifiedEvent.period,
  };
}

function hasNumericOrDisplayTriple(event) {
  const previous = normalizeEconomicFieldValue(event?.previous);
  const revised = normalizeEconomicFieldValue(event?.revisedPrevious);
  const forecast = normalizeEconomicFieldValue(event?.forecast);
  const actual = normalizeEconomicFieldValue(event?.actual);

  const hasPrevious = !previous.isMissing || !revised.isMissing;
  return {
    hasPrevious,
    hasForecast: !forecast.isMissing,
    hasActual: !actual.isMissing,
    complete: hasPrevious && !forecast.isMissing && !actual.isMissing,
  };
}

module.exports = {
  UNIFIED_EVENT_FIELDS,
  createBaseProviderMetrics,
  normalizeProviderEvent,
  toLegacyProviderShape,
  hasNumericOrDisplayTriple,
};
